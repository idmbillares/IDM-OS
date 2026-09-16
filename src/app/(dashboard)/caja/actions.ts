"use server";

import { revalidatePath } from "next/cache";

import { DomainError } from "@/lib/errors";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import {
  createFinancialAccount,
  setFinancialAccountStatus,
  updateFinancialAccount,
} from "@/modules/financial/accounts";

export type FinancialAccountActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

function errorState(error: unknown): FinancialAccountActionState {
  if (error instanceof DomainError) {
    return { message: error.message, status: "error" };
  }

  return {
    message: "No fue posible guardar la cuenta. Inténtalo nuevamente.",
    status: "error",
  };
}

export async function createFinancialAccountAction(
  _previousState: FinancialAccountActionState,
  formData: FormData,
): Promise<FinancialAccountActionState> {
  try {
    const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(session, formData.get("unlockToken"));
    await createFinancialAccount(session, {
      name: formData.get("name"),
      kind: formData.get("kind"),
      description: formData.get("description") || undefined,
      currency: "COP",
    });
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");

    return {
      message: "La cuenta financiera fue creada correctamente.",
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateFinancialAccountAction(
  _previousState: FinancialAccountActionState,
  formData: FormData,
): Promise<FinancialAccountActionState> {
  try {
    const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(session, formData.get("unlockToken"));
    await updateFinancialAccount(session, {
      id: formData.get("accountId"),
      name: formData.get("name"),
      description: formData.get("description") || undefined,
    });
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");

    return { message: "Los cambios de la cuenta fueron guardados.", status: "success" };
  } catch (error) {
    return errorState(error);
  }
}

export async function setFinancialAccountStatusAction(
  _previousState: FinancialAccountActionState,
  formData: FormData,
): Promise<FinancialAccountActionState> {
  try {
    const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    await requireUnlockedSession(session, formData.get("unlockToken"));
    const nextStatus = formData.get("nextStatus");

    if (nextStatus !== "active" && nextStatus !== "inactive") {
      return { message: "El estado de la cuenta no es válido.", status: "error" };
    }

    const result = await setFinancialAccountStatus(session, {
      id: formData.get("accountId"),
      isActive: nextStatus === "active",
    });
    revalidatePath("/caja");
    revalidatePath("/caja/movimientos");

    return {
      message: result.changed
        ? result.account.isActive
          ? "La cuenta fue activada correctamente."
          : "La cuenta fue desactivada correctamente. Su historial se conserva."
        : "La cuenta ya tenía ese estado.",
      status: "success",
    };
  } catch (error) {
    return errorState(error);
  }
}
