import Database from "better-sqlite3";
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
const sqlitePath = resolve(
  process.cwd(),
  process.env.DATABASE_URL?.replace(/^file:/, "") ?? "data/idm-os.db",
);
async function main() {
  const source = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const client = postgresClient("POSTGRES_RUNTIME_URL");
  try {
    await client.connect();
    for (const table of tables) {
      const sqliteCount = (
        source.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count;
      const pgCount = (
        await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table}`,
        )
      ).rows[0].count;
      if (sqliteCount !== pgCount)
        throw new Error(`${table}: SQLite=${sqliteCount}, PostgreSQL=${pgCount}`);
      const primaryKeys = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .filter((row) => (row as { pk: number }).pk > 0)
        .sort((a, b) => (a as { pk: number }).pk - (b as { pk: number }).pk)
        .map((row) => String((row as { name: string }).name));
      const order = primaryKeys.map((key) => `\"${key}\"`).join(",");
      const sqliteIds = source
        .prepare(`SELECT ${order} FROM ${table} ORDER BY ${order}`)
        .all()
        .map((row) => JSON.stringify(row))
        .join("|");
      const pgIds = (
        await client.query(`SELECT ${order} FROM ${table} ORDER BY ${order}`)
      ).rows
        .map((row) => JSON.stringify(row))
        .join("|");
      if (sqliteIds !== pgIds)
        throw new Error(`${table}: claves primarias no coinciden`);
    }
    const sqliteBalances = source
      .prepare(
        "SELECT m.account_id, coalesce(sum(CASE WHEN t.status <> 'DRAFT' THEN m.amount_minor ELSE 0 END),0) balance FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id GROUP BY m.account_id ORDER BY m.account_id",
      )
      .all();
    const pgBalances = (
      await client.query(
        "SELECT m.account_id, coalesce(sum(CASE WHEN t.status <> 'DRAFT' THEN m.amount_minor ELSE 0 END),0)::text balance FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id GROUP BY m.account_id ORDER BY m.account_id",
      )
    ).rows;
    if (
      JSON.stringify(
        sqliteBalances.map((x) => {
          const balance = x as { account_id: string; balance: number };
          return { account_id: balance.account_id, balance: String(balance.balance) };
        }),
      ) !== JSON.stringify(pgBalances)
    )
      throw new Error("Los saldos derivados no coinciden.");
    const orphanChecks = [
      "SELECT count(*)::int count FROM user_roles r LEFT JOIN users u ON u.id=r.user_id WHERE u.id IS NULL",
      "SELECT count(*)::int count FROM financial_movements m LEFT JOIN financial_transactions t ON t.id=m.transaction_id WHERE t.id IS NULL",
      "SELECT count(*)::int count FROM financial_movements m LEFT JOIN financial_accounts a ON a.id=m.account_id WHERE a.id IS NULL",
    ];
    for (const query of orphanChecks)
      if ((await client.query<{ count: number }>(query)).rows[0].count)
        throw new Error("Se detectaron relaciones huérfanas.");
    console.log("PostgreSQL migration verification: OK");
  } finally {
    source.close();
    await client.end();
  }
}
main();
