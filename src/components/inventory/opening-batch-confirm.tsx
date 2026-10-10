"use client";

import { useActionState } from "react";
import {
  confirmOpeningBatchAction,
  type BatchActionState,
} from "@/app/(dashboard)/inventario/carga-inicial/actions";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";

const idle: BatchActionState = { status: "idle", message: "" };
export function OpeningBatchConfirm({
  batchId,
  itemCount,
}: {
  batchId: string;
  itemCount: number;
}) {
  const [state, action, pending] = useActionState(confirmOpeningBatchAction, idle);
  return (
    <form
      action={action}
      className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50 p-5"
    >
      <TabUnlockField />
      <input name="batchId" type="hidden" value={batchId} readOnly />
      <p className="text-sm">
        Vas a publicar {itemCount} saldo(s) de apertura. Revisa cantidades, costos y
        precios antes de continuar.
      </p>
      <button
        className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        type="submit"
        disabled={pending || state.status === "success" || itemCount === 0}
      >
        {pending ? "Confirmando…" : "Confirmar carga inicial"}
      </button>
      {state.message ? (
        <p
          role="status"
          className={
            state.status === "error"
              ? "text-sm text-red-800"
              : "text-sm text-emerald-800"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
