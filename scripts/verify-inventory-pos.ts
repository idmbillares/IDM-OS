import { connectPostgres } from "./postgres";

async function main() {
  const client = await connectPostgres("POSTGRES_RUNTIME_URL");
  try {
    await client.query("BEGIN READ ONLY");
    const counts = (
      await client.query<{
        products: string;
        movements: string;
        cashTransactions: string;
        cashMovements: string;
        posAvailable: boolean;
        batchesAvailable: boolean;
      }>(
        `SELECT (SELECT count(*) FROM inventory_products)::text products,
        (SELECT count(*) FROM inventory_movements)::text movements,
        (SELECT count(*) FROM financial_transactions)::text "cashTransactions",
        (SELECT count(*) FROM financial_movements)::text "cashMovements",
        to_regclass('public.pos_sales') IS NOT NULL "posAvailable",
        to_regclass('public.inventory_opening_batches') IS NOT NULL "batchesAvailable"`,
      )
    ).rows[0];
    const invalidLedger = (
      await client.query<{ count: string }>(
        `SELECT count(*)::text FROM inventory_movements
       WHERE previous_quantity < 0 OR next_quantity < 0
          OR previous_quantity::numeric + quantity::numeric <> next_quantity::numeric
          OR (type IN ('OPENING_BALANCE','ENTRY','POSITIVE_ADJUSTMENT','RETURN','PURCHASE') AND quantity <= 0)
          OR (type IN ('EXIT','NEGATIVE_ADJUSTMENT','SALE') AND quantity >= 0)`,
      )
    ).rows[0].count;
    const invalidBalances = (
      await client.query<{ count: string }>(
        "SELECT count(*)::text FROM (SELECT product_id FROM inventory_movements GROUP BY product_id HAVING sum(quantity) < 0) x",
      )
    ).rows[0].count;
    const duplicateOpenings = (
      await client.query<{ count: string }>(
        "SELECT count(*)::text FROM (SELECT product_id FROM inventory_movements WHERE type='OPENING_BALANCE' GROUP BY product_id HAVING count(*)>1) x",
      )
    ).rows[0].count;
    const result: Record<string, unknown> = {
      products: Number(counts.products),
      movements: Number(counts.movements),
      cashTransactions: Number(counts.cashTransactions),
      cashMovements: Number(counts.cashMovements),
      posAvailable: counts.posAvailable,
      batchesAvailable: counts.batchesAvailable,
      invalidLedger: Number(invalidLedger),
      invalidBalances: Number(invalidBalances),
      duplicateOpenings: Number(duplicateOpenings),
    };
    let issues =
      Number(invalidLedger) + Number(invalidBalances) + Number(duplicateOpenings);
    if (counts.posAvailable) {
      const posIssues = (
        await client.query<{
          badTotals: string;
          overpaid: string;
          invalidPayments: string;
        }>(
          `SELECT
          (SELECT count(*) FROM pos_sales s WHERE s.status<>'DRAFT' AND s.total_minor<>(SELECT coalesce(sum(line_total_minor),0) FROM pos_sale_items WHERE sale_id=s.id))::text "badTotals",
          (SELECT count(*) FROM pos_sales s WHERE (SELECT coalesce(sum(amount_minor),0) FROM pos_sale_payments WHERE sale_id=s.id)>s.total_minor)::text overpaid,
          (SELECT count(*) FROM pos_sale_payments p WHERE NOT EXISTS (
            SELECT 1 FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id
            WHERE t.id=p.financial_transaction_id AND t.status IN ('POSTED','VOIDED')
              AND m.account_id=p.account_id AND m.amount_minor=p.amount_minor
          ))::text "invalidPayments"`,
        )
      ).rows[0];
      result.posIssues = Object.fromEntries(
        Object.entries(posIssues).map(([name, value]) => [name, Number(value)]),
      );
      issues += Object.values(posIssues).reduce((sum, value) => sum + Number(value), 0);
    }
    if (counts.batchesAvailable) {
      const invalidBatches = (
        await client.query<{ count: string }>(
          "SELECT count(*)::text FROM inventory_opening_batches b WHERE b.status='POSTED' AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.opening_batch_id=b.id)",
        )
      ).rows[0].count;
      result.invalidBatches = Number(invalidBatches);
      issues += Number(invalidBatches);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify(result, null, 2));
    if (issues) process.exitCode = 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
