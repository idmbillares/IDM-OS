import { randomUUID } from "node:crypto";
import { openingBatchSchemaReady } from "@/modules/inventory/opening-batches";
import { InventoryPanel } from "@/components/inventory/inventory-panel";
import { PageHeader } from "@/components/ui/page-header";
import { requireCurrentSession } from "@/modules/auth/provider";
import { assertCashRead } from "@/modules/financial/permissions";
import { moneyForQuantity } from "@/modules/inventory/quantity";
import {
  inventoryCategories,
  inventoryActors,
  listInventory,
  listInventoryMovements,
} from "@/modules/inventory/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireCurrentSession();
  assertCashRead(session);
  const isAdministrator = session.roles.includes("ADMINISTRADOR");
  const canViewCost = isAdministrator || session.roles.includes("CONTADORA");
  const filters = await searchParams;
  const [products, allProducts, categories, movements, actors, batchReady] =
    await Promise.all([
      listInventory(filters),
      listInventory(),
      inventoryCategories(),
      listInventoryMovements(filters),
      inventoryActors(),
      openingBatchSchemaReady(),
    ]);
  const active = allProducts.filter((product) => product.isActive);
  const physical = active.filter((product) => product.category !== "Servicios");
  const valuationComplete = physical.every(
    (product) => product.quantity === 0 || product.costMinor > 0,
  );
  const estimatedValue = valuationComplete
    ? physical.reduce(
        (sum, product) => sum + moneyForQuantity(product.costMinor, product.quantity),
        0,
      )
    : null;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operación"
        title="Inventario"
        description="Productos, existencias y kardex auditable."
      />
      <InventoryPanel
        products={products.map((product) => ({
          ...product,
          costMinor: canViewCost ? product.costMinor : null,
        }))}
        categories={categories}
        movements={movements}
        actors={actors}
        movementFilters={filters}
        initialOpeningKey={randomUUID()}
        initialMovementKey={randomUUID()}
        isAdministrator={isAdministrator}
        canViewCost={canViewCost}
        batchReady={batchReady}
        summary={{
          activeCount: active.length,
          lowStockCount: physical.filter(
            (product) => product.quantity <= product.minimumQuantity,
          ).length,
          estimatedValue:
            canViewCost &&
            estimatedValue !== null &&
            Number.isSafeInteger(estimatedValue)
              ? estimatedValue
              : null,
        }}
      />
    </div>
  );
}
