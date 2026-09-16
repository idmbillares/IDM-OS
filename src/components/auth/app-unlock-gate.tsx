"use client";

import { LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import {
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  configurePinAction,
  lockAppAction,
  signOutIdmAction,
  touchAppUnlockAction,
  unlockWithPinAction,
  verifyTabUnlockAction,
  type PinActionState,
} from "@/app/(dashboard)/security-actions";
import { AppBrandIcon } from "@/components/branding/app-brand-icon";
import { tabUnlockStorageKey } from "@/modules/auth/unlock-client";

const initialState: PinActionState = { message: "", status: "idle" };

export function AppUnlockGate({
  brandIconUrl,
  children,
  displayName,
  pinConfigured,
}: {
  brandIconUrl: string;
  children: ReactNode;
  displayName: string;
  pinConfigured: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [configured, setConfigured] = useState(pinConfigured);
  const tokenRef = useRef<string | null>(null);
  const lastServerTouchRef = useRef(0);

  useEffect(() => {
    const token = window.sessionStorage.getItem(tabUnlockStorageKey);
    tokenRef.current = token;
    void verifyTabUnlockAction(token).then((result) => {
      setConfigured(result.pinConfigured);
      setStatus(result.unlocked ? "unlocked" : "locked");
    });
  }, []);

  const finishUnlock = (token: string) => {
    window.sessionStorage.setItem(tabUnlockStorageKey, token);
    tokenRef.current = token;
    lastServerTouchRef.current = Date.now();
    setStatus("unlocked");
    router.refresh();
  };
  const lock = useCallback(() => {
    const token = tokenRef.current;
    window.sessionStorage.removeItem(tabUnlockStorageKey);
    tokenRef.current = null;
    setStatus("locked");
    void lockAppAction(token);
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (status !== "unlocked") return;
    let timeout = window.setTimeout(lock, 15 * 60 * 1000);
    const resetTimer = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(lock, 15 * 60 * 1000);
      if (Date.now() - lastServerTouchRef.current >= 60_000) {
        lastServerTouchRef.current = Date.now();
        void touchAppUnlockAction(tokenRef.current).then((stillUnlocked) => {
          if (!stillUnlocked) lock();
        });
      }
    };
    const events: Array<keyof WindowEventMap> = [
      "keydown",
      "mousedown",
      "touchstart",
      "scroll",
    ];
    events.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true }),
    );
    return () => {
      window.clearTimeout(timeout);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [lock, status]);

  if (status === "unlocked") {
    return <>{children}</>;
  }

  return (
    <UnlockScreen
      brandIconUrl={brandIconUrl}
      checking={status === "checking"}
      displayName={displayName}
      isSetup={!configured}
      onUnlocked={finishUnlock}
    />
  );
}

function UnlockScreen({
  brandIconUrl,
  checking,
  displayName,
  isSetup,
  onUnlocked,
}: {
  brandIconUrl: string;
  checking: boolean;
  displayName: string;
  isSetup: boolean;
  onUnlocked: (token: string) => void;
}) {
  const [setupState, setupAction, setupPending] = useActionState(
    configurePinAction,
    initialState,
  );
  const [unlockState, unlockAction, unlockPending] = useActionState(
    unlockWithPinAction,
    initialState,
  );
  const state = isSetup ? setupState : unlockState;
  const pending = isSetup ? setupPending : unlockPending;
  useEffect(() => {
    if (state.status === "success" && state.token) onUnlocked(state.token);
  }, [onUnlocked, state.status, state.token]);

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-2 shadow-2xl">
        <div className="rounded-2xl bg-zinc-50 p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <AppBrandIcon iconUrl={brandIconUrl} />
            <div>
              <p className="font-bold tracking-[0.13em] text-zinc-950">IDM OS</p>
              <p className="mt-1 text-sm text-zinc-600">Acceso personal protegido</p>
            </div>
          </div>
          <div className="mt-8 border-t border-zinc-200 pt-7">
            <span className="grid size-11 place-items-center rounded-xl bg-orange-100 text-orange-800">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">
              {checking
                ? "Verificando acceso…"
                : isSetup
                  ? "Protege tu acceso a IDM OS"
                  : `Bienvenido, ${displayName}`}
            </h1>
            <p className="mt-2 leading-6 text-zinc-600">
              {checking
                ? ""
                : isSetup
                  ? "Crea un PIN personal de 6 dígitos. No es tu contraseña de Google."
                  : "Ingresa tu clave personal de IDM OS para continuar."}
            </p>
            {!checking ? (
              <form
                action={isSetup ? setupAction : unlockAction}
                className="mt-6 space-y-4"
              >
                <label className="block text-sm font-semibold text-zinc-800">
                  PIN personal
                  <input
                    autoComplete={isSetup ? "new-password" : "current-password"}
                    className="mt-2 block min-h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-center text-xl tracking-[0.45em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                    inputMode="numeric"
                    maxLength={6}
                    name="pin"
                    pattern="[0-9]{6}"
                    required
                    type="password"
                  />
                </label>
                {isSetup ? (
                  <label className="block text-sm font-semibold text-zinc-800">
                    Confirma tu PIN
                    <input
                      autoComplete="new-password"
                      className="mt-2 block min-h-12 w-full rounded-lg border border-zinc-300 bg-white px-3 text-center text-xl tracking-[0.45em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                      inputMode="numeric"
                      maxLength={6}
                      name="confirmation"
                      pattern="[0-9]{6}"
                      required
                      type="password"
                    />
                  </label>
                ) : null}
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
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800 disabled:bg-orange-300"
                  disabled={pending}
                  type="submit"
                >
                  <LockKeyhole className="size-4" />
                  {pending
                    ? "Verificando…"
                    : isSetup
                      ? "Crear PIN y desbloquear"
                      : "Desbloquear"}
                </button>
              </form>
            ) : null}
            <form action={signOutIdmAction} className="mt-4">
              <button
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                type="submit"
              >
                <LogOut className="size-4" />
                Cerrar sesión / cambiar cuenta Google
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
