import "dotenv/config";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@/db/client";
const config = z
  .object({
    IDM_ADMIN_EMAIL: z.string().email(),
    IDM_ADMIN_NAME: z.string().trim().min(2).max(120).default("Felipe Martínez"),
  })
  .parse(process.env);
async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const role = (
      await c.query<{ id: string }>(
        "SELECT id FROM roles WHERE key='ADMINISTRADOR' FOR UPDATE",
      )
    ).rows[0];
    if (!role) throw new Error("No existe el rol ADMINISTRADOR en PostgreSQL.");
    const email = config.IDM_ADMIN_EMAIL.toLowerCase(),
      now = new Date(),
      existing = (
        await c.query<{ id: string }>(
          "SELECT id FROM users WHERE email=$1 FOR UPDATE",
          [email],
        )
      ).rows[0],
      id = existing?.id ?? randomUUID();
    if (existing)
      await c.query(
        "UPDATE users SET display_name=$1,is_active=true,updated_at=$2 WHERE id=$3",
        [config.IDM_ADMIN_NAME, now, id],
      );
    else
      await c.query(
        "INSERT INTO users(id,email,display_name,is_active,created_at,updated_at) VALUES($1,$2,$3,true,$4,$4)",
        [id, email, config.IDM_ADMIN_NAME, now],
      );
    await c.query(
      "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [id, role.id, now],
    );
    await c.query("COMMIT");
    console.log(`Administrador Google ${existing ? "actualizado" : "creado"}.`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Error de aprovisionamiento");
  process.exitCode = 1;
});
