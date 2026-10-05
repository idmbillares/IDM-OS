import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pool } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import {
  appIconMimeType,
  appIconUploadMetadataSchema,
  maxAppIconBytes,
  type BrandingSnapshot,
} from "./contracts";
import { validateIconPng } from "./png";
const brandingDirectory = resolve(process.cwd(), "data", "branding");
type Actor = { id: string };
async function authorize(c: { query: typeof pool.query }, actor: Actor) {
  const r = await c.query(
    "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active AND r.key='ADMINISTRADOR'",
    [actor.id],
  );
  if (!r.rowCount) throw new AuthorizationError();
}
function path(key: string) {
  const m = /^branding\/([a-f0-9]{64})\.png$/.exec(key);
  if (!m)
    throw new ValidationError("La referencia del ícono de la aplicación no es válida.");
  return join(brandingDirectory, `${m[1]}.png`);
}
async function store(file: File) {
  if (file.type !== appIconMimeType)
    throw new ValidationError("Formato incorrecto: selecciona una imagen PNG.");
  if (file.size > maxAppIconBytes)
    throw new ValidationError("El archivo supera el máximo de 512 KB.");
  if (
    !appIconUploadMetadataSchema.safeParse({ mimeType: file.type, byteSize: file.size })
      .success
  )
    throw new ValidationError("El archivo PNG está vacío.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { width, height } = validateIconPng(bytes, file.type);
  const sha256 = createHash("sha256").update(bytes).digest("hex"),
    storageKey = `branding/${sha256}.png`;
  return { sha256, storageKey, width, height, byteSize: bytes.length, bytes };
}
export async function getBrandingSnapshot(): Promise<BrandingSnapshot> {
  const r = (
    await pool.query<{ app_icon_asset_id: string | null; revision: number }>(
      "SELECT app_icon_asset_id,revision FROM application_branding WHERE id='default'",
    )
  ).rows[0];
  return { hasCustomIcon: Boolean(r?.app_icon_asset_id), revision: r?.revision ?? 0 };
}
export async function getCurrentAppIcon() {
  const r = (
    await pool.query<{
      mime_type: string;
      sha256: string;
      storage_key: string;
      content: Buffer | null;
    }>(
      "SELECT a.mime_type,a.sha256,a.storage_key,c.content FROM application_branding b JOIN branding_assets a ON a.id=b.app_icon_asset_id LEFT JOIN branding_asset_contents c ON c.asset_id=a.id WHERE b.id='default'",
    )
  ).rows[0];
  if (!r) return null;
  try {
    const bytes = r.content ?? (await readFile(path(r.storage_key)));
    if (createHash("sha256").update(bytes).digest("hex") !== r.sha256) {
      console.error("El activo de marca no coincide con su hash registrado.");
      return null;
    }
    return { bytes, mimeType: r.mime_type };
  } catch (error) {
    console.error("No fue posible leer el activo de marca", error);
    return null;
  }
}
export async function changeApplicationIcon(actor: Actor, file: File) {
  const icon = await store(file),
    c = await pool.connect(),
    now = new Date();
  try {
    await c.query("BEGIN");
    await authorize(c, actor);
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('idm.application_branding.default',0))",
    );
    const current = (
      await c.query<{ app_icon_asset_id: string | null; revision: number }>(
        "SELECT app_icon_asset_id,revision FROM application_branding WHERE id='default' FOR UPDATE",
      )
    ).rows[0];
    const existing = (
      await c.query<{ id: string }>(
        "SELECT id FROM branding_assets WHERE sha256=$1 AND storage_key=$2",
        [icon.sha256, icon.storageKey],
      )
    ).rows[0];
    const assetId = existing?.id ?? randomUUID();
    if (!existing)
      await c.query(
        "INSERT INTO branding_assets(id,storage_key,sha256,mime_type,byte_size,width,height,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          assetId,
          icon.storageKey,
          icon.sha256,
          appIconMimeType,
          icon.byteSize,
          icon.width,
          icon.height,
          now,
          actor.id,
        ],
      );
    await c.query(
      "INSERT INTO branding_asset_contents(asset_id,content) VALUES($1,$2) ON CONFLICT (asset_id) DO NOTHING",
      [assetId, icon.bytes],
    );
    if (current?.app_icon_asset_id === assetId) {
      await c.query("COMMIT");
      return { changed: false, revision: current.revision };
    }
    const revision = (current?.revision ?? 0) + 1;
    if (current)
      await c.query(
        "UPDATE application_branding SET app_icon_asset_id=$1,revision=$2,updated_at=$3,updated_by_user_id=$4 WHERE id='default'",
        [assetId, revision, now, actor.id],
      );
    else
      await c.query(
        "INSERT INTO application_branding(id,app_icon_asset_id,revision,created_at,updated_at,updated_by_user_id) VALUES('default',$1,$2,$3,$3,$4)",
        [assetId, revision, now, actor.id],
      );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at,created_at) VALUES($1,$2,'branding.app_icon_updated','application_branding','default',$3,$4,$5,$5)",
      [
        randomUUID(),
        actor.id,
        JSON.stringify({ appIconAssetId: current?.app_icon_asset_id ?? null }),
        JSON.stringify({ appIconAssetId: assetId, revision }),
        now,
      ],
    );
    await c.query("COMMIT");
    return { changed: true, revision };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function restoreApplicationIcon(actor: Actor) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await authorize(c, actor);
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('idm.application_branding.default',0))",
    );
    const current = (
      await c.query<{ app_icon_asset_id: string | null }>(
        "SELECT app_icon_asset_id FROM application_branding WHERE id='default' FOR UPDATE",
      )
    ).rows[0];
    if (current?.app_icon_asset_id) {
      await c.query(
        "UPDATE application_branding SET app_icon_asset_id=NULL,revision=revision+1,updated_at=now(),updated_by_user_id=$1 WHERE id='default'",
        [actor.id],
      );
      await c.query(
        "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at,created_at) VALUES($1,$2,'branding.app_icon_restored','application_branding','default',$3,$4,now(),now())",
        [
          randomUUID(),
          actor.id,
          JSON.stringify({ appIconAssetId: current.app_icon_asset_id }),
          JSON.stringify({ appIconAssetId: null }),
        ],
      );
    }
    await c.query("COMMIT");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
