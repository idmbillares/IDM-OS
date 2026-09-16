import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { postgresClient } from "./postgres";

const tables = [
  "users",
  "roles",
  "user_roles",
  "auth_identities",
  "user_pin_credentials",
  "app_unlock_sessions",
  "branding_assets",
  "application_branding",
  "financial_accounts",
  "financial_transactions",
  "financial_movements",
  "audit_logs",
] as const;
const timestampColumns = new Set([
  "created_at",
  "updated_at",
  "assigned_at",
  "locked_until",
  "last_active_at",
  "expires_at",
  "revoked_at",
  "archived_at",
  "occurred_at",
  "posted_at",
  "voided_at",
]);
const booleanColumns = new Set(["is_active"]);
const jsonColumns = new Set(["before_json", "after_json", "metadata_json"]);
const sqlitePath = resolve(
  process.cwd(),
  process.env.DATABASE_URL?.replace(/^file:/, "") ?? "data/idm-os.db",
);

function convert(column: string, value: unknown) {
  if (value === null) return null;
  if (timestampColumns.has(column)) return new Date(Number(value)).toISOString();
  if (booleanColumns.has(column)) return Boolean(value);
  if (jsonColumns.has(column)) {
    try {
      return JSON.parse(String(value));
    } catch {
      throw new Error(`JSON inválido en ${column}; importación detenida.`);
    }
  }
  return value;
}

async function main() {
  if (!existsSync(sqlitePath)) throw new Error("No se encontró la base SQLite origen.");
  const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const client = postgresClient("POSTGRES_RUNTIME_URL");
  try {
    await client.connect();
    await client.query("SELECT 1");
    for (const table of tables) {
      const destination = await client.query(
        `SELECT count(*)::int AS count FROM ${table}`,
      );
      if (destination.rows[0].count !== 0)
        throw new Error(
          `El destino ${table} no está vacío; importación abortada sin sobrescribir datos.`,
        );
    }
    await client.query("BEGIN");
    await client.query("SET LOCAL idm.migration_mode = 'on'");
    for (const table of tables) {
      const columns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String((row as { name: string }).name));
      const rows = source.prepare(`SELECT * FROM ${table}`).all() as Array<
        Record<string, unknown>
      >;
      if (!rows.length) continue;
      const fields = columns.map((column) => `\"${column}\"`).join(",");
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
      const statement = `INSERT INTO ${table} (${fields}) VALUES (${placeholders})`;
      for (const row of rows)
        await client.query(
          statement,
          columns.map((column) => convert(column, row[column])),
        );
    }
    await client.query("COMMIT");
    console.log("SQLite → PostgreSQL import: OK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    source.close();
    await client.end();
  }
}
main();
