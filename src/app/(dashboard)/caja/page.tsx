import { PageHeader } from "@/components/ui/page-header";
import { FinancialAccountsPanel } from "@/components/financial/financial-accounts-panel";
import { FinancialMetrics, LedgerPanel } from "@/components/financial/ledger-panel";
import { requireCurrentSession } from "@/modules/auth/provider";
import { getFinancialOverview } from "@/modules/financial/ledger";
import Link from "next/link";
import { assertCashRead } from "@/modules/financial/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CashPage() {
  const session = await requireCurrentSession();
  assertCashRead(session);
  const overview = await getFinancialOverview();
  const isAdministrator = session.roles.includes("ADMINISTRADOR");

  return (
    <div className="space-y-8">
      <PageHeader
        description="Registra, consulta y audita la operación diaria de Caja. Los saldos provienen siempre del ledger."
        eyebrow="Operación financiera"
        title="Caja"
      />
      {isAdministrator ? (
        <Link
          href="/configuracion#marca"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800"
        >
          Cambiar logo de IDM OS →
        </Link>
      ) : null}
      <FinancialMetrics
        expenseMinor={overview.expenseMinor}
        incomeMinor={overview.incomeMinor}
        flowNetMinor={overview.flowNetMinor}
        totalAvailableMinor={overview.totalAvailableMinor}
      />
      <LedgerPanel
        {...overview}
        isAdministrator={isAdministrator}
        query=""
        showMetrics={false}
      >
        <FinancialAccountsPanel
          accounts={overview.accounts}
          isAdministrator={isAdministrator}
        />
      </LedgerPanel>
    </div>
  );
}
