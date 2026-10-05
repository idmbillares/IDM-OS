import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { normalizePemCertificate } from "@/lib/server-env";
import { operationError } from "@/lib/operation-error";

dotenv.config({
  path: resolve(process.cwd(), ".env.local"),
  quiet: true,
});
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });

function createPool() {
  const rawUrl = process.env.POSTGRES_RUNTIME_URL;
  const certificatePath = process.env.POSTGRES_SSL_CERT_FILE;
  const rawCertificate =
    process.env.POSTGRES_SSL_CERT ??
    (certificatePath && existsSync(certificatePath)
      ? readFileSync(certificatePath, "utf8")
      : undefined);
  if (!rawUrl || !rawCertificate) {
    throw new Error("PostgreSQL runtime seguro no está configurado.");
  }
  const certificate = normalizePemCertificate(rawCertificate);
  let url: URL;
  try {
    url = new URL(rawUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error("POSTGRES_RUNTIME_URL no es una URL PostgreSQL válida.");
  }
  url.searchParams.delete("sslmode");
  // Supavisor transaction mode is required for horizontally scaled Vercel
  // instances. pg queries use unnamed statements and transaction-scoped locks.
  if (
    process.env.VERCEL === "1" &&
    url.hostname.endsWith(".pooler.supabase.com") &&
    url.port !== "6543"
  ) {
    throw new Error("El runtime Supabase requiere el pooler transaccional 6543.");
  }
  const instancePool = new Pool({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    maxLifetimeSeconds: 60,
    ssl: { ca: certificate, rejectUnauthorized: true },
  });
  instancePool.on("error", (error) => {
    operationError("postgres.idle_connection", undefined, error);
  });
  return instancePool;
}

declare global {
  var __idmOsPostgresPool: Pool | undefined;
}
export const pool = globalThis.__idmOsPostgresPool ?? createPool();
globalThis.__idmOsPostgresPool = pool;
export const db = drizzle(pool);
export type DatabaseClient = typeof db;
