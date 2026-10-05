"use server";

import { revalidatePath } from "next/cache";

import { DomainError } from "@/lib/errors";
import { operationError } from "@/lib/operation-error";
import {
  changeApplicationIcon,
  restoreApplicationIcon,
} from "@/modules/branding/service";
import { requireUnlockedSession } from "@/modules/auth/app-security";
import { z } from "zod";
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
  let actorId: string | undefined;
  try {
    const session = await requireRole(getAuthProvider(), "ADMINISTRADOR");
    actorId = session.id;
    await requireUnlockedSession(session, formData.get("unlockToken"));
    const intent = z
      .enum(["upload", "restore"])
      .safeParse(formData.get("intent") ?? "upload");
    if (!intent.success)
      return { message: "Acción de marca inválida.", status: "error" };
    if (intent.data === "restore") {
      await restoreApplicationIcon(session);
      revalidatePath("/", "layout");
      return {
        message:
          "Se restauró el ícono predeterminado. Los activos anteriores se conservan.",
        status: "success",
      };
    }
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
    return {
      message: operationError("branding.icon.update", actorId, error),
      status: "error",
    };
  }
}
