import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ModuleDefinition } from "@/lib/navigation";

type ModulePlaceholderProps = {
  module: ModuleDefinition;
};

export function ModulePlaceholder({ module }: ModulePlaceholderProps) {
  const Icon = module.icon;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="IDM OS" title={module.label}>
        <StatusBadge label="En preparación" />
      </PageHeader>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50 px-6 py-4 sm:px-8">
          <p className="text-sm font-medium text-zinc-600">IDM OS / {module.label}</p>
        </div>
        <div className="px-6 py-12 sm:px-10 sm:py-16">
          <div className="flex max-w-xl flex-col items-start">
            <div className="grid size-12 place-items-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <Icon aria-hidden="true" className="size-6" strokeWidth={1.7} />
            </div>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-950">
              Este módulo estará disponible próximamente
            </h2>
            <p className="mt-3 text-base leading-7 text-zinc-600">
              {module.description}
            </p>
            <p className="mt-7 flex items-center gap-2 text-sm leading-6 text-zinc-500">
              <Clock3 aria-hidden="true" className="size-4 text-zinc-400" />
              La información se mostrará aquí cuando esté disponible en el sistema.
            </p>
            <Link
              className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Volver a Inicio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
