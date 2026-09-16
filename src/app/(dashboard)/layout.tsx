import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { AppUnlockGate } from "@/components/auth/app-unlock-gate";
import { getAuthProvider } from "@/modules/auth/provider";
import { hasPersonalPin } from "@/modules/auth/app-security";
import { getBrandingSnapshot } from "@/modules/branding/service";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection();

  const [session, branding] = await Promise.all([
    getAuthProvider().getSession(),
    getBrandingSnapshot(),
  ]);

  if (!session) {
    redirect("/acceso");
  }

  const brandIconUrl = `/api/branding/icon?v=${branding.revision}`;

  return (
    <AppUnlockGate
      brandIconUrl={brandIconUrl}
      displayName={session.displayName}
      pinConfigured={await hasPersonalPin(session.id)}
    >
      <AppShell brandIconUrl={brandIconUrl} session={session}>
        {children}
      </AppShell>
    </AppUnlockGate>
  );
}
