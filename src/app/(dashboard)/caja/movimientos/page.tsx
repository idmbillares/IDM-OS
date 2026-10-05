import { LedgerPanel } from "@/components/financial/ledger-panel";
import { PageHeader } from "@/components/ui/page-header";
import { parseHistoryQuery } from "@/modules/financial/history-query";
import { requireCurrentSession } from "@/modules/auth/provider";
import { getFinancialOverview } from "@/modules/financial/ledger";
import { assertCashRead } from "@/modules/financial/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CashMovementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCurrentSession();
  assertCashRead(session);
  const params = await searchParams;
  const { filters, query, error } = parseHistoryQuery(params);
  const overview = await getFinancialOverview(filters);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Caja"
        title="Movimientos"
        description="Consulta, filtra y audita todos los movimientos publicados del ledger."
      />
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"
        >
          {error}
        </p>
      ) : null}
      <LedgerPanel
        {...overview}
        isAdministrator={session.roles.includes("ADMINISTRADOR")}
        query={query}
        showHistory
      />
    </div>
  );
}
