import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ReceiptActions } from "@/components/pos/receipt-actions";
import { requireRole } from "@/modules/auth/contracts";
import { getAuthProvider } from "@/modules/auth/provider";
import { formatCop } from "@/modules/financial/money";
import { getSale, listPosAccounts, posSchemaReady } from "@/modules/pos/service";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(getAuthProvider(), "ADMINISTRADOR");
  if (!(await posSchemaReady()))
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operación"
          title="Punto de Venta"
          description="La migración del POS está pendiente en esta base de datos."
        />
      </div>
    );
  const { id } = await params;
  const sale = await getSale(id);
  const accounts = await listPosAccounts();
  const received = sale.payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const date = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(sale.createdAt));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Punto de Venta"
          title="Comprobante interno"
          description="Registro operativo de la venta; no es una factura electrónica DIAN."
        />
      </div>
      <section className="rounded-2xl border bg-white p-6 print:border-0 print:p-0">
        <div className="flex flex-wrap justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">IDM Fábrica de Billares</h1>
            <p className="text-sm text-zinc-600">
              Comprobante interno · No válido como factura fiscal
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{sale.saleNumber}</p>
            <p className="text-sm">{date}</p>
            <p className="text-sm">
              {sale.status === "VOIDED" ? "ANULADA" : "REGISTRADA"}
            </p>
          </div>
        </div>
        <p className="py-4 text-sm">Cliente: {sale.customerName || "No registrado"}</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="p-2">Producto o servicio</th>
                <th className="p-2">Cantidad</th>
                <th className="p-2">Precio</th>
                <th className="p-2">Descuento</th>
                <th className="p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr className="border-t" key={item.sku}>
                  <td className="p-2">
                    {item.name}
                    <span className="block text-xs text-zinc-500">{item.sku}</span>
                  </td>
                  <td className="p-2">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="p-2">{formatCop(item.unitPriceMinor)}</td>
                  <td className="p-2">{formatCop(item.discountMinor)}</td>
                  <td className="p-2">{formatCop(item.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-1 border-t pt-4 text-right text-sm">
          <p>
            Total: <strong>{formatCop(sale.totalMinor)}</strong>
          </p>
          <p>
            {sale.status === "VOIDED" ? "Recibido y compensado" : "Recibido"}:{" "}
            <strong>{formatCop(received)}</strong>
          </p>
          <p>
            Saldo pendiente actual:{" "}
            <strong>
              {formatCop(sale.status === "VOIDED" ? 0 : sale.totalMinor - received)}
            </strong>
          </p>
        </div>
        <div className="mt-4 border-t pt-4 text-sm">
          <h2 className="font-semibold">Pagos registrados</h2>
          {sale.payments.length ? (
            sale.payments.map((payment, index) => (
              <p key={index}>
                {payment.accountName}: {formatCop(payment.amountMinor)}
              </p>
            ))
          ) : (
            <p>Sin dinero recibido al registrar la venta.</p>
          )}
        </div>
        {sale.status === "VOIDED" ? (
          <p className="mt-4 font-semibold text-red-800">
            Venta anulada. Motivo: {sale.voidReason}
          </p>
        ) : null}
      </section>
      <ReceiptActions
        saleId={sale.id}
        status={sale.status}
        pendingMinor={sale.totalMinor - received}
        accounts={accounts}
        collectionKey={randomUUID()}
      />
      <Link
        className="print:hidden text-sm font-semibold text-orange-800 underline"
        href="/ventas"
      >
        Volver al Punto de Venta
      </Link>
    </div>
  );
}
