import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(".env.local"), quiet: true });
const [binDir, outputFile, connection = "direct"] = process.argv.slice(2);
const rawUrl =
  connection === "session"
    ? process.env.POSTGRES_RUNTIME_URL
    : process.env.POSTGRES_MIGRATIONS_URL;
if (!binDir || !outputFile || !rawUrl || !process.env.POSTGRES_SSL_CERT_FILE)
  throw new Error(
    "Uso: node scripts/backup-postgres.mjs <directorio-pg-bin> <archivo.backup> [direct|session]; configura URL y certificado PostgreSQL.",
  );
const url = new URL(rawUrl);
if (connection === "session") {
  if (!url.hostname.endsWith(".pooler.supabase.com"))
    throw new Error("La URL runtime no corresponde a Supavisor.");
  url.port = "5432";
}
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: "verify-full",
  PGSSLROOTCERT: resolve(process.env.POSTGRES_SSL_CERT_FILE),
};
const output = resolve(outputFile);
mkdirSync(resolve(output, ".."), { recursive: true });
const exe = (name) =>
  resolve(binDir, `${name}${process.platform === "win32" ? ".exe" : ""}`);
const dump = spawnSync(
  exe("pg_dump"),
  ["--format=custom", "--no-owner", "--no-acl", `--file=${output}`],
  { env, stdio: "inherit" },
);
if (dump.status !== 0) throw new Error(`pg_dump terminó con código ${dump.status}.`);
const listing = spawnSync(exe("pg_restore"), ["--list", output], {
  env,
  encoding: "utf8",
});
if (listing.status !== 0 || !listing.stdout.includes("TABLE DATA"))
  throw new Error("El archivo no pasó pg_restore --list.");
console.log(
  `Archivo verificable: ${output} (${statSync(output).size} bytes). La restauración aislada aún debe probarse.`,
);
