import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { pool } from "@/db/client";
import { ApplicationLockedError, ValidationError } from "@/lib/errors";
import { z } from "zod";

export const APP_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_PIN_FAILURES = 5,
  PIN_LOCK_DURATION_MS = 15 * 60 * 1000,
  PIN_LENGTH = 6;
const pinSchema = z
  .string()
  .regex(
    new RegExp(`^\\d{${PIN_LENGTH}}$`),
    "El PIN debe tener exactamente 6 dígitos.",
  );
const setupPinSchema = z
  .object({ pin: pinSchema, confirmation: pinSchema })
  .refine((v) => v.pin === v.confirmation, {
    message: "Los PIN no coinciden.",
    path: ["confirmation"],
  });
type Actor = { id: string };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
async function derivePin(pin: string, salt: string) {
  return new Promise<string>((resolve, reject) =>
    nodeScrypt(
      pin,
      salt,
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key.toString("base64"))),
    ),
  );
}
async function audit(
  client: { query: typeof pool.query },
  actorUserId: string,
  action: string,
  now: Date,
) {
  await client.query(
    "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,occurred_at,created_at) VALUES($1,$2,$3,'user',$2,$4,$4)",
    [randomUUID(), actorUserId, action, now],
  );
}
export async function hasPersonalPin(userId: string) {
  return (
    ((await pool.query("SELECT 1 FROM user_pin_credentials WHERE user_id=$1", [userId]))
      .rowCount ?? 0) > 0
  );
}
async function newUnlock(
  client: { query: typeof pool.query },
  actor: Actor,
  now: Date,
) {
  const token = randomBytes(32).toString("base64url");
  await client.query(
    "INSERT INTO app_unlock_sessions(id,user_id,token_hash,created_at,last_active_at,expires_at) VALUES($1,$2,$3,$4,$4,$5)",
    [
      randomUUID(),
      actor.id,
      hashToken(token),
      now,
      new Date(now.getTime() + APP_IDLE_TIMEOUT_MS),
    ],
  );
  await audit(client, actor.id, "auth.app_unlocked", now);
  return token;
}
export async function configurePersonalPin(actor: Actor, raw: unknown) {
  const parsed = setupPinSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Revisa el PIN.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (
      (
        await client.query(
          "SELECT 1 FROM user_pin_credentials WHERE user_id=$1 FOR UPDATE",
          [actor.id],
        )
      ).rowCount
    )
      throw new ValidationError("Ya tienes un PIN configurado.");
    const now = new Date(),
      salt = randomBytes(16).toString("base64url"),
      pinHash = await derivePin(parsed.data.pin, salt);
    await client.query(
      "INSERT INTO user_pin_credentials(user_id,pin_hash,salt,failed_attempts,created_at,updated_at) VALUES($1,$2,$3,0,$4,$4)",
      [actor.id, pinHash, salt, now],
    );
    await audit(client, actor.id, "auth.pin_configured", now);
    const token = await newUnlock(client, actor, now);
    await client.query("COMMIT");
    return token;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function unlockWithPersonalPin(actor: Actor, raw: unknown) {
  const parsed = pinSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Ingresa un PIN válido de 6 dígitos.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const credential = (
      await client.query<{
        pin_hash: string;
        salt: string;
        failed_attempts: number;
        locked_until: Date | null;
      }>(
        "SELECT pin_hash,salt,failed_attempts,locked_until FROM user_pin_credentials WHERE user_id=$1 FOR UPDATE",
        [actor.id],
      )
    ).rows[0];
    if (!credential)
      throw new ValidationError("Primero debes configurar tu PIN personal.");
    const now = new Date();
    if (credential.locked_until && credential.locked_until > now)
      throw new ValidationError(
        "El PIN está bloqueado temporalmente. Inténtalo de nuevo en unos minutos.",
      );
    const valid = timingSafeEqual(
      Buffer.from(await derivePin(parsed.data, credential.salt)),
      Buffer.from(credential.pin_hash),
    );
    if (!valid) {
      const fails = credential.failed_attempts + 1,
        locked =
          fails >= MAX_PIN_FAILURES
            ? new Date(now.getTime() + PIN_LOCK_DURATION_MS)
            : null;
      await client.query(
        "UPDATE user_pin_credentials SET failed_attempts=$1,locked_until=$2,updated_at=$3 WHERE user_id=$4",
        [locked ? 0 : fails, locked, now, actor.id],
      );
      await audit(client, actor.id, "auth.pin_failed", now);
      throw new ValidationError(
        locked
          ? "Demasiados intentos. El PIN está bloqueado durante 15 minutos."
          : "El PIN no es correcto.",
      );
    }
    await client.query(
      "UPDATE user_pin_credentials SET failed_attempts=0,locked_until=NULL,updated_at=$1 WHERE user_id=$2",
      [now, actor.id],
    );
    const token = await newUnlock(client, actor, now);
    await client.query("COMMIT");
    return token;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function requireUnlockedSession(actor: Actor, raw: unknown) {
  if (typeof raw !== "string" || raw.length < 32) throw new ApplicationLockedError();
  const now = new Date();
  const session = (
    await pool.query<{ id: string }>(
      "UPDATE app_unlock_sessions SET last_active_at=$1,expires_at=$2 WHERE user_id=$3 AND token_hash=$4 AND revoked_at IS NULL AND expires_at>$1 RETURNING id",
      [now, new Date(now.getTime() + APP_IDLE_TIMEOUT_MS), actor.id, hashToken(raw)],
    )
  ).rows[0];
  if (!session) throw new ApplicationLockedError();
}
export async function lockPersonalSession(actor: Actor, raw: unknown) {
  if (typeof raw !== "string" || raw.length < 32) return;
  const now = new Date();
  const result = await pool.query(
    "UPDATE app_unlock_sessions SET revoked_at=$1 WHERE user_id=$2 AND token_hash=$3 AND revoked_at IS NULL",
    [now, actor.id, hashToken(raw)],
  );
  if (result.rowCount) await audit(pool, actor.id, "auth.app_locked", now);
}
export async function revokeAllPersonalSessions(
  actor: Actor,
  action: "auth.logout" | "auth.app_locked",
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE app_unlock_sessions SET revoked_at=$1 WHERE user_id=$2 AND revoked_at IS NULL",
      [new Date(), actor.id],
    );
    await audit(client, actor.id, action, new Date());
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
