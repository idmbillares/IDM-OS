import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@/db/client";
import { ValidationError } from "@/lib/errors";
const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Indica tu nombre completo.").max(120),
  contactEmail: z.union([
    z.literal(""),
    z.string().trim().email("El correo de contacto no es válido."),
  ]),
  phone: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s()-]{6,22}$/, "El celular no tiene un formato válido."),
  ]),
});
export async function getOwnProfile(userId: string) {
  const r = (
    await pool.query<{
      display_name: string;
      email: string;
      contact_email: string | null;
      phone: string | null;
    }>("SELECT display_name,email,contact_email,phone FROM users WHERE id=$1", [userId])
  ).rows[0];
  return r
    ? {
        displayName: r.display_name,
        email: r.email,
        contactEmail: r.contact_email,
        phone: r.phone,
      }
    : undefined;
}
export async function updateOwnProfile(actor: { id: string }, raw: unknown) {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Revisa los datos del perfil.",
    );
  const current = await getOwnProfile(actor.id);
  if (!current) throw new ValidationError("Tu perfil ya no está disponible.");
  const updated = {
      displayName: parsed.data.displayName,
      contactEmail: parsed.data.contactEmail || null,
      phone: parsed.data.phone.replace(/[^+0-9]/g, "") || null,
    },
    now = new Date(),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "UPDATE users SET display_name=$1,contact_email=$2,phone=$3,updated_at=$4 WHERE id=$5",
      [updated.displayName, updated.contactEmail, updated.phone, now, actor.id],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at,created_at) VALUES($1,$2,'profile.updated','user',$2,$3,$4,$5,$5)",
      [randomUUID(), actor.id, JSON.stringify(current), JSON.stringify(updated), now],
    );
    await c.query("COMMIT");
    return updated;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
