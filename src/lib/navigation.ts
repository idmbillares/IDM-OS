import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Factory,
  Landmark,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  UsersRound,
} from "lucide-react";

export type ModuleSlug =
  | "caja"
  | "ventas"
  | "inventario"
  | "clientes"
  | "proveedores"
  | "produccion"
  | "agenda"
  | "reportes"
  | "configuracion";

export type ModuleDefinition = {
  slug: ModuleSlug;
  href: `/${ModuleSlug}`;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type NavigationGroup = {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: LucideIcon;
  }>;
};

export const cashNavigation = [
  { href: "/caja", label: "Resumen", icon: Landmark },
  { href: "/caja/movimientos", label: "Movimientos", icon: BarChart3 },
] as const;

export const placeholderModules: ModuleDefinition[] = [
  {
    slug: "caja",
    href: "/caja",
    label: "Caja",
    description: "Aquí se registrarán y consultarán cuentas y movimientos financieros.",
    icon: Landmark,
  },
  {
    slug: "ventas",
    href: "/ventas",
    label: "Punto de Venta",
    description: "Ventas internas, pagos recibidos y comprobantes.",
    icon: ShoppingCart,
  },
  {
    slug: "inventario",
    href: "/inventario",
    label: "Inventario",
    description: "Aquí se consultarán productos y movimientos de inventario.",
    icon: Package,
  },
  {
    slug: "clientes",
    href: "/clientes",
    label: "Clientes",
    description: "Aquí se organizará la información e historial de clientes.",
    icon: UsersRound,
  },
  {
    slug: "proveedores",
    href: "/proveedores",
    label: "Proveedores",
    description:
      "Aquí se administrarán proveedores y operaciones de compra relacionadas.",
    icon: Truck,
  },
  {
    slug: "produccion",
    href: "/produccion",
    label: "Producción",
    description: "Aquí se gestionarán órdenes de producción y sus materiales.",
    icon: Factory,
  },
  {
    slug: "agenda",
    href: "/agenda",
    label: "Agenda",
    description: "Aquí se organizarán trabajos programados.",
    icon: CalendarDays,
  },
  {
    slug: "reportes",
    href: "/reportes",
    label: "Reportes",
    description:
      "Aquí se consultarán reportes operativos y financieros cuando estén habilitados.",
    icon: BarChart3,
  },
  {
    slug: "configuracion",
    href: "/configuracion",
    label: "Configuración",
    description: "Aquí se administrará la configuración base del sistema.",
    icon: Settings,
  },
];

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      ...placeholderModules
        .filter(({ slug }) => slug !== "caja")
        .slice(0, 6)
        .map(({ href, label, icon }) => ({
          href,
          label,
          icon,
        })),
    ],
  },
  {
    label: "Administración",
    items: placeholderModules.slice(7).map(({ href, label, icon }) => ({
      href,
      label,
      icon,
    })),
  },
];

export function getPlaceholderModule(slug: string) {
  return placeholderModules.find((module) => module.slug === slug);
}
