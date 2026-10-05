import assert from "node:assert/strict";
import { postgresClient } from "./postgres";
import {
  cashIntegrityIssuesSql,
  cashReconciliationSql,
} from "../src/modules/financial/reconciliation";

async function main() {
  const c = postgresClient("POSTGRES_RUNTIME_URL");
  await c.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const balances = await c.query<{ consistent: boolean; safe: boolean }>(
      cashReconciliationSql,
    );
    const issues = await c.query(cashIntegrityIssuesSql);
    assert.equal(issues.rowCount, 0, `Integridad: ${JSON.stringify(issues.rows)}`);
    assert.ok(
      balances.rows.every((a) => a.consistent && a.safe),
      "Reconciliación o rango monetario inválido.",
    );
    await c.query("COMMIT");
    console.log(
      `Caja: ${balances.rowCount} cuentas reconciliadas; ledger íntegro. Sin cambios en datos.`,
    );
  } finally {
    await c.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
