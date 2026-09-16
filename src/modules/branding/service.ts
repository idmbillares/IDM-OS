import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pool } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import {
  appIconMimeType,
  appIconUploadMetadataSchema,
  maxAppIconDimension,
  type BrandingSnapshot,
} from "./contracts";
const brandingDirectory = resolve(process.cwd(), "data", "branding"),
  sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
type Actor = { id: string };
function path(key: string) {
  const m = /^branding\/([a-f0-9]{64})\.png$/.exec(key);
  if (!m)
    throw new ValidationError("La referencia del ícono de la aplicación no es válida.");
  return join(brandingDirectory, `${m[1]}.png`);
}
async function store(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (
    !appIconUploadMetadataSchema.safeParse({
      mimeType: file.type,
      byteSize: bytes.length,
    }).success
  )
    throw new ValidationError("Carga un PNG de hasta 512 KB.");
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(sig) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  )
    throw new ValidationError("El archivo debe ser una imagen PNG válida.");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || width > maxAppIconDimension || height > maxAppIconDimension)
    throw new ValidationError(
      `El ícono debe medir entre 1 y ${maxAppIconDimension} píxeles por lado.`,
    );
  const sha256 = createHash("sha256").update(bytes).digest("hex"),
    storageKey = `branding/${sha256}.png`;
  await mkdir(brandingDirectory, { recursive: true });
  try {
    await writeFile(path(storageKey), bytes, { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const old = await readFile(path(storageKey));
    if (createHash("sha256").update(old).digest("hex") !== sha256)
      throw new ValidationError(
        "No fue posible verificar el archivo de marca existente.",
      );
  }
  return { sha256, storageKey, width, height, byteSize: bytes.length };
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
    await pool.query<{ mime_type: string; sha256: string; storage_key: string }>(
      "SELECT a.mime_type,a.sha256,a.storage_key FROM application_branding b JOIN branding_assets a ON a.id=b.app_icon_asset_id WHERE b.id='default'",
    )
  ).rows[0];
  if (!r) return null;
  try {
    const bytes = await readFile(path(r.storage_key));
    return createHash("sha256").update(bytes).digest("hex") === r.sha256
      ? { bytes, mimeType: r.mime_type }
      : null;
  } catch {
    return null;
  }
}
export async function changeApplicationIcon(actor: Actor, file: File) {
  const icon = await store(file),
    c = await pool.connect(),
    now = new Date();
  try {
    await c.query("BEGIN");
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
