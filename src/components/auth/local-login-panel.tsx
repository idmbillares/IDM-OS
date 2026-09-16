"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import {
  signInLocalDevelopment,
  type LocalLoginActionState,
} from "@/app/acceso/actions";

type LocalLoginPanelProps = { displayName: string | null };

const initialLocalLoginActionState: LocalLoginActionState = {
  message: "",
  status: "idle",
};

export function LocalLoginPanel({ displayName }: LocalLoginPanelProps) {
  const [state, formAction, isPending] = useActionState(
    signInLocalDevelopment,
    initialLocalLoginActionState,
  );

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-950/5 sm:p-8">
      <div className="flex items-center gap-3 text-orange-700">
        <ShieldCheck aria-hidden="true" className="size-5" />
        <p className="text-xs font-bold tracking-[0.12em] uppercase">
          Entorno de desarrollo
        </p>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-950">
        Acceso local
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {displayName
          ? `Continúa como ${displayName}. Tus permisos se consultan desde IDM OS.`
          : "El administrador local debe aprovisionarse antes de acceder."}
      </p>
      <form action={formAction} className="mt-6">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-orange-300"
          disabled={!displayName || isPending}
          type="submit"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
          {isPending ? "Ingresando…" : "Ingresar a IDM OS"}
        </button>
        {state.message ? (
          <p aria-live="polite" className="mt-4 text-sm leading-6 text-orange-800">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
