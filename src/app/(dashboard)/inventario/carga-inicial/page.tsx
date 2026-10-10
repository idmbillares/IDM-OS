import { randomUUID } from "node:crypto";
import { PageHeader } from "@/components/ui/page-header";
import { OpeningBatchPanel } from "@/components/inventory/opening-batch-panel";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { listInventory } from "@/modules/inventory/service";
import {
  getOpeningBatch,
  listOpeningBatches,
  openingBatchSchemaReady,
} from "@/modules/inventory/opening-batches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function OpeningBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  await requireRole(getAuthProvider(), "ADMINISTRADOR");
  if (!(await openingBatchSchemaReady()))
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Inventario"
          title="Carga inicial"
          description="La migración de borradores está pendiente en esta base de datos."
        />
        <p className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm">
          La carga por borradores se habilitará después del respaldo y la migración
          verificados.
        </p>
      </div>
    );
  const { batch: batchId } = await searchParams;
  const [products, batches, selected] = await Promise.all([
    listInventory({ status: "active" }),
    listOpeningBatches(),
    batchId ? getOpeningBatch(batchId) : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Inventario"
        title="Carga inicial"
        description="Digitaliza el conteo en borradores y confirma solo después de revisarlo."
      />
      <OpeningBatchPanel
        products={products.map(
          ({ id, sku, name, unit, category, costMinor, salePriceMinor, quantity }) => ({
            id,
            sku,
            name,
            unit,
            category,
            costMinor,
            salePriceMinor,
            quantity,
          }),
        )}
        batches={batches}
        selected={selected}
        batchId={selected?.id ?? randomUUID()}
      />
    </div>
  );
}
