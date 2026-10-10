"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import {
  confirmOpeningBatch,
  saveOpeningBatch,
} from "@/modules/inventory/opening-batches";

export type BatchActionState = {
  status: "idle" | "success" | "error";
  message: string;
  batchId?: string;
};
function failure(error: unknown): BatchActionState {
  return {
    status: "error",
    message:
      error instanceof DomainError ? error.message : "No fue posible guardar la carga.",
  };
}
export async function saveOpeningBatchAction(
  _: BatchActionState,
  form: FormData,
): Promise<BatchActionState> {
  try {
    const actor = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(actor, form.get("unlockToken"));
    const data = JSON.parse(String(form.get("batchData") ?? "")) as unknown;
    const batchId = await saveOpeningBatch(actor, {
      ...(data as object),
      batchId: form.get("batchId"),
    });
    revalidatePath("/inventario/carga-inicial");
    revalidatePath(`/inventario/carga-inicial/${batchId}`);
    return {
      status: "success",
      message: "Borrador guardado. Revísalo antes de confirmar.",
      batchId,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function confirmOpeningBatchAction(
  _: BatchActionState,
  form: FormData,
): Promise<BatchActionState> {
  try {
    const actor = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(actor, form.get("unlockToken"));
    const batchId = await confirmOpeningBatch(actor, { batchId: form.get("batchId") });
    revalidatePath("/inventario");
    revalidatePath("/inventario/carga-inicial");
    revalidatePath(`/inventario/carga-inicial/${batchId}`);
    return {
      status: "success",
      message: "Carga inicial confirmada en Kardex, sin movimientos de Caja.",
      batchId,
    };
  } catch (error) {
    return failure(error);
  }
}
