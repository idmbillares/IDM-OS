"use server";

import { revalidatePath } from "next/cache";

import { DomainError } from "@/lib/errors";
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
  try {
    const actor = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(actor, unlockToken);
    await action(actor, values);
    revalidatePath("/");
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");
    return { message: success, status: "success" };
  } catch (error) {
    return {
      message:
        error instanceof DomainError
          ? error.message
          : "No fue posible registrar la operación.",
      status: "error",
    };
  }
}

function entry(formData: FormData) {
  return {
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
