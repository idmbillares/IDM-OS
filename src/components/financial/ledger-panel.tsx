"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CircleDollarSign,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  expenseAction,
  balanceAdjustmentAction,
  incomeAction,
  openingBalanceAction,
  transferAction,
  type LedgerActionState,
  voidTransactionAction,
} from "@/app/(dashboard)/caja/ledger-actions";
import { CopInput } from "@/components/financial/cop-input";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";
import { Toast, type ToastNotice } from "@/components/ui/toast";
import { businessToday, formatBusinessDate } from "@/lib/business-time";
import { financialCategorySuggestions } from "@/modules/financial/categories";
import { formatCop } from "@/modules/financial/money";

type Account = {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  balanceMinor: number;
  currency: string;
};
type Recent = {
  id: string;
  type: string;
  source: string;
  status: string;
  occurredAt: Date;
  description: string | null;
  category: string | null;
  reference: string | null;
  amountMinor: number;
  displayAmountMinor: number;
  accountNames: string | null;
  userName: string | null;
  voidReason: string | null;
};
type Mode = "adjustment" | "income" | "expense" | "opening" | "transfer" | null;
const initial: LedgerActionState = { message: "", status: "idle" };
function label(m: Recent) {
  if (m.source === "OPENING_BALANCE") return "Saldo inicial";
  if (m.source === "VOID_REVERSAL") return "Compensación por anulación";
  if (m.type === "INCOME") return "Ingreso";
  if (m.type === "EXPENSE") return "Egreso";
  return m.type === "TRANSFER" ? "Transferencia" : "Ajuste";
}

