"use client";

import { ImageUp, LockKeyhole, ShieldCheck, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";
import { maxAppIconBytes } from "@/modules/branding/contracts";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [state, formAction, isPending] = useActionState(
    updateApplicationIcon,
    initialBrandingActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      const timer = window.setTimeout(() => {
        setPreview(null);
        setFileError("");
        if (input.current) input.current.value = "";
        router.refresh();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [router, state]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

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
    <section
      id="marca"
      className="scroll-mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
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
            src={preview ?? iconUrl}
            unoptimized
            width={56}
          />
          <span className="text-sm font-medium text-zinc-600">
            {preview
              ? "Vista previa · sin guardar"
              : hasCustomIcon
                ? "Ícono personalizado"
                : "Ícono predeterminado"}
          </span>
        </div>
      </div>

      <form action={formAction} className="mt-8 border-t border-zinc-100 pt-6">
        <TabUnlockField />
        <input name="intent" type="hidden" value="upload" />
        <label className="block text-sm font-semibold text-zinc-800" htmlFor="app-icon">
          Reemplazar ícono
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            accept="image/png"
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-orange-800 hover:file:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
            id="app-icon"
            ref={input}
            disabled={isPending}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              const field = event.currentTarget;
              if (file && (file.type !== "image/png" || file.size > maxAppIconBytes)) {
                setFileError(
                  file.type !== "image/png"
                    ? "Formato incorrecto: selecciona un PNG."
                    : "El archivo supera el máximo de 512 KB.",
                );
                setPreview(null);
                event.target.value = "";
                return;
              }
              setFileError("");
              setPreview(null);
              if (!file) return;
              const url = URL.createObjectURL(file);
              const image = new window.Image();
              image.src = url;
              try {
                await image.decode();
                if (field.files?.[0] !== file) {
                  URL.revokeObjectURL(url);
                  return;
                }
                if (
                  !image.naturalWidth ||
                  image.naturalWidth !== image.naturalHeight ||
                  image.naturalWidth > 512
                ) {
                  throw new Error(
                    "Dimensiones incorrectas: usa un PNG cuadrado de máximo 512 × 512 px.",
                  );
                }
                setPreview(url);
              } catch (error) {
                URL.revokeObjectURL(url);
                if (field.files?.[0] !== file) return;
                field.value = "";
                setFileError(
                  error instanceof Error && error.message.startsWith("Dimensiones")
                    ? error.message
                    : "El archivo PNG está corrupto o no se puede leer.",
                );
              }
            }}
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
          {fileError || state.message}
        </p>
      </form>
      {hasCustomIcon ? (
        <form
          action={formAction}
          className="mt-4"
          onSubmit={() => {
            setPreview(null);
            if (input.current) input.current.value = "";
          }}
        >
          <TabUnlockField />
          <input name="intent" type="hidden" value="restore" />
          <button
            disabled={isPending}
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RotateCcw className="size-4" />
            Restaurar ícono predeterminado
          </button>
        </form>
      ) : null}
    </section>
  );
}
