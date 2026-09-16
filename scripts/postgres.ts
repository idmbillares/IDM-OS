import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { Client, type ClientConfig } from "pg";

dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: resolve(process.cwd(), ".env") });

export function postgresConfig(
  urlName: "POSTGRES_RUNTIME_URL" | "POSTGRES_MIGRATIONS_URL",
): ClientConfig {
  const connectionString = process.env[urlName];
  const certificatePath = process.env.POSTGRES_SSL_CERT_FILE;
  if (!connectionString || !certificatePath)
    throw new Error(`${urlName} y POSTGRES_SSL_CERT_FILE son obligatorios.`);
  if (!existsSync(certificatePath))
    throw new Error("No se encontró el certificado TLS configurado para PostgreSQL.");
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: { ca: readFileSync(certificatePath, "utf8"), rejectUnauthorized: true },
  };
}

export function postgresClient(
  urlName: "POSTGRES_RUNTIME_URL" | "POSTGRES_MIGRATIONS_URL",
) {
  return new Client(postgresConfig(urlName));
}

/** Direct Supabase hosts are IPv6-only on some networks. The session pooler is
 * a persistent, TLS-verified PostgreSQL endpoint and is the safe migration
 * fallback when that network cannot resolve the direct hostname. */
export async function connectPostgres(
  urlName: "POSTGRES_RUNTIME_URL" | "POSTGRES_MIGRATIONS_URL",
) {
  const primary = postgresClient(urlName);
  try {
    await primary.connect();
    return primary;
  } catch (error) {
    await primary.end().catch(() => undefined);
    if (
      urlName !== "POSTGRES_MIGRATIONS_URL" ||
      !["ENOTFOUND", "EAI_AGAIN"].includes((error as NodeJS.ErrnoException).code ?? "")
    )
      throw error;
    const fallback = postgresClient("POSTGRES_RUNTIME_URL");
    await fallback.connect();
    return fallback;
  }
}
