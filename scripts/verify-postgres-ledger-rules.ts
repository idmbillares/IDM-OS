import { randomUUID } from "node:crypto";
import { postgresClient } from "./postgres";

async function main() {
  const client = postgresClient("POSTGRES_RUNTIME_URL");
  await client.connect();
  try {
    const user = (
      await client.query<{ id: string }>(
        "SELECT id FROM users WHERE is_active=true LIMIT 1",
      )
    ).rows[0];
    const account = (
      await client.query<{ id: string }>(
        "SELECT id FROM financial_accounts WHERE is_active=true LIMIT 1",
      )
    ).rows[0];
    if (!user || !account)
      throw new Error(
        "Se requiere al menos un usuario y una cuenta activa para la verificación.",
      );
    const transactionId = randomUUID();
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO financial_transactions(id,type,status,occurred_at,description,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,'ADJUSTMENT','DRAFT',now(),'verification', $2,now(),now(),$3,$3)",
      [transactionId, randomUUID(), user.id],
    );
    await client.query(
      "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,1,now(),$4)",
      [randomUUID(), transactionId, account.id, user.id],
    );
    await client.query(
      "UPDATE financial_transactions SET status='POSTED',posted_at=now(),updated_at=now() WHERE id=$1",
      [transactionId],
    );
    let immutable = false;
    try {
      await client.query(
        "UPDATE financial_movements SET amount_minor=2 WHERE transaction_id=$1",
        [transactionId],
      );
    } catch {
      immutable = true;
    }
    if (!immutable) throw new Error("El trigger no protegió un movimiento publicado.");
    await client.query("ROLLBACK");
    console.log("PostgreSQL ledger trigger verification: OK");
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
