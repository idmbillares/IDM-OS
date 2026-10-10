"use client";

import { useActionState } from "react";
import {
  collectSalePaymentAction,
  voidSaleAction,
  type SaleActionState,
} from "@/app/(dashboard)/ventas/actions";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";

const idle: SaleActionState = { status: "idle", message: "" };
export function ReceiptActions({
  saleId,
  status,
  pendingMinor,
  accounts,
  collectionKey,
}: {
  saleId: string;
  status: string;
  pendingMinor: number;
  accounts: Array<{ id: string; name: string }>;
  collectionKey: string;
}) {
  const [state, action, pending] = useActionState(voidSaleAction, idle);
  const [collectionState, collectionAction, collectionPending] = useActionState(
    collectSalePaymentAction,
    idle,
  );
  return (
    <div className="space-y-4 print:hidden">
      <button
        className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white"
        type="button"
        onClick={() => window.print()}
      >
        Imprimir o guardar PDF
      </button>
      {status === "POSTED" && pendingMinor > 0 ? (
        <form
          action={collectionAction}
          className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-4"
        >
          <TabUnlockField />
          <input name="saleId" type="hidden" value={saleId} readOnly />
          <input name="idempotencyKey" type="hidden" value={collectionKey} readOnly />
          <h2 className="font-semibold">Registrar cobro pendiente</h2>
          <p className="text-sm">
            Saldo pendiente: {pendingMinor.toLocaleString("es-CO")} COP
          </p>
          <label className="block text-sm font-semibold">
            Cuenta de Caja
            <select
              className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2"
              name="accountId"
              required
            >
              <option value="">Selecciona</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Valor recibido en COP
            <input
              className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2"
              name="amountMinor"
              type="number"
              min="1"
              max={pendingMinor}
              required
            />
          </label>
          <button
            className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={collectionPending || collectionState.status === "success"}
          >
            Registrar cobro
          </button>
          {collectionState.message ? (
            <p
              role="status"
              className={
                collectionState.status === "error"
                  ? "text-sm text-red-800"
                  : "text-sm text-emerald-800"
              }
            >
              {collectionState.message}
            </p>
          ) : null}
          {collectionState.status === "success" ? (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => window.location.reload()}
            >
              Actualizar comprobante para otro cobro
            </button>
          ) : null}
        </form>
      ) : null}
      {status === "POSTED" ? (
        <form
          action={action}
          className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4"
        >
          <TabUnlockField />
          <input name="saleId" type="hidden" value={saleId} readOnly />
          <label className="block text-sm font-semibold">
            Motivo de anulación
            <input
              className="mt-1 min-h-11 w-full rounded-lg border p-2"
              name="reason"
              minLength={3}
              maxLength={500}
              required
            />
          </label>
          <button
            className="min-h-11 rounded-lg border border-red-500 px-4 text-sm font-semibold text-red-900 disabled:opacity-50"
            type="submit"
            disabled={pending}
          >
            Anular con reversos
          </button>
          <p className="text-xs text-zinc-600">
            La anulación devuelve existencias y revierte los pagos registrados. Si Caja
            no tiene saldo suficiente para el reembolso, se rechazará sin cambios
            parciales.
          </p>
        </form>
      ) : null}
      {state.message ? (
        <p
          role="status"
          className={
            state.status === "error"
              ? "text-sm font-semibold text-red-800"
              : "text-sm font-semibold text-emerald-800"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
