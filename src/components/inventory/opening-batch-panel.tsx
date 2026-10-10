"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createProductAction,
  type InventoryActionState,
} from "@/app/(dashboard)/inventario/actions";
import {
  saveOpeningBatchAction,
  type BatchActionState,
} from "@/app/(dashboard)/inventario/carga-inicial/actions";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  costMinor: number;
  salePriceMinor: number;
  quantity: number;
};
type BatchSummary = {
  id: string;
  status: string;
  reference: string | null;
  createdAt: Date;
  itemCount: number;
};
type Batch = {
  id: string;
  status: string;
  reference: string | null;
  notes: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    unitCostMinor: number;
    salePriceMinor: number;
  }>;
};
type Row = {
  productId: string;
  quantity: string;
  unitCostMinor: string;
  salePriceMinor: string;
};
const idle: BatchActionState = { status: "idle", message: "" };
const productIdle: InventoryActionState = { status: "idle", message: "" };
export function OpeningBatchPanel({
  products,
  batches,
  selected,
  batchId,
}: {
  products: Product[];
  batches: BatchSummary[];
  selected: Batch | null;
  batchId: string;
}) {
  const [state, action, pending] = useActionState(saveOpeningBatchAction, idle);
  const [productState, productAction, productPending] = useActionState(
    createProductAction,
    productIdle,
  );
  const [rows, setRows] = useState<Row[]>(
    selected?.items.map((item) => ({
      productId: item.productId,
      quantity: String(item.quantity),
      unitCostMinor: String(item.unitCostMinor),
      salePriceMinor: String(item.salePriceMinor),
    })) ?? [],
  );
  const [reference, setReference] = useState(selected?.reference ?? "");
  const [notes, setNotes] = useState(selected?.notes ?? "");
  const [showProduct, setShowProduct] = useState(false);
  const editable = selected?.status !== "POSTED";
  function update(index: number, change: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Link
          className="min-h-11 rounded-lg bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
          href="/inventario/carga-inicial"
        >
          Nueva carga
        </Link>
        <button
          type="button"
          className="min-h-11 rounded-lg border px-4 text-sm font-semibold"
          onClick={() => setShowProduct(!showProduct)}
        >
          Crear producto sin salir
        </button>
        <Link
          className="min-h-11 rounded-lg border px-4 py-3 text-sm font-semibold"
          href="/inventario"
        >
          Ver Kardex
        </Link>
      </div>
      {showProduct ? (
        <form
          action={productAction}
          className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <h2 className="text-lg font-semibold sm:col-span-2">Nuevo producto</h2>
          <label className="text-sm font-semibold">
            SKU (opcional)
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="sku"
            />
          </label>
          <label className="text-sm font-semibold">
            Nombre
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="name"
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Categoría
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="category"
              required
            >
              <option value="">Selecciona</option>
              {[
                "Mercancía y accesorios",
                "Materias primas",
                "Productos terminados",
                "Servicios",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Unidad
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="unit"
              required
            >
              <option value="">Selecciona</option>
              {["unidad", "juego", "par", "metro", "kilogramo", "rollo", "caja"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Costo de referencia COP
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="costMinor"
              type="number"
              min="0"
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Precio de venta COP
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="salePriceMinor"
              type="number"
              min="0"
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Stock mínimo
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="minimumQuantity"
              type="number"
              min="0"
              required
            />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Descripción
            <textarea
              className="mt-1 block w-full rounded-lg border p-2"
              name="description"
            />
          </label>
          <button
            className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={productPending}
          >
            Guardar producto
          </button>
          {productState.message ? (
            <p role="status" className="text-sm sm:col-span-2">
              {productState.message}
            </p>
          ) : null}
        </form>
      ) : null}
      <form action={action} className="space-y-4 rounded-2xl border bg-white p-5">
        <TabUnlockField />
        <input name="batchId" type="hidden" value={batchId} readOnly />
        <input
          name="batchData"
          type="hidden"
          value={JSON.stringify({ reference, notes, items: rows })}
          readOnly
        />
        <h2 className="text-lg font-semibold">
          {selected ? `Carga ${selected.id}` : "Nuevo borrador"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Referencia del conteo
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              maxLength={120}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={!editable}
            />
          </label>
          <label className="text-sm font-semibold">
            Observaciones
            <textarea
              className="mt-1 block w-full rounded-lg border p-2"
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={!editable}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="p-2">Producto</th>
                <th className="p-2">Cantidad física</th>
                <th className="p-2">Costo unitario COP</th>
                <th className="p-2">Precio COP</th>
                <th className="p-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr className="border-t" key={index}>
                  <td className="p-2">
                    <select
                      className="min-h-10 w-full rounded-lg border p-2"
                      value={row.productId}
                      onChange={(event) =>
                        update(index, { productId: event.target.value })
                      }
                      disabled={!editable}
                      required
                    >
                      <option value="">Selecciona</option>
                      {products
                        .filter(
                          (product) =>
                            product.category !== "Servicios" && product.quantity === 0,
                        )
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.sku} · {product.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      className="min-h-10 w-full rounded-lg border p-2"
                      aria-label={`Cantidad fila ${index + 1}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={row.quantity}
                      onChange={(event) =>
                        update(index, { quantity: event.target.value })
                      }
                      disabled={!editable}
                      required
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="min-h-10 w-full rounded-lg border p-2"
                      aria-label={`Costo fila ${index + 1}`}
                      type="number"
                      min="0"
                      value={row.unitCostMinor}
                      onChange={(event) =>
                        update(index, { unitCostMinor: event.target.value })
                      }
                      disabled={!editable}
                      required
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className="min-h-10 w-full rounded-lg border p-2"
                      aria-label={`Precio fila ${index + 1}`}
                      type="number"
                      min="0"
                      value={row.salePriceMinor}
                      onChange={(event) =>
                        update(index, { salePriceMinor: event.target.value })
                      }
                      disabled={!editable}
                      required
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      className="text-orange-800 underline"
                      onClick={() =>
                        setRows((current) => current.filter((_, i) => i !== index))
                      }
                      disabled={!editable}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="min-h-10 rounded-lg border px-3 text-sm font-semibold"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    productId: "",
                    quantity: "",
                    unitCostMinor: "",
                    salePriceMinor: "",
                  },
                ])
              }
            >
              Agregar fila
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-10 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar borrador"}
            </button>
          </div>
        ) : null}
        {state.message ? (
          <p
            role="status"
            className={
              state.status === "error"
                ? "text-sm text-red-800"
                : "text-sm text-emerald-800"
            }
          >
            {state.message}
          </p>
        ) : null}
        {state.batchId ? (
          <Link
            className="block text-sm font-semibold text-orange-800 underline"
            href={`/inventario/carga-inicial/${state.batchId}`}
          >
            Revisar consolidado y confirmar
          </Link>
        ) : null}
        {selected?.status === "DRAFT" ? (
          <Link
            className="block text-sm font-semibold text-orange-800 underline"
            href={`/inventario/carga-inicial/${selected.id}`}
          >
            Revisar última versión guardada
          </Link>
        ) : null}
      </form>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Cargas guardadas</h2>
        <div className="mt-3 space-y-2">
          {batches.map((batch) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm"
              key={batch.id}
            >
              <span>
                {batch.reference || batch.id} · {batch.itemCount} productos ·{" "}
                {batch.status === "DRAFT" ? "Borrador" : "Confirmada"}
              </span>
              <Link
                className="font-semibold text-orange-800 underline"
                href={
                  batch.status === "DRAFT"
                    ? `/inventario/carga-inicial?batch=${batch.id}`
                    : `/inventario/carga-inicial/${batch.id}`
                }
              >
                {batch.status === "DRAFT" ? "Continuar" : "Ver"}
              </Link>
            </div>
          ))}
          {batches.length === 0 ? (
            <p className="text-sm text-zinc-600">Todavía no hay cargas guardadas.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
