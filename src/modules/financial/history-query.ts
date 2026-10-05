import { z } from "zod";
import { businessDayBounds } from "@/lib/business-time";
import type { FinancialHistoryFilters } from "./ledger";

const date = z
  .string()
  .refine((value) => Boolean(businessDayBounds(value)), "Fecha inválida.");
const schema = z
  .object({
    account: z.uuid().optional(),
    category: z.string().trim().max(100).optional(),
    from: date.optional(),
    to: date.optional(),
    type: z
      .enum(["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT", "OPENING_BALANCE"])
      .optional(),
    q: z.string().trim().max(200).optional(),
    page: z
      .string()
      .regex(/^[1-9]\d{0,5}$/)
      .optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "La fecha Desde debe ser anterior o igual a Hasta.",
  );

export function parseHistoryQuery(
  params: Record<string, string | string[] | undefined>,
) {
  const raw = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== "" && v !== undefined),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      filters: {} as FinancialHistoryFilters,
      query: "",
      error: `Filtros inválidos: ${parsed.error.issues[0]?.message ?? "revisa los valores"} Se muestra el historial sin filtros.`,
    };
  const v = parsed.data;
  const filters: FinancialHistoryFilters = {
    accountId: v.account,
    category: v.category,
    dateFrom: v.from ? businessDayBounds(v.from)!.start : undefined,
    dateTo: v.to ? businessDayBounds(v.to)!.end : undefined,
    type: v.type,
    search: v.q,
    page: v.page ? Number(v.page) : 1,
  };
  const query = new URLSearchParams(
    Object.entries(v).filter(([, val]) => val !== undefined) as [string, string][],
  ).toString();
  return { filters, query, error: null };
}
