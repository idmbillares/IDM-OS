"use server";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { pool } from "@/db/client";
import {
  createLocalDevelopmentSession,
  developmentSessionCookieName,
} from "@/modules/auth/development-auth";
import { getAuthProvider } from "@/modules/auth/provider";
import { signIn as signInWithAuthJs } from "@/auth";

export type LocalLoginActionState = { message: string; status: "error" | "idle" };

export async function signInLocalDevelopment(
  _previousState: LocalLoginActionState,
): Promise<LocalLoginActionState> {
  void _previousState;

  try {
    const session = await createLocalDevelopmentSession();

    if (!session) {
      return {
        message:
          "El acceso local no está disponible. Verifica que el administrador de desarrollo esté aprovisionado.",
        status: "error",
      };
    }

    const now = new Date();
    await pool.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at,created_at) VALUES($1,$2,'auth.local_development_signed_in','user',$2,$3,$4,$4)",
      [
        randomUUID(),
        session.user.id,
        JSON.stringify({ source: session.user.source }),
        now,
      ],
    );

    const cookieStore = await cookies();
    cookieStore.set({ name: developmentSessionCookieName, ...session.cookie });
  } catch {
    return {
      message: "No fue posible iniciar la sesión local. Inténtalo nuevamente.",
      status: "error",
    };
  }

  redirect("/");
}

export async function signOutLocalDevelopment() {
  const session = await getAuthProvider().getSession();
  const cookieStore = await cookies();

  if (session?.source === "development") {
    const now = new Date();
    await pool.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,metadata_json,occurred_at,created_at) VALUES($1,$2,'auth.local_development_signed_out','user',$2,$3,$4,$4)",
      [randomUUID(), session.id, JSON.stringify({ source: session.source }), now],
    );
  }

  cookieStore.delete(developmentSessionCookieName);
  redirect("/acceso");
}

export async function signInWithGoogle() {
  await signInWithAuthJs("google", { redirectTo: "/" });
}
