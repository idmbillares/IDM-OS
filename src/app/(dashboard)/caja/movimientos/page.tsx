import { LedgerPanel } from "@/components/financial/ledger-panel";
import { PageHeader } from "@/components/ui/page-header";
import { businessDayBounds } from "@/lib/business-time";
import { requireCurrentSession } from "@/modules/auth/provider";
import { getFinancialOverview } from "@/modules/financial/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function value(params: Record<string, string | string[] | undefined>, key: string) {
  const item = params[key];
  return typeof item === "string" ? item : undefined;
}

export default async function CashMovementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireCurrentSession();
  const params = await searchParams;
  const type = value(params, "type");
  const validType = ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"].includes(type ?? "")
    ? (type as "INCOME" | "EXPENSE" | "TRANSFER" | "ADJUSTMENT")
    : undefined;
  const fromBounds = businessDayBounds(value(params, "from") ?? "");
  const toBounds = businessDayBounds(value(params, "to") ?? "");
  const requestedPage = Number(value(params, "page"));
  const filters = {
    accountId: value(params, "account"),
    category: value(params, "category"),
    dateFrom: fromBounds?.start,
    dateTo: toBounds?.end,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    search: value(params, "q"),
    type: validType,
  };
  const overview = await getFinancialOverview(filters);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Caja"
        title="Movimientos"
        description="Consulta, filtra y audita todos los movimientos publicados del ledger."
      />
      <LedgerPanel
        {...overview}
        isAdministrator={session.roles.includes("ADMINISTRADOR")}
        query={new URLSearchParams(
          Object.entries(params).flatMap(([key, item]) =>
            typeof item === "string" ? [[key, item]] : [],
          ),
        ).toString()}
        showHistory
      />
    </div>
  );
}
