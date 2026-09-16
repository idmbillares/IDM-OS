import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

dotenv.config({
  path: resolve(process.cwd(), ".env.local"),
  override: true,
  quiet: true,
});
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

function createPool() {
  const rawUrl = process.env.POSTGRES_RUNTIME_URL;
  const certificatePath = process.env.POSTGRES_SSL_CERT_FILE;
  const certificate =
    process.env.POSTGRES_SSL_CERT ??
    (certificatePath && existsSync(certificatePath)
      ? readFileSync(certificatePath, "utf8")
      : undefined);
  if (!rawUrl || !certificate) {
    throw new Error("PostgreSQL runtime seguro no está configurado.");
  }
  const url = new URL(rawUrl);
  url.searchParams.delete("sslmode");
  return new Pool({
    connectionString: url.toString(),
    max: 10,
    ssl: { ca: certificate, rejectUnauthorized: true },
  });
}

declare global {
  var __idmOsPostgresPool: Pool | undefined;
}
export const pool = globalThis.__idmOsPostgresPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__idmOsPostgresPool = pool;
export const db = drizzle(pool);
export type DatabaseClient = typeof db;
