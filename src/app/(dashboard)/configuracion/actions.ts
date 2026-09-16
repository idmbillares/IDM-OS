"use server";

import { revalidatePath } from "next/cache";

import { DomainError } from "@/lib/errors";
import { changeApplicationIcon } from "@/modules/branding/service";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { requireSession } from "@/modules/auth/contracts";
import { updateOwnProfile } from "@/modules/auth/profile";

export type BrandingActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

export async function updateOwnProfileAction(
  _previousState: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  try {
    const session = await requireSession(getAuthProvider());
    await updateOwnProfile(session, {
      displayName: formData.get("displayName"),
      contactEmail: formData.get("contactEmail"),
      phone: formData.get("phone"),
    });
    revalidatePath("/", "layout");
    return { message: "Tu perfil fue actualizado.", status: "success" };
  } catch (error) {
    return error instanceof DomainError
      ? { message: error.message, status: "error" }
      : { message: "No fue posible actualizar tu perfil.", status: "error" };
  }
}

export async function updateApplicationIcon(
  _previousState: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  try {
    const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    const file = formData.get("appIcon");

    if (!(file instanceof File) || file.size === 0) {
      return {
        message: "Selecciona un archivo PNG antes de guardar.",
        status: "error",
      };
    }

    const result = await changeApplicationIcon(session, file);

    if (!result.changed) {
      return {
        message: "Ese ícono ya está configurado para IDM OS.",
        status: "success",
      };
    }

    revalidatePath("/", "layout");

    return {
      message: "El ícono de IDM OS se actualizó y quedó registrado en auditoría.",
      status: "success",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { message: error.message, status: "error" };
    }

    return {
      message: "No fue posible actualizar el ícono. Inténtalo nuevamente.",
      status: "error",
    };
  }
}
