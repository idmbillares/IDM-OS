import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-6 text-zinc-900">
      <section className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.12em] text-orange-700 uppercase">
          IDM OS
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Esta página no está disponible
        </h1>
        <p className="mt-3 text-base leading-7 text-zinc-600">
          Verifica la dirección o vuelve al inicio para continuar.
        </p>
        <Link
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Ir a Inicio
        </Link>
      </section>
    </main>
  );
}
