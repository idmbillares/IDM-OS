"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  updateOwnProfileAction,
  type BrandingActionState,
} from "@/app/(dashboard)/configuracion/actions";

const initial: BrandingActionState = { message: "", status: "idle" };
export function ProfileSettingsPanel({
  profile,
}: {
  profile: {
    displayName: string;
    email: string;
    contactEmail: string | null;
    phone: string | null;
  };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateOwnProfileAction, initial);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold text-zinc-950">Mi perfil</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Administra tus datos personales. Tu rol y correo de acceso están protegidos.
      </p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-zinc-800">
          Nombre completo
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            defaultValue={profile.displayName}
            maxLength={120}
            name="displayName"
            required
          />
        </label>
        <label className="text-sm font-semibold text-zinc-800">
          Correo de acceso
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 text-zinc-600"
            defaultValue={profile.email}
            readOnly
          />
        </label>
        <label className="text-sm font-semibold text-zinc-800">
          Correo de contacto{" "}
          <span className="font-normal text-zinc-500">(opcional)</span>
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            defaultValue={profile.contactEmail ?? ""}
            name="contactEmail"
            type="email"
          />
        </label>
        <label className="text-sm font-semibold text-zinc-800">
          Celular <span className="font-normal text-zinc-500">(opcional)</span>
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 px-3"
            defaultValue={profile.phone ?? ""}
            name="phone"
            placeholder="+57 300 123 4567"
            type="tel"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:bg-orange-300"
            disabled={pending}
            type="submit"
          >
            {pending ? "Guardando…" : "Guardar perfil"}
          </button>
          {state.message ? (
            <p
              aria-live="polite"
              className={
                state.status === "error"
                  ? "text-sm text-orange-800"
                  : "text-sm text-emerald-700"
              }
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
