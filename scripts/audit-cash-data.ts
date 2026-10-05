// Read-only consistent snapshot. Contains actual ledger data, never credentials.
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { connectPostgres } from "./postgres";
import {
  cashIntegrityIssuesSql,
  cashReconciliationSql,
} from "../src/modules/financial/reconciliation";
async function main() {
  const c = await connectPostgres("POSTGRES_RUNTIME_URL");
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const identity = (
      await c.query(
        "SELECT current_database() database,current_user role,current_schema() schema",
      )
    ).rows;
    const transactions = (
      await c.query(`SELECT t.*,u.display_name actor,v.display_name void_actor,
    (SELECT json_agg(json_build_object('id',m.id,'amount',m.amount_minor::text,'accountId',a.id,'account',a.name,'currency',a.currency,'active',a.is_active)) FROM financial_movements m JOIN financial_accounts a ON a.id=m.account_id WHERE m.transaction_id=t.id) movements,
    (SELECT json_agg(json_build_object('id',l.id,'action',l.action,'actorId',l.actor_user_id,'before',l.before_json,'after',l.after_json,'date',l.occurred_at)) FROM audit_logs l WHERE l.entity_id=t.id) audits
    FROM financial_transactions t LEFT JOIN users u ON u.id=t.created_by_user_id LEFT JOIN users v ON v.id=t.voided_by_user_id ORDER BY t.created_at,t.id`)
    ).rows;
    const totals = (
      await c.query(`SELECT coalesce(sum(m.amount_minor) FILTER(WHERE t.status<>'DRAFT'),0)::text balance,
    coalesce(sum(m.amount_minor) FILTER(WHERE t.status<>'DRAFT' AND t.type='INCOME' AND t.occurred_at >= '2026-10-01T05:00:00Z' AND t.occurred_at < '2026-11-01T05:00:00Z'),0)::text income,
    coalesce(sum(-m.amount_minor) FILTER(WHERE t.status<>'DRAFT' AND t.type='EXPENSE' AND t.occurred_at >= '2026-10-01T05:00:00Z' AND t.occurred_at < '2026-11-01T05:00:00Z'),0)::text expense FROM financial_transactions t JOIN financial_movements m ON m.transaction_id=t.id`)
    ).rows;
    const migrations = (
      await c.query("SELECT * FROM idm_schema_migrations ORDER BY name")
    ).rows;
    const reconciliation = (await c.query(cashReconciliationSql)).rows;
    const issues = (await c.query(cashIntegrityIssuesSql)).rows;
    const branding = (
      await c.query(
        "SELECT b.*,a.storage_key,a.sha256,a.byte_size,a.width,a.height,octet_length(c.content) stored_bytes FROM application_branding b LEFT JOIN branding_assets a ON a.id=b.app_icon_asset_id LEFT JOIN branding_asset_contents c ON c.asset_id=a.id",
      )
    ).rows;
    await c.query("COMMIT");
    const url = new URL(process.env.POSTGRES_RUNTIME_URL!);
    const report = {
      at: new Date().toISOString(),
      databaseIdentity: createHash("sha256")
        .update(`${url.hostname}/${url.username}/${url.pathname}`)
        .digest("hex"),
      clientTls: Boolean(
        (c as unknown as { connection?: { stream?: { encrypted?: boolean } } })
          .connection?.stream?.encrypted,
      ),
      runtimeHost: new URL(process.env.POSTGRES_RUNTIME_URL!).hostname,
      identity,
      totals,
      reconciliation,
      issues,
      migrations,
      branding,
      transactions,
    };
    await mkdir("backups", { recursive: true });
    await writeFile(
      "backups/audit-cash-2026-10-05.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await c.end();
  }
}
main().catch(() => {
  console.error("Falló la auditoría de lectura; no se modificaron datos.");
  process.exitCode = 1;
});
