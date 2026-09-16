"use client";

import { ImageUp, LockKeyhole, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  updateApplicationIcon,
  type BrandingActionState,
} from "@/app/(dashboard)/configuracion/actions";

type BrandingSettingsPanelProps = {
  hasCustomIcon: boolean;
  iconUrl: string;
  isAdministrator: boolean;
};

const initialBrandingActionState: BrandingActionState = {
  message: "",
  status: "idle",
};

export function BrandingSettingsPanel({
  hasCustomIcon,
  iconUrl,
  isAdministrator,
}: BrandingSettingsPanelProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateApplicationIcon,
    initialBrandingActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  if (!isAdministrator) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              Acceso de administrador requerido
            </h2>
            <p className="mt-2 max-w-xl leading-7 text-zinc-600">
              La identidad visual es global. Solo un perfil con el rol
              <strong className="font-semibold text-zinc-800"> ADMINISTRADOR</strong>
              puede cambiar el ícono de IDM OS.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-orange-700">
            <ShieldCheck aria-hidden="true" className="size-4" />
            <p className="text-xs font-bold tracking-[0.12em] uppercase">
              Administrador
            </p>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">
            Ícono de la aplicación
          </h2>
          <p className="mt-2 max-w-xl leading-7 text-zinc-600">
            Se mostrará en la barra lateral, la navegación móvil y la pestaña del
            navegador. Acepta PNG cuadrado de hasta 512 KB y 512 × 512 px.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <Image
            alt="Vista previa del ícono actual de IDM OS"
            className="size-14 rounded-lg object-cover shadow-sm"
            height={56}
            src={iconUrl}
            unoptimized
            width={56}
          />
          <span className="text-sm font-medium text-zinc-600">
            {hasCustomIcon ? "Ícono personalizado" : "Ícono predeterminado"}
          </span>
        </div>
      </div>

      <form action={formAction} className="mt-8 border-t border-zinc-100 pt-6">
        <label className="block text-sm font-semibold text-zinc-800" htmlFor="app-icon">
          Reemplazar ícono
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            accept="image/png"
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-orange-800 hover:file:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
            id="app-icon"
            name="appIcon"
            required
            type="file"
          />
          <button
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-orange-300"
            disabled={isPending}
            type="submit"
          >
            <ImageUp aria-hidden="true" className="size-4" />
            {isPending ? "Guardando…" : "Guardar ícono"}
          </button>
        </div>
        <p
          aria-live="polite"
          className={`mt-4 text-sm ${
            state.status === "error" ? "text-orange-800" : "text-zinc-600"
          }`}
        >
          {state.message}
        </p>
      </form>
    </section>
  );
}
