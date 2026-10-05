"use server";

import { revalidatePath } from "next/cache";

import { operationError } from "@/lib/operation-error";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import {
  registerExpense,
  registerBalanceAdjustment,
  registerIncome,
  registerOpeningBalance,
  registerTransfer,
  voidFinancialTransaction,
} from "@/modules/financial/ledger";

export type LedgerActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

async function run(
  action: (actor: { id: string }, values: unknown) => Promise<string>,
  values: unknown,
  success: string,
  unlockToken: unknown,
): Promise<LedgerActionState> {
  let actorId: string | undefined;
  const operation =
    action === registerIncome
      ? "cash.income"
      : action === registerExpense
        ? "cash.expense"
        : action === registerOpeningBalance
          ? "cash.opening"
          : action === registerTransfer
            ? "cash.transfer"
            : action === registerBalanceAdjustment
              ? "cash.adjustment"
              : "cash.void";
  try {
    const actor = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    actorId = actor.id;
    await requireUnlockedSession(actor, unlockToken);
    await action(actor, values);
    revalidatePath("/");
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");
    return { message: success, status: "success" };
  } catch (error) {
    return {
      message: operationError(operation, actorId, error),
      status: "error",
    };
  }
}

function entry(formData: FormData) {
  return {
    idempotencyKey: formData.get("idempotencyKey"),
    accountId: formData.get("accountId"),
    amountMinor: formData.get("amountMinor"),
    category: formData.get("category"),
    description: formData.get("description"),
    occurredAt: formData.get("occurredAt"),
    reference: formData.get("reference") || undefined,
  };
}
export async function openingBalanceAction(
  _state: LedgerActionState,
  formData: FormData,
) {
  return run(
    registerOpeningBalance,
    entry(formData),
    "El saldo inicial fue registrado.",
    formData.get("unlockToken"),
  );
}
export async function incomeAction(_state: LedgerActionState, formData: FormData) {
  return run(
    registerIncome,
    entry(formData),
    "El ingreso fue registrado.",
    formData.get("unlockToken"),
  );
}
export async function expenseAction(_state: LedgerActionState, formData: FormData) {
  return run(
    registerExpense,
    entry(formData),
    "El egreso fue registrado.",
    formData.get("unlockToken"),
  );
}
export async function transferAction(_state: LedgerActionState, formData: FormData) {
  return run(
    registerTransfer,
    {
      idempotencyKey: formData.get("idempotencyKey"),
      originAccountId: formData.get("originAccountId"),
      destinationAccountId: formData.get("destinationAccountId"),
      amountMinor: formData.get("amountMinor"),
      description: formData.get("description"),
      occurredAt: formData.get("occurredAt"),
      reference: formData.get("reference") || undefined,
    },
    "La transferencia fue registrada.",
    formData.get("unlockToken"),
  );
}

export async function balanceAdjustmentAction(
  _state: LedgerActionState,
  formData: FormData,
) {
  return run(
    registerBalanceAdjustment,
    {
      idempotencyKey: formData.get("idempotencyKey"),
      accountId: formData.get("accountId"),
      actualBalanceMinor: formData.get("actualBalanceMinor"),
      occurredAt: formData.get("occurredAt"),
      reason: formData.get("reason"),
      reference: formData.get("reference") || undefined,
    },
    "El ajuste fue registrado correctamente.",
    formData.get("unlockToken"),
  );
}

export async function voidTransactionAction(
  _state: LedgerActionState,
  formData: FormData,
) {
  return run(
    voidFinancialTransaction,
    { transactionId: formData.get("transactionId"), reason: formData.get("reason") },
    "La operación fue anulada mediante un movimiento compensatorio.",
    formData.get("unlockToken"),
  );
}
