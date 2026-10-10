import { randomUUID } from "node:crypto";
import { PageHeader } from "@/components/ui/page-header";
import { PosPanel } from "@/components/pos/pos-panel";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { listInventory } from "@/modules/inventory/service";
import { listPosAccounts, listSales, posSchemaReady } from "@/modules/pos/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  await requireRole(getAuthProvider(), "ADMINISTRADOR");
  if (!(await posSchemaReady()))
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operación"
          title="Punto de Venta"
          description="La migración del POS está pendiente en esta base de datos."
        />
        <p className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm">
          Las ventas se habilitarán después del respaldo y la migración verificados.
        </p>
      </div>
    );
  const [products, accounts, sales] = await Promise.all([
    listInventory({ status: "active" }),
    listPosAccounts(),
    listSales(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operación"
        title="Punto de Venta"
        description="Ventas internas, descuentos de inventario y pagos recibidos en Caja."
      />
      <PosPanel
        products={products.map(
          ({ id, sku, name, category, unit, salePriceMinor, quantity }) => ({
            id,
            sku,
            name,
            category,
            unit,
            salePriceMinor,
            quantity,
          }),
        )}
        accounts={accounts}
        sales={sales}
        initialKey={randomUUID()}
      />
    </div>
  );
}
