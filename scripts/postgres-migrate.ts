import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connectPostgres } from "./postgres";

async function main() {
  const client = await connectPostgres("POSTGRES_MIGRATIONS_URL");
  try {
    await client.query("SELECT 1");
    await client.query(
      "CREATE TABLE IF NOT EXISTS idm_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of readdirSync(resolve("drizzle-postgres"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      const source = readFileSync(resolve("drizzle-postgres", name), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const applied = await client.query<{ checksum: string }>(
        "SELECT checksum FROM idm_schema_migrations WHERE name=$1",
        [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`La migración aplicada ${name} fue alterada.`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query(
          "INSERT INTO idm_schema_migrations(name,checksum) VALUES ($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("PostgreSQL schema migrations: OK");
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
