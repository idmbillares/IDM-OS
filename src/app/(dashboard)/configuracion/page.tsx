import { Settings2 } from "lucide-react";

import { BrandingSettingsPanel } from "@/components/branding/branding-settings-panel";
import { ProfileSettingsPanel } from "@/components/auth/profile-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getAuthProvider } from "@/modules/auth/provider";
import { getBrandingSnapshot } from "@/modules/branding/service";
import { getOwnProfile } from "@/modules/auth/profile";

async function getAdministratorStatus() {
  try {
    const session = await getAuthProvider().getSession();

    return session?.roles.includes("ADMINISTRADOR") ?? false;
  } catch {
    return false;
  }
}

export default async function ConfigurationPage() {
  const session = await getAuthProvider().getSession();
  const [branding, isAdministrator, profile] = await Promise.all([
    getBrandingSnapshot(),
    getAdministratorStatus(),
    session ? getOwnProfile(session.id) : null,
  ]);
  const iconUrl = `/api/branding/icon?v=${branding.revision}`;

  return (
    <div className="space-y-8">
      <PageHeader
        description="Preferencias globales de IDM OS y controles reservados a administración."
        eyebrow="Administración"
        title="Perfil y configuración"
      />

      <section className="flex items-start gap-4 rounded-2xl border border-orange-100 bg-orange-50 p-5 text-orange-950">
        <Settings2
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-orange-700"
        />
        <p className="max-w-3xl text-sm leading-6">
          La marca usa blanco, naranja y negro. El cambio de ícono se conserva como una
          configuración global auditada; no modifica información financiera ni perfiles
          de otros usuarios.
        </p>
      </section>

      {profile ? <ProfileSettingsPanel profile={profile} /> : null}

      <BrandingSettingsPanel
        hasCustomIcon={branding.hasCustomIcon}
        iconUrl={iconUrl}
        isAdministrator={isAdministrator}
      />
    </div>
  );
}
