import { LogIn } from "lucide-react";

import { signInWithGoogle } from "@/app/acceso/actions";

export function GoogleLoginPanel() {
  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-950/5 sm:p-8">
      <p className="text-sm leading-6 text-zinc-600">
        Ingresa con tu cuenta Google autorizada para IDM OS.
      </p>
      <form action={signInWithGoogle} className="mt-6">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
          type="submit"
        >
          <LogIn className="size-4" />
          Continuar con Google
        </button>
      </form>
    </section>
  );
}
