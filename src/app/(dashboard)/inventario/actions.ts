"use server";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import {
  createProduct,
  registerInventoryMovement,
  updateProduct,
} from "@/modules/inventory/service";
export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
const error = (e: unknown): InventoryActionState => ({
  status: "error",
  message:
    e instanceof DomainError ? e.message : "No fue posible completar la operación.",
});
async function actor(token: FormDataEntryValue | null) {
  const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
  await requireUnlockedSession(session, token);
  return session;
}
export async function createProductAction(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  try {
    const user = await actor(form.get("unlockToken"));
    await createProduct(
      user,
      {
        sku: form.get("sku"),
        name: form.get("name"),
        description: form.get("description") || undefined,
        brand: form.get("brand") || undefined,
        variant: form.get("variant") || undefined,
        subcategory: form.get("subcategory") || undefined,
        storageLocation: form.get("storageLocation") || undefined,
        notes: form.get("notes") || undefined,
        category: form.get("category"),
        unit: form.get("unit"),
        costMinor: form.get("costMinor"),
        salePriceMinor: form.get("salePriceMinor"),
        minimumQuantity: form.get("minimumQuantity"),
      },
      form.get("photo") instanceof File ? (form.get("photo") as File) : null,
    );
    revalidatePath("/inventario");
    revalidatePath("/inventario/carga-inicial");
    return {
      status: "success",
      message: "Producto creado. Ahora puedes registrar su inventario inicial.",
    };
  } catch (e) {
    return error(e);
  }
}
export async function updateProductAction(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  try {
    const user = await actor(form.get("unlockToken"));
    await updateProduct(
      user,
      {
        id: form.get("id"),
        sku: form.get("sku"),
        name: form.get("name"),
        description: form.get("description") || undefined,
        brand: form.get("brand") || undefined,
        variant: form.get("variant") || undefined,
        subcategory: form.get("subcategory") || undefined,
        storageLocation: form.get("storageLocation") || undefined,
        notes: form.get("notes") || undefined,
        category: form.get("category"),
        unit: form.get("unit"),
        costMinor: form.get("costMinor"),
        salePriceMinor: form.get("salePriceMinor"),
        minimumQuantity: form.get("minimumQuantity"),
        isActive: form.get("isActive") === "on",
      },
      form.get("photo") instanceof File ? (form.get("photo") as File) : null,
    );
    revalidatePath("/inventario");
    return { status: "success", message: "Producto actualizado." };
  } catch (e) {
    return error(e);
  }
}
export async function openingInventoryAction(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  try {
    const user = await actor(form.get("unlockToken"));
    await registerInventoryMovement(user, {
      kind: "OPENING_BALANCE",
      productId: form.get("productId"),
      quantity: form.get("quantity"),
      unitCostMinor: form.get("unitCostMinor"),
      reference: form.get("reference") || undefined,
      reason: form.get("reason"),
      idempotencyKey: form.get("idempotencyKey"),
    });
    revalidatePath("/inventario");
    return {
      status: "success",
      message: "Saldo inicial de inventario registrado en el kardex.",
    };
  } catch (e) {
    return error(e);
  }
}
export async function inventoryMovementAction(
  _: InventoryActionState,
  form: FormData,
): Promise<InventoryActionState> {
  try {
    const user = await actor(form.get("unlockToken"));
    await registerInventoryMovement(user, {
      kind: form.get("kind"),
      productId: form.get("productId"),
      quantity: form.get("quantity"),
      unitCostMinor: form.get("unitCostMinor"),
      expectedQuantity: form.get("expectedQuantity"),
      physicalQuantity: form.get("physicalQuantity"),
      reference: form.get("reference") || undefined,
      reason: form.get("reason"),
      idempotencyKey: form.get("idempotencyKey"),
    });
    revalidatePath("/inventario");
    return { status: "success", message: "Movimiento registrado en el kardex." };
  } catch (e) {
    return error(e);
  }
}
