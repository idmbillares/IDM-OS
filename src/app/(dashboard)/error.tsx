"use client";

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold tracking-[0.12em] text-orange-700 uppercase">
        Error recuperable
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
        No fue posible cargar esta sección
      </h1>
      <p className="mt-3 text-base leading-7 text-zinc-600">
        Intenta de nuevo. Si el problema continúa, informa al administrador del sistema.
      </p>
      <button
        className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
        onClick={reset}
        type="button"
      >
        <RefreshCcw aria-hidden="true" className="size-4" />
        Intentar de nuevo
      </button>
    </section>
  );
}
