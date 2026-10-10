"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/modules/auth/contracts";
import { assertPosOperation } from "@/modules/pos/permissions";
import { getAuthProvider } from "@/modules/auth/provider";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import { collectSalePayment, createSale, voidSale } from "@/modules/pos/service";
import { DomainError } from "@/lib/errors";

export type SaleActionState = {
  status: "idle" | "success" | "error";
  message: string;
  saleId?: string;
  submittedKey?: string;
};
function failure(error: unknown): SaleActionState {
  return {
    status: "error",
    message:
      error instanceof DomainError
        ? error.message
        : "No fue posible completar la venta.",
  };
}
export async function createSaleAction(
  _: SaleActionState,
  form: FormData,
): Promise<SaleActionState> {
  try {
    const actor = await requireSession(getAuthProvider());
    assertPosOperation(actor);
    await requireUnlockedSession(actor, form.get("unlockToken"));
    const saleData = JSON.parse(String(form.get("saleData") ?? "")) as unknown;
    const idempotencyKey = String(form.get("idempotencyKey") ?? "");
    const saleId = await createSale(actor, { ...(saleData as object), idempotencyKey });
    revalidatePath("/ventas");
    revalidatePath("/inventario");
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");
    return {
      status: "success",
      message: "Venta registrada.",
      saleId,
      submittedKey: idempotencyKey,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function voidSaleAction(
  _: SaleActionState,
  form: FormData,
): Promise<SaleActionState> {
  try {
    const actor = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(actor, form.get("unlockToken"));
    const saleId = await voidSale(actor, {
      saleId: form.get("saleId"),
      reason: form.get("reason"),
    });
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);
    revalidatePath("/inventario");
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");
    return {
      status: "success",
      message: "Venta anulada con reversos de inventario y Caja.",
      saleId,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function collectSalePaymentAction(
  _: SaleActionState,
  form: FormData,
): Promise<SaleActionState> {
  try {
    const actor = await requireSession(getAuthProvider());
    assertPosOperation(actor);
    await requireUnlockedSession(actor, form.get("unlockToken"));
    const saleId = await collectSalePayment(actor, {
      saleId: form.get("saleId"),
      accountId: form.get("accountId"),
      amountMinor: form.get("amountMinor"),
      idempotencyKey: form.get("idempotencyKey"),
    });
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");
    return { status: "success", message: "Cobro registrado en Caja.", saleId };
  } catch (error) {
    return failure(error);
  }
}
