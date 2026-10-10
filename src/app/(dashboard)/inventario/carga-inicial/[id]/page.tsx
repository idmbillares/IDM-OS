import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { OpeningBatchConfirm } from "@/components/inventory/opening-batch-confirm";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import {
  getOpeningBatch,
  openingBatchSchemaReady,
} from "@/modules/inventory/opening-batches";
import { listInventory } from "@/modules/inventory/service";
import { formatCop } from "@/modules/financial/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function OpeningBatchReview({
  params,
}: {
  params: Promise<{ id: string }>;
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
      </div>
    );
  const { id } = await params;
  const [batch, products] = await Promise.all([getOpeningBatch(id), listInventory()]);
  const names = new Map(products.map((product) => [product.id, product]));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Inventario"
        title="Revisar carga inicial"
        description="La confirmación publica todos los movimientos juntos y no altera Caja."
      />
      <section className="rounded-2xl border bg-white p-5">
        <p className="text-sm">
          Estado:{" "}
          <strong>{batch.status === "DRAFT" ? "Borrador" : "Confirmada"}</strong>
        </p>
        <p className="text-sm">Referencia: {batch.reference || "—"}</p>
        <p className="text-sm">Observaciones: {batch.notes || "—"}</p>
      </section>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-3">Producto</th>
              <th className="p-3">Cantidad</th>
              <th className="p-3">Costo unitario</th>
              <th className="p-3">Precio de referencia</th>
            </tr>
          </thead>
          <tbody>
            {batch.items.map((item) => (
              <tr className="border-t" key={item.productId}>
                <td className="p-3">
                  {names.get(item.productId)?.name ?? item.productId}
                  <span className="block text-xs text-zinc-500">
                    {names.get(item.productId)?.sku}
                  </span>
                </td>
                <td className="p-3">
                  {item.quantity} {names.get(item.productId)?.unit}
                </td>
                <td className="p-3">{formatCop(item.unitCostMinor)}</td>
                <td className="p-3">{formatCop(item.salePriceMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {batch.status === "DRAFT" ? (
        <OpeningBatchConfirm batchId={batch.id} itemCount={batch.items.length} />
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          Carga confirmada. Los movimientos se pueden consultar en el Kardex.
        </p>
      )}
      <Link
        className="text-sm font-semibold text-orange-800 underline"
        href={`/inventario/carga-inicial?batch=${batch.id}`}
      >
        Volver al borrador
      </Link>
    </div>
  );
}
