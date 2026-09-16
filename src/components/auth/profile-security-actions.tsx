"use client";

import { LogOut } from "lucide-react";

import { signOutIdmAction } from "@/app/(dashboard)/security-actions";
import { tabUnlockStorageKey } from "@/modules/auth/unlock-client";

export function ProfileSecurityActions() {
  return (
    <div className="mt-4">
      <form
        action={signOutIdmAction}
        onSubmit={() => window.sessionStorage.removeItem(tabUnlockStorageKey)}
      >
        <button
          className="inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          type="submit"
        >
          <LogOut aria-hidden="true" className="size-4" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