export function LedgerPanel({
  accounts,
  totalAvailableMinor,
  incomeMinor,
  expenseMinor,
  recent,
  history,
  isAdministrator,
  query,
  showMetrics = true,
  showHistory = false,
}: {
  accounts: Account[];
  totalAvailableMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  recent: Recent[];
  history: { page: number; pageSize: number; total: number };
  isAdministrator: boolean;
  query: string;
  showMetrics?: boolean;
  showHistory?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [submittedMode, setSubmittedMode] = useState<Mode>(null);
  const [voidSubmitted, setVoidSubmitted] = useState(false);
  const handledOperationState = useRef<LedgerActionState | null>(null);
  const handledVoidState = useRef<LedgerActionState | null>(null);
  const [transferOriginId, setTransferOriginId] = useState("");
  const [incomeState, incomeForm] = useActionState(incomeAction, initial);
  const [expenseState, expenseForm] = useActionState(expenseAction, initial);
  const [openingState, openingForm] = useActionState(openingBalanceAction, initial);
  const [transferState, transferForm] = useActionState(transferAction, initial);
  const [adjustmentState, adjustmentForm] = useActionState(
    balanceAdjustmentAction,
    initial,
  );
  const [voidState, voidForm] = useActionState(voidTransactionAction, initial);
  const state =
    mode === "income"
      ? incomeState
      : mode === "expense"
        ? expenseState
        : mode === "opening"
          ? openingState
          : mode === "adjustment"
            ? adjustmentState
            : transferState;
  const active = accounts.filter((account) => account.isActive);
  const categories = useMemo(
    () =>
      mode === "expense"
        ? financialCategorySuggestions.expense
        : financialCategorySuggestions.income,
    [mode],
  );
  const today = businessToday();
  useEffect(() => {
    if (
      !submittedMode ||
      state.status === "idle" ||
      handledOperationState.current === state
    )
      return;
    handledOperationState.current = state;
    const timer = window.setTimeout(() => {
      setNotice({
        message: state.message,
        status: state.status === "success" ? "success" : "error",
      });
      if (state.status === "success") {
        setMode(null);
        router.refresh();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, state, submittedMode]);
  useEffect(() => {
    if (
      !voidSubmitted ||
      voidState.status === "idle" ||
      handledVoidState.current === voidState
    )
      return;
    handledVoidState.current = voidState;
    const timer = window.setTimeout(() => {
      setNotice({
        message: voidState.message,
        status: voidState.status === "success" ? "success" : "error",
      });
      if (voidState.status === "success") {
        setVoiding(null);
        router.refresh();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, voidState, voidSubmitted]);
  const formAction =
    mode === "income"
      ? incomeForm
      : mode === "expense"
        ? expenseForm
        : mode === "opening"
          ? openingForm
          : mode === "adjustment"
            ? adjustmentForm
            : transferForm;
  const openMode = (next: Exclude<Mode, null>) => {
    setNotice(null);
    setSubmittedMode(null);
    if (next === "transfer") setTransferOriginId("");
    setMode(next);
  };
  return (
    <div className="space-y-7">
      {showMetrics ? (
        <FinancialMetrics
          totalAvailableMinor={totalAvailableMinor}
          incomeMinor={incomeMinor}
          expenseMinor={expenseMinor}
        />
      ) : null}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-zinc-950">Operaciones de Caja</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Cada operación se publica en el ledger y queda asociada al usuario
          autenticado.
        </p>
        {isAdministrator ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <Action
              icon={ArrowUpRight}
              label="Registrar ingreso"
              active={mode === "income"}
              onClick={() => openMode("income")}
            />
            <Action
              icon={ArrowDownLeft}
              label="Registrar egreso"
              active={mode === "expense"}
              onClick={() => openMode("expense")}
            />
            <Action
              icon={ArrowLeftRight}
              label="Transferir dinero"
              active={mode === "transfer"}
              onClick={() => openMode("transfer")}
            />
            <Action
              icon={Plus}
              label="Registrar saldo inicial"
              active={mode === "opening"}
              onClick={() => openMode("opening")}
            />
            <Action
              active={mode === "adjustment"}
              icon={CircleDollarSign}
              label="Ajustar saldo"
              onClick={() => openMode("adjustment")}
              tone="caution"
            />
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
            No tienes autorización para registrar operaciones.
          </p>
        )}
        {mode === "adjustment" ? (
          <AdjustmentForm
            accounts={active}
            formAction={formAction}
            onSubmit={() => {
              setNotice(null);
              setSubmittedMode("adjustment");
            }}
            today={today}
          />
        ) : mode ? (
          <form
            action={formAction}
            onSubmit={() => {
              setNotice(null);
              setSubmittedMode(mode);
            }}
            className="mt-6 grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-2"
          >
            <TabUnlockField />
            <div className="sm:col-span-2">
              <h3 className="font-semibold text-zinc-950">
                {mode === "income"
                  ? "Nuevo ingreso"
                  : mode === "expense"
                    ? "Nuevo egreso"
                    : mode === "transfer"
                      ? "Transferencia entre cuentas"
                      : "Saldo inicial"}
              </h3>
            </div>
            {mode === "transfer" ? (
              <>
                <AccountSelect
                  accounts={active}
                  label="Cuenta origen"
                  name="originAccountId"
                  onChange={setTransferOriginId}
                />
                <AccountSelect
                  accounts={active}
                  label="Cuenta destino"
                  name="destinationAccountId"
                  excludedId={transferOriginId}
                />
              </>
            ) : (
              <AccountSelect accounts={active} label="Cuenta" name="accountId" />
            )}
            <CopInput />
            <label className="block text-sm font-semibold text-zinc-800">
              Fecha
              <input
                className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                defaultValue={today}
                name="occurredAt"
                required
                type="date"
              />
            </label>
            {mode === "income" || mode === "expense" ? (
              <label className="block text-sm font-semibold text-zinc-800">
                Categoría
                <input
                  className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                  list={`categories-${mode}`}
                  name="category"
                  placeholder="Selecciona o escribe una categoría"
                  required
                />
                <datalist id={`categories-${mode}`}>
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>
            ) : null}
            <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
              Descripción{" "}
              <span className="font-normal text-zinc-500">
                {mode === "opening" ? "(opcional)" : ""}
              </span>
              <input
                className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                name="description"
                required={mode !== "opening"}
              />
            </label>
            <label className="block text-sm font-semibold text-zinc-800">
              Referencia <span className="font-normal text-zinc-500">(opcional)</span>
              <input
                className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                name="reference"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button
                className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
                type="submit"
              >
                Confirmar y publicar
              </button>
              <button
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                onClick={() => setMode(null)}
                type="button"
              >
                Cancelar
              </button>
              {submittedMode === mode ? <Message {...state} /> : null}
            </div>
          </form>
        ) : null}
      </section>
      {showHistory ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-zinc-950">
            Historial de movimientos
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {history.total} operación{history.total === 1 ? "" : "es"}; se muestran de
            25 en 25.
          </p>
          <form
            action="/caja/movimientos"
            className="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <Filter label="Desde" name="from" type="date" />
            <Filter label="Hasta" name="to" type="date" />
            <label className="text-xs font-semibold text-zinc-700">
              Tipo
              <select
                className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm"
                name="type"
              >
                <option value="">Todos</option>
                <option value="INCOME">Ingresos</option>
                <option value="EXPENSE">Egresos</option>
                <option value="TRANSFER">Transferencias</option>
                <option value="ADJUSTMENT">Ajustes / saldo inicial</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-zinc-700">
              Cuenta
              <select
                className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm"
                name="account"
              >
                <option value="">Todas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <Filter label="Categoría" name="category" placeholder="Categoría exacta" />
            <label className="text-xs font-semibold text-zinc-700 sm:col-span-2 lg:col-span-4">
              Buscar descripción o referencia
              <input
                className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm"
                name="q"
                placeholder="Buscar"
              />
            </label>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white"
              type="submit"
            >
              <Search className="size-4" />
              Filtrar
            </button>
          </form>
          {recent.length ? (
            <div className="mt-5 divide-y divide-zinc-100">
              {recent.map((movement) => (
                <article className="py-4" key={movement.id}>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-zinc-950">{label(movement)}</p>
                        <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                          {formatBusinessDate(new Date(movement.occurredAt))}
                        </span>
                        {movement.status === "VOIDED" ? (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">
                            ANULADA
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-zinc-700">
                        {movement.description || "Sin descripción"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {movement.accountNames || "Sin cuenta"} ·{" "}
                        {movement.category || "Sin categoría"} ·{" "}
                        {movement.reference || "Sin referencia"} · Registró:{" "}
                        {movement.userName || "Sistema"}
                      </p>
                      {movement.status === "VOIDED" ? (
                        <p className="mt-1 text-xs font-medium text-orange-800">
                          Motivo: {movement.voidReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-3">
                      <p
                        className={
                          movement.amountMinor < 0
                            ? "font-semibold text-orange-800"
                            : "font-semibold text-emerald-700"
                        }
                      >
                        {formatCop(
                          movement.type === "TRANSFER"
                            ? movement.displayAmountMinor
                            : movement.amountMinor,
                        )}
                      </p>
                      {isAdministrator &&
                      movement.status === "POSTED" &&
                      movement.source !== "VOID_REVERSAL" ? (
                        <button
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-zinc-300 px-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => {
                            setNotice(null);
                            setVoidSubmitted(false);
                            setVoiding(voiding === movement.id ? null : movement.id);
                          }}
                          type="button"
                        >
                          <XCircle className="size-3.5" />
                          Anular
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {voiding === movement.id ? (
                    <form
                      action={voidForm}
                      onSubmit={() => {
                        setNotice(null);
                        setVoidSubmitted(true);
                      }}
                      className="mt-3 flex flex-col gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 sm:flex-row"
                    >
                      <TabUnlockField />
                      <input name="transactionId" type="hidden" value={movement.id} />
                      <input
                        className="min-h-10 flex-1 rounded-lg border border-orange-200 bg-white px-3 text-sm"
                        minLength={3}
                        name="reason"
                        placeholder="Motivo obligatorio de anulación"
                        required
                      />
                      <button
                        className="min-h-10 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white"
                        type="submit"
                      >
                        Confirmar anulación
                      </button>
                      <button
                        className="min-h-10 px-2 text-sm font-semibold"
                        onClick={() => setVoiding(null)}
                        type="button"
                      >
                        Cancelar
                      </button>
                      {voidSubmitted ? <Message {...voidState} /> : null}
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-zinc-600">
              No hay movimientos que coincidan con los filtros.
            </p>
          )}
          {history.total > history.pageSize ? (
            <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
              <a
                className={
                  history.page === 1
                    ? "pointer-events-none text-zinc-400"
                    : "font-semibold text-zinc-800"
                }
                href={`/caja/movimientos?${pageQuery(query, history.page - 1)}`}
              >
                Anterior
              </a>
              <span>
                Página {history.page} de {Math.ceil(history.total / history.pageSize)}
              </span>
              <a
                className={
                  history.page * history.pageSize >= history.total
                    ? "pointer-events-none text-zinc-400"
                    : "font-semibold text-zinc-800"
                }
                href={`/caja/movimientos?${pageQuery(query, history.page + 1)}`}
              >
                Siguiente
              </a>
            </div>
          ) : null}
        </section>
      ) : (
        <RecentMovementsPreview recent={recent} />
      )}
      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

export function FinancialMetrics({
  totalAvailableMinor,
  incomeMinor,
  expenseMinor,
}: {
  totalAvailableMinor: number;
  incomeMinor: number;
  expenseMinor: number;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Saldo disponible total" value={formatCop(totalAvailableMinor)} />
      <Metric label="Ingresos del mes" value={formatCop(incomeMinor)} />
      <Metric label="Egresos del mes" value={formatCop(expenseMinor)} />
      <Metric label="Flujo neto" value={formatCop(incomeMinor - expenseMinor)} />
    </section>
  );
}

function RecentMovementsPreview({ recent }: { recent: Recent[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Últimos movimientos</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Consulta el historial completo, filtros y anulaciones en Movimientos.
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 items-center rounded-lg border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          href="/caja/movimientos"
        >
          Ver todos los movimientos
        </Link>
      </div>
      {recent.length ? (
        <div className="mt-4 divide-y divide-zinc-100">
          {recent.slice(0, 5).map((movement) => (
            <article
              className="flex items-center justify-between gap-4 py-3"
              key={movement.id}
            >
              <div className="min-w-0">
                <p className="font-semibold text-zinc-950">{label(movement)}</p>
                <p className="mt-1 truncate text-sm text-zinc-600">
                  {movement.description || "Sin descripción"} ·{" "}
                  {formatBusinessDate(new Date(movement.occurredAt))}
                </p>
              </div>
              <p
                className={
                  movement.amountMinor < 0
                    ? "shrink-0 font-semibold text-orange-800"
                    : "shrink-0 font-semibold text-emerald-700"
                }
              >
                {formatCop(
                  movement.type === "TRANSFER"
                    ? movement.displayAmountMinor
                    : movement.amountMinor,
                )}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">
          Aún no hay movimientos registrados.
        </p>
      )}
    </section>
  );
}
function pageQuery(query: string, page: number) {
  const params = new URLSearchParams(query);
  params.set("page", String(Math.max(page, 1)));
  return params.toString();
}

function AdjustmentForm({
  accounts,
  formAction,
  onSubmit,
  today,
}: {
  accounts: Account[];
  formAction: (payload: FormData) => void;
  onSubmit: () => void;
  today: string;
}) {
  const [accountId, setAccountId] = useState("");
  const [actualBalanceMinor, setActualBalanceMinor] = useState(0);
  const account = accounts.find((item) => item.id === accountId);
  const difference = account ? actualBalanceMinor - account.balanceMinor : 0;
  return (
    <form
      action={formAction}
      className="mt-6 grid gap-4 border-t border-orange-100 pt-6 sm:grid-cols-2"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "¿Confirmas este ajuste? Se publicará un movimiento trazable en el ledger.",
          )
        ) {
          event.preventDefault();
        } else {
          onSubmit();
        }
      }}
    >
      <TabUnlockField />
      <div className="sm:col-span-2">
        <h3 className="font-semibold text-zinc-950">Ajuste de saldo</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Corrige la diferencia entre el saldo del ledger y el dinero real, sin editar
          saldos manualmente.
        </p>
      </div>
      <label className="block text-sm font-semibold text-zinc-800">
        Cuenta
        <select
          className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
          name="accountId"
          onChange={(event) => setAccountId(event.target.value)}
          required
          value={accountId}
        >
          <option value="">Selecciona una cuenta</option>
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
        <p className="text-zinc-600">Saldo registrado</p>
        <p className="mt-1 text-lg font-semibold text-zinc-950">
          {account ? formatCop(account.balanceMinor) : "Selecciona una cuenta"}
        </p>
      </div>
      <CopInput name="actualBalanceMinor" onValueChange={setActualBalanceMinor} />
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
        <p className="text-orange-900">Ajuste a publicar</p>
        <p className="mt-1 text-lg font-semibold text-orange-950">
          {account ? formatCop(difference) : "$ 0"}
        </p>
      </div>
      <label className="block text-sm font-semibold text-zinc-800">
        Fecha
        <input
          className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
          defaultValue={today}
          name="occurredAt"
          required
          type="date"
        />
      </label>
      <label className="block text-sm font-semibold text-zinc-800">
        Referencia <span className="font-normal text-zinc-500">(opcional)</span>
        <input
          className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
          name="reference"
        />
      </label>
      <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
        Motivo
        <textarea
          className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2"
          minLength={3}
          name="reason"
          placeholder="Ej.: Diferencia encontrada durante conteo de caja."
          required
          rows={3}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800"
          type="submit"
        >
          Confirmar ajuste
        </button>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-zinc-600">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-950">{value}</p>
    </div>
  );
}
function Action({
  active = false,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  active?: boolean;
  icon: typeof CircleDollarSign;
  label: string;
  onClick: () => void;
  tone?: "caution";
}) {
  return (
    <button
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${
        active
          ? "border-orange-700 bg-orange-700 text-white"
          : tone === "caution"
            ? "border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100"
            : "border-zinc-300 text-zinc-800 hover:bg-zinc-50"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4 text-orange-700" />
      {label}
    </button>
  );
}
function AccountSelect({
  accounts,
  excludedId,
  label,
  name,
  onChange,
}: {
  accounts: Account[];
  excludedId?: string;
  label: string;
  name: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-zinc-800">
      {label}
      <select
        className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3"
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        required
      >
        <option value="">Selecciona una cuenta</option>
        {accounts
          .filter((account) => account.id !== excludedId)
          .map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {formatCop(account.balanceMinor)}
            </option>
          ))}
      </select>
    </label>
  );
}
function Filter({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="text-xs font-semibold text-zinc-700">
      {label}
      <input
        className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm"
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}
function Message({ message, status }: LedgerActionState) {
  return message ? (
    <p
      aria-live="polite"
      className={
        status === "error" ? "text-sm text-orange-800" : "text-sm text-emerald-700"
      }
    >
      {message}
    </p>
  ) : null;
}
