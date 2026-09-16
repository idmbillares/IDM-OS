import { PageHeader } from "@/components/ui/page-header";
import { FinancialAccountsPanel } from "@/components/financial/financial-accounts-panel";
import { FinancialMetrics, LedgerPanel } from "@/components/financial/ledger-panel";
import { requireCurrentSession } from "@/modules/auth/provider";
import { getFinancialOverview } from "@/modules/financial/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CashPage() {
  const session = await requireCurrentSession();
  const overview = await getFinancialOverview();
  const isAdministrator = session.roles.includes("ADMINISTRADOR");

  return (
    <div className="space-y-8">
      <PageHeader
        description="Registra, consulta y audita la operación diaria de Caja. Los saldos provienen siempre del ledger."
        eyebrow="Operación financiera"
        title="Caja"
      />
      <FinancialMetrics
        expenseMinor={overview.expenseMinor}
        incomeMinor={overview.incomeMinor}
        totalAvailableMinor={overview.totalAvailableMinor}
      />
      <FinancialAccountsPanel
        accounts={overview.accounts}
        isAdministrator={isAdministrator}
      />
      <LedgerPanel
        {...overview}
        isAdministrator={isAdministrator}
        query=""
        showMetrics={false}
      />
    </div>
  );
}
