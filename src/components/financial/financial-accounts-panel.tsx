"use client";

import {
  Banknote,
  CircleCheckBig,
  Landmark,
  Pencil,
  Plus,
  Power,
  ShieldAlert,
  WalletCards,
  X,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createFinancialAccountAction,
  setFinancialAccountStatusAction,
  updateFinancialAccountAction,
  type FinancialAccountActionState,
} from "@/app/(dashboard)/caja/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCop } from "@/modules/financial/money";
import type { FinancialAccountSummary } from "@/modules/financial/accounts";

type FinancialAccountsPanelProps = {
  accounts: Array<FinancialAccountSummary & { balanceMinor: number }>;
  isAdministrator: boolean;
};

const initialFinancialAccountActionState: FinancialAccountActionState = {
  message: "",
  status: "idle",
};

function accountKind(kind: FinancialAccountSummary["kind"]) {
  return kind === "BANK" ? "Banco" : kind === "CASH" ? "Efectivo" : kind;
}

function ActionMessage({ message, status }: { message: string; status: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      aria-live="polite"
      className={`text-sm ${status === "error" ? "text-orange-800" : "text-emerald-700"}`}
    >
      {message}
    </p>
  );
}

export function FinancialAccountsPanel({
  accounts,
  isAdministrator,
}: FinancialAccountsPanelProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createState, createAction, isCreatingPending] = useActionState(
    createFinancialAccountAction,
    initialFinancialAccountActionState,
  );
  const [updateState, updateAction, isUpdating] = useActionState(
    updateFinancialAccountAction,
    initialFinancialAccountActionState,
  );
  const [statusState, statusAction, isChangingStatus] = useActionState(
    setFinancialAccountStatusAction,
    initialFinancialAccountActionState,
  );

  useEffect(() => {
    if (createState.status === "success") {
      router.refresh();
    }
  }, [createState.status, router]);

  useEffect(() => {
    if (updateState.status !== "success") return;
    const timer = window.setTimeout(() => {
      setEditingId(null);
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, updateState.status]);

  useEffect(() => {
    if (!editingId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUpdating) setEditingId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editingId, isUpdating]);
  const editingAccount = accounts.find((account) => account.id === editingId) ?? null;

  useEffect(() => {
    if (statusState.status === "success") {
      router.refresh();
    }
  }, [router, statusState.status]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-orange-700">
            <WalletCards aria-hidden="true" className="size-4" />
            <p className="text-xs font-bold tracking-[0.12em] uppercase">Caja</p>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">
            Mis cuentas
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600">
            Saldos calculados en tiempo real a partir del ledger.
          </p>
        </div>
        {isAdministrator ? (
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
            onClick={() => setIsCreating((value) => !value)}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Agregar cuenta
          </button>
        ) : null}
      </div>

      {isAdministrator && isCreating ? (
        <form
          action={createAction}
          className="mt-7 grid gap-5 rounded-xl border border-orange-100 bg-orange-50/60 p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <div className="sm:col-span-2">
            <h3 className="text-base font-semibold text-zinc-950">Nueva cuenta</h3>
            <p className="mt-1 text-sm text-zinc-600">
              La cuenta se crea en COP y sin saldo inicial.
            </p>
          </div>
          <label
            className="block text-sm font-semibold text-zinc-800"
            htmlFor="new-account-name"
          >
            Nombre de la cuenta
            <input
              className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
              id="new-account-name"
              maxLength={120}
              minLength={2}
              name="name"
              required
            />
          </label>
          <label
            className="block text-sm font-semibold text-zinc-800"
            htmlFor="new-account-kind"
          >
            Tipo de cuenta
            <select
              className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
              id="new-account-kind"
              name="kind"
            >
              <option value="CASH">Efectivo</option>
              <option value="BANK">Banco</option>
            </select>
          </label>
          <label
            className="block text-sm font-semibold text-zinc-800 sm:col-span-2"
            htmlFor="new-account-description"
          >
            Descripción <span className="font-normal text-zinc-500">(opcional)</span>
            <textarea
              className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
              id="new-account-description"
              maxLength={500}
              name="description"
              rows={3}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-orange-300"
              disabled={isCreatingPending}
              type="submit"
            >
              {isCreatingPending ? "Guardando…" : "Guardar cuenta"}
            </button>
            <button
              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              onClick={() => setIsCreating(false)}
              type="button"
            >
              Cancelar
            </button>
            <ActionMessage message={createState.message} status={createState.status} />
          </div>
        </form>
      ) : null}

      {!isAdministrator ? (
        <div className="mt-7 flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-orange-700"
          />
          Solo un administrador puede crear, editar, activar o desactivar cuentas.
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            description="Agrega la primera cuenta para organizar Caja. No se crearán saldos ni movimientos automáticamente."
            icon={WalletCards}
            title="No tienes cuentas financieras registradas."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const KindIcon = account.kind === "BANK" ? Landmark : Banknote;

            return (
              <article
                className="rounded-xl border border-zinc-200 bg-white p-3.5 transition-colors hover:border-zinc-300"
                key={account.id}
              >
                <div className="flex h-full flex-col gap-2">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
                      <KindIcon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-950">
                        {account.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                        <span>{accountKind(account.kind)}</span>
                        <span aria-hidden="true">•</span>
                        <span>{account.currency}</span>
                        <StatusBadge label={account.isActive ? "Activa" : "Inactiva"} />
                      </div>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                        {formatCop(account.balanceMinor)}
                      </p>
                      {account.description ? (
                        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-600">
                          {account.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {isAdministrator ? (
                    <div className="mt-auto flex shrink-0 flex-wrap gap-2 pt-1">
                      <button
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => setEditingId(account.id)}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Editar
                      </button>
                      <form
                        action={statusAction}
                        onSubmit={(event) => {
                          if (
                            account.isActive &&
                            !window.confirm(
                              `¿Desactivar “${account.name}”? Su historial se conservará y no podrá usarse en nuevas operaciones futuras.`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <TabUnlockField />
                        <input name="accountId" type="hidden" value={account.id} />
                        <input
                          name="nextStatus"
                          type="hidden"
                          value={account.isActive ? "inactive" : "active"}
                        />
                        <button
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                          disabled={isChangingStatus}
                          type="submit"
                        >
                          {account.isActive ? (
                            <Power aria-hidden="true" className="size-4" />
                          ) : (
                            <CircleCheckBig aria-hidden="true" className="size-4" />
                          )}
                          {account.isActive ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          <ActionMessage message={statusState.message} status={statusState.status} />
        </div>
      )}
      {isAdministrator && editingAccount ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/55 p-4"
          role="presentation"
        >
          <form
            aria-labelledby="edit-account-title"
            aria-modal="true"
            action={updateAction}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
            role="dialog"
          >
            <TabUnlockField />
            <input name="accountId" type="hidden" value={editingAccount.id} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-xl font-semibold text-zinc-950"
                  id="edit-account-title"
                >
                  Editar cuenta
                </h3>
                <p className="mt-1 text-sm text-zinc-600">
                  Actualiza su nombre o descripción; el saldo no se edita.
                </p>
              </div>
              <button
                aria-label="Cerrar editor"
                className="grid size-10 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100"
                disabled={isUpdating}
                onClick={() => setEditingId(null)}
                type="button"
              >
                <X className="size-5" />
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-zinc-800">
              Nombre de la cuenta
              <input
                autoFocus
                className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
                defaultValue={editingAccount.name}
                maxLength={120}
                minLength={2}
                name="name"
                required
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-zinc-800">
              Descripción <span className="font-normal text-zinc-500">(opcional)</span>
              <textarea
                className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2"
                defaultValue={editingAccount.description ?? ""}
                maxLength={500}
                name="description"
                rows={3}
              />
            </label>
            {updateState.message ? (
              <ActionMessage
                message={updateState.message}
                status={updateState.status}
              />
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                disabled={isUpdating}
                onClick={() => setEditingId(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-10 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:bg-orange-300"
                disabled={isUpdating}
                type="submit"
              >
                {isUpdating ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
