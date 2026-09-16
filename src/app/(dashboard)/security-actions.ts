"use server";

import { redirect } from "next/navigation";

import { signOut as signOutWithAuthJs } from "@/auth";
import { developmentSessionCookieName } from "@/modules/auth/development-auth";
import { requireSession } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import {
  configurePersonalPin,
  hasPersonalPin,
  lockPersonalSession,
  requireUnlockedSession,
  revokeAllPersonalSessions,
  unlockWithPersonalPin,
} from "@/modules/auth/app-security";
import { DomainError } from "@/lib/errors";
import { cookies } from "next/headers";

export type PinActionState = {
  message: string;
  status: "error" | "idle" | "success";
  token?: string;
};
const idle: PinActionState = { message: "", status: "idle" };

function errorState(error: unknown): PinActionState {
  return {
    message:
      error instanceof DomainError
        ? error.message
        : "No fue posible procesar el PIN. Inténtalo nuevamente.",
    status: "error",
  };
}

export async function configurePinAction(
  _previous: PinActionState,
  formData: FormData,
): Promise<PinActionState> {
  void _previous;
  try {
    const actor = await requireSession(getAuthProvider());
    const token = await configurePersonalPin(actor, {
      pin: formData.get("pin"),
      confirmation: formData.get("confirmation"),
    });
    return { message: "Tu PIN fue configurado.", status: "success", token };
  } catch (error) {
    return errorState(error);
  }
}

export async function unlockWithPinAction(
  _previous: PinActionState,
  formData: FormData,
): Promise<PinActionState> {
  void _previous;
  try {
    const actor = await requireSession(getAuthProvider());
    const token = await unlockWithPersonalPin(actor, formData.get("pin"));
    return { message: "IDM OS desbloqueado.", status: "success", token };
  } catch (error) {
    return errorState(error);
  }
}

export async function verifyTabUnlockAction(token: string | null) {
  try {
    const actor = await requireSession(getAuthProvider());
    await requireUnlockedSession(actor, token);
    return { unlocked: true, pinConfigured: true };
  } catch {
    const session = await getAuthProvider().getSession();
    return {
      unlocked: false,
      pinConfigured: session ? await hasPersonalPin(session.id) : false,
    };
  }
}

export async function lockAppAction(token: string | null) {
  const actor = await getAuthProvider().getSession();
  if (actor) await lockPersonalSession(actor, token);
  return idle;
}

export async function touchAppUnlockAction(token: string | null) {
  try {
    const actor = await requireSession(getAuthProvider());
    await requireUnlockedSession(actor, token);
    return true;
  } catch {
    return false;
  }
}

export async function signOutIdmAction() {
  const session = await getAuthProvider().getSession();
  if (session) await revokeAllPersonalSessions(session, "auth.logout");

  if (session?.source === "google") {
    await signOutWithAuthJs({ redirectTo: "/acceso" });
  }

  const cookieStore = await cookies();
  cookieStore.delete(developmentSessionCookieName);
  redirect("/acceso");
}
