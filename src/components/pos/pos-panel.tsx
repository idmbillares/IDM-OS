"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createSaleAction,
  type SaleActionState,
} from "@/app/(dashboard)/ventas/actions";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";
import { formatCop } from "@/modules/financial/money";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  salePriceMinor: number;
  quantity: number;
};
type Account = { id: string; name: string };
type Sale = {
  id: string;
  saleNumber: string;
  status: string;
  customerName: string | null;
  totalMinor: number;
  paidMinor: number;
  createdAt: Date;
};
type CartLine = { productId: string; quantity: number; discountMinor: number };
type Payment = { accountId: string; amountMinor: number };
const idle: SaleActionState = { status: "idle", message: "" };

export function PosPanel({
  products,
  accounts,
  sales,
  initialKey,
}: {
  products: Product[];
  accounts: Account[];
  sales: Sale[];
  initialKey: string;
}) {
  const [state, action] = useActionState(createSaleAction, idle);
  const [key, setKey] = useState(initialKey);
  const [query, setQuery] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const completed = state.status === "success" && state.submittedKey === key;
  const productById = new Map(products.map((product) => [product.id, product]));
  const total = cart.reduce((sum, line) => {
    const product = productById.get(line.productId);
    return sum + (product?.salePriceMinor ?? 0) * line.quantity - line.discountMinor;
  }, 0);
  const paid = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const saleData = JSON.stringify({
    customerName,
    items: cart.map((line) => ({
      ...line,
      expectedPriceMinor: productById.get(line.productId)?.salePriceMinor ?? 0,
    })),
    payments: payments.filter(
      (payment) => payment.accountId && payment.amountMinor > 0,
    ),
  });
  function changeLine(id: string, changes: Partial<CartLine>) {
    setCart((current) =>
      current.map((line) => (line.productId === id ? { ...line, ...changes } : line)),
    );
  }
  function newSale() {
    setKey(crypto.randomUUID());
    setCart([]);
    setPayments([]);
    setCustomerName("");
  }
  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Productos y servicios</h2>
          <input
            className="mt-3 min-h-11 w-full rounded-lg border p-3"
            placeholder="Buscar por nombre, SKU o referencia"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar productos"
          />
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {products
              .filter((product) =>
                `${product.name} ${product.sku}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-zinc-600">
                      {product.sku} · {product.category}
                    </p>
                    <p className="text-sm">
                      {formatCop(product.salePriceMinor)} ·{" "}
                      {product.category === "Servicios"
                        ? "Servicio"
                        : `${product.quantity} ${product.unit} disponibles`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      completed ||
                      (product.category !== "Servicios" && product.quantity === 0)
                    }
                    className="min-h-10 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() =>
                      setCart((current) =>
                        current.some((line) => line.productId === product.id)
                          ? current
                          : [
                              ...current,
                              { productId: product.id, quantity: 1, discountMinor: 0 },
                            ],
                      )
                    }
                  >
                    Agregar
                  </button>
                </div>
              ))}
            {products.length === 0 ? (
              <p className="text-sm text-zinc-600">
                Primero registra productos en Inventario.
              </p>
            ) : null}
          </div>
        </section>
        <form
          action={action}
          className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50 p-5"
        >
          <TabUnlockField />
          <input name="idempotencyKey" type="hidden" value={key} readOnly />
          <input name="saleData" type="hidden" value={saleData} readOnly />
          <h2 className="text-lg font-semibold">Venta actual</h2>
          <label className="block text-sm font-semibold">
            Cliente (opcional)
            <input
              className="mt-1 min-h-11 w-full rounded-lg border bg-white p-2"
              maxLength={160}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          {cart.map((line) => {
            const product = productById.get(line.productId)!;
            return (
              <div key={line.productId} className="rounded-xl border bg-white p-3">
                <div className="flex justify-between gap-2">
                  <strong>{product.name}</strong>
                  <button
                    type="button"
                    className="text-sm text-orange-800 underline"
                    onClick={() =>
                      setCart((current) =>
                        current.filter((item) => item.productId !== line.productId),
                      )
                    }
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <label>
                    Cantidad
                    <input
                      className="mt-1 w-full rounded-lg border p-2"
                      type="number"
                      min="1"
                      max={
                        product.category === "Servicios" ? undefined : product.quantity
                      }
                      value={line.quantity}
                      onChange={(event) =>
                        changeLine(line.productId, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Descuento COP
                    <input
                      className="mt-1 w-full rounded-lg border p-2"
                      type="number"
                      min="0"
                      value={line.discountMinor}
                      onChange={(event) =>
                        changeLine(line.productId, {
                          discountMinor: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <p className="mt-2 text-right text-sm font-semibold">
                  {formatCop(
                    product.salePriceMinor * line.quantity - line.discountMinor,
                  )}
                </p>
              </div>
            );
          })}
          <div className="border-t border-orange-200 pt-3 text-sm">
            <p className="flex justify-between">
              <span>Total</span>
              <strong>{formatCop(total)}</strong>
            </p>
            <p className="flex justify-between">
              <span>Recibido</span>
              <strong>{formatCop(paid)}</strong>
            </p>
            <p className="flex justify-between">
              <span>Pendiente</span>
              <strong>{formatCop(Math.max(0, total - paid))}</strong>
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Pagos recibidos</h3>
              <button
                type="button"
                className="text-sm font-semibold text-orange-800 underline"
                onClick={() =>
                  setPayments((current) => [
                    ...current,
                    { accountId: "", amountMinor: 0 },
                  ])
                }
              >
                Agregar pago
              </button>
            </div>
            {payments.length === 0 ? (
              <p className="text-xs text-zinc-600">
                Sin pago recibido: la venta quedará pendiente de cobro.
              </p>
            ) : null}
            {payments.map((payment, index) => (
              <div className="grid grid-cols-[1fr_100px_auto] gap-2" key={index}>
                <select
                  className="min-h-10 min-w-0 rounded-lg border bg-white p-2 text-sm"
                  aria-label={`Cuenta del pago ${index + 1}`}
                  value={payment.accountId}
                  onChange={(event) =>
                    setPayments((current) =>
                      current.map((entry, i) =>
                        i === index
                          ? { ...entry, accountId: event.target.value }
                          : entry,
                      ),
                    )
                  }
                >
                  <option value="">Cuenta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
                <input
                  className="min-h-10 min-w-0 rounded-lg border bg-white p-2 text-sm"
                  aria-label={`Valor del pago ${index + 1}`}
                  type="number"
                  min="1"
                  value={payment.amountMinor || ""}
                  onChange={(event) =>
                    setPayments((current) =>
                      current.map((entry, i) =>
                        i === index
                          ? { ...entry, amountMinor: Number(event.target.value) }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="px-2 text-sm text-orange-800"
                  onClick={() =>
                    setPayments((current) => current.filter((_, i) => i !== index))
                  }
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <SubmitButton
            disabled={
              completed ||
              cart.length === 0 ||
              !Number.isSafeInteger(total) ||
              total <= 0 ||
              paid > total ||
              payments.some((payment) => !payment.accountId || payment.amountMinor <= 0)
            }
          />
          {state.message ? (
            <p
              role="status"
              className={
                state.status === "error"
                  ? "text-sm font-semibold text-red-700"
                  : "text-sm font-semibold text-emerald-700"
              }
            >
              {state.message}
            </p>
          ) : null}
          {state.saleId && completed ? (
            <div className="space-y-2">
              <Link
                className="block font-semibold text-orange-900 underline"
                href={`/ventas/${state.saleId}`}
              >
                Ver comprobante interno
              </Link>
              <button
                className="min-h-10 rounded-lg border border-orange-400 px-3 text-sm font-semibold"
                type="button"
                onClick={newSale}
              >
                Nueva venta
              </button>
            </div>
          ) : null}
        </form>
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="p-4 text-lg font-semibold">Historial reciente</h2>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-3">Venta</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Total</th>
              <th className="p-3">Pagos registrados</th>
              <th className="p-3">Pendiente</th>
              <th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr className="border-t" key={sale.id}>
                <td className="p-3 font-semibold">
                  <Link
                    className="text-orange-900 underline"
                    href={`/ventas/${sale.id}`}
                  >
                    {sale.saleNumber}
                  </Link>
                </td>
                <td className="p-3">
                  {new Intl.DateTimeFormat("es-CO", {
                    timeZone: "America/Bogota",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(sale.createdAt))}
                </td>
                <td className="p-3">{sale.customerName || "—"}</td>
                <td className="p-3">{formatCop(sale.totalMinor)}</td>
                <td className="p-3">{formatCop(sale.paidMinor)}</td>
                <td className="p-3">
                  {formatCop(
                    sale.status === "VOIDED" ? 0 : sale.totalMinor - sale.paidMinor,
                  )}
                </td>
                <td className="p-3">{sale.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 ? (
          <p className="p-4 text-sm text-zinc-600">
            Todavía no hay ventas registradas.
          </p>
        ) : null}
      </section>
    </div>
  );
}
function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 w-full rounded-lg bg-orange-700 px-4 font-semibold text-white disabled:opacity-50"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Registrando…" : "Confirmar venta"}
    </button>
  );
}
