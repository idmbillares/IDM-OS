import { redirect } from "next/navigation";

import { AppBrandIcon } from "@/components/branding/app-brand-icon";
import { LocalLoginPanel } from "@/components/auth/local-login-panel";
import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { getLocalDevelopmentLoginIdentity } from "@/modules/auth/development-auth";
import { getAuthProvider } from "@/modules/auth/provider";
import { getBrandingSnapshot } from "@/modules/branding/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const [session, loginIdentity, branding] = await Promise.all([
    getAuthProvider().getSession(),
    getLocalDevelopmentLoginIdentity().catch(() => null),
    getBrandingSnapshot(),
  ]);

  if (session) {
    redirect("/");
  }

  const iconUrl = `/api/branding/icon?v=${branding.revision}`;

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white p-2 shadow-2xl">
          <div className="rounded-2xl bg-zinc-50 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <AppBrandIcon iconUrl={iconUrl} />
              <div>
                <p className="text-lg font-bold tracking-[0.13em] text-zinc-950">
                  IDM OS
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Sistema interno de IDM Fábrica de Billares
                </p>
              </div>
            </div>
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
                Bienvenido
              </h1>
              <p className="mt-3 leading-7 text-zinc-600">
                Accede de forma segura para continuar con la operación interna de IDM.
              </p>
              {process.env.IDM_AUTH_MODE === "google" ? (
                <GoogleLoginPanel />
              ) : (
                <LocalLoginPanel displayName={loginIdentity?.displayName ?? null} />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
