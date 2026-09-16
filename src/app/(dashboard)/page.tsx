import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Landmark,
  Package,
  ShoppingCart,
} from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getFinancialOverview } from "@/modules/financial/ledger";

const quickLinks = [
  {
    href: "/caja",
    label: "Caja",
    description: "Cuentas y movimientos",
    icon: Landmark,
  },
  {
    href: "/ventas",
    label: "Ventas",
    description: "Ventas y recibos",
    icon: ShoppingCart,
  },
  {
    href: "/inventario",
    label: "Inventario",
    description: "Productos y movimientos",
    icon: Package,
  },
  {
    href: "/agenda",
    label: "Agenda",
    description: "Trabajos programados",
    icon: CalendarDays,
  },
];

const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const overview = await getFinancialOverview();
  return (
    <div className="space-y-9">
      <PageHeader
        eyebrow="Inicio"
        title="Bienvenido a IDM OS"
        description="El centro de operación interno de IDM Fábrica de Billares."
      />

      <section className="relative overflow-hidden rounded-2xl bg-zinc-950 px-6 py-8 text-white shadow-lg sm:px-8 sm:py-10">
        <div className="absolute top-0 right-0 h-36 w-36 translate-x-10 -translate-y-10 rounded-full border-[18px] border-orange-500/25" />
        <div className="relative max-w-2xl">
          <StatusBadge label="Estado inicial" />
          <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
            El sistema está listo para comenzar
          </h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-zinc-300">
            Los indicadores y registros se mostrarán únicamente cuando existan datos
            reales.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Saldo disponible", overview.totalAvailableMinor],
          ["Ingresos del mes", overview.incomeMinor],
          ["Egresos del mes", overview.expenseMinor],
          ["Flujo neto del mes", overview.incomeMinor - overview.expenseMinor],
        ].map(([label, value]) => (
          <div
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-zinc-600">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-950">
              {money.format(value as number)}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="quick-access-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-zinc-950"
              id="quick-access-heading"
            >
              Accesos rápidos
            </h2>
            <p className="mt-1 text-base text-zinc-600">
              Ingresa a las áreas que se habilitarán por fases.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;

            return (
              <Link
                className="group min-h-40 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                href={link.href}
                key={link.href}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-orange-50 text-orange-700">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="mt-1 size-4 text-zinc-400 transition-transform group-hover:translate-x-1 group-hover:text-orange-700"
                  />
                </div>
                <h3 className="mt-6 text-base font-semibold text-zinc-950">
                  {link.label}
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {link.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="upcoming-work-heading" className="max-w-3xl">
        <div className="mb-5">
          <h2
            className="text-xl font-semibold tracking-tight text-zinc-950"
            id="upcoming-work-heading"
          >
            Próximos trabajos
          </h2>
        </div>
        <EmptyState
          description="Cuando se registren trabajos en Agenda, aparecerán aquí."
          icon={ClipboardCheck}
          title="Aún no hay trabajos programados"
        />
      </section>
    </div>
  );
}
