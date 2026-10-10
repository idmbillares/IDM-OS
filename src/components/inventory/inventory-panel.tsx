"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search, Upload } from "lucide-react";
import {
  createProductAction,
  inventoryMovementAction,
  openingInventoryAction,
  updateProductAction,
  type InventoryActionState,
} from "@/app/(dashboard)/inventario/actions";
import { TabUnlockField } from "@/components/auth/tab-unlock-field";
import { formatCop } from "@/modules/financial/money";
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  costMinor: number | null;
  salePriceMinor: number;
  minimumQuantity: number;
  isActive: boolean;
  quantity: number;
};
type Movement = {
  id: string;
  sku: string;
  productName: string;
  type: string;
  quantity: number;
  previousQuantity: number;
  nextQuantity: number;
  reason: string;
  reference: string | null;
  createdAt: Date;
  actorName: string;
};
const idle: InventoryActionState = { status: "idle", message: "" };
export function InventoryPanel({
  products,
  categories,
  movements,
  actors,
  movementFilters,
  initialOpeningKey,
  initialMovementKey,
  isAdministrator,
  canViewCost,
  batchReady,
  summary,
}: {
  products: Product[];
  categories: string[];
  movements: Movement[];
  actors: Array<{ id: string; displayName: string }>;
  movementFilters: Record<string, string | undefined>;
  initialOpeningKey: string;
  initialMovementKey: string;
  isAdministrator: boolean;
  canViewCost: boolean;
  batchReady: boolean;
  summary: {
    activeCount: number;
    lowStockCount: number;
    estimatedValue: number | null;
  };
}) {
  const [createState, createAction] = useActionState(createProductAction, idle);
  const [openingState, openingAction] = useActionState(openingInventoryAction, idle);
  const [movementState, movementAction] = useActionState(inventoryMovementAction, idle);
  const [editState, editAction] = useActionState(updateProductAction, idle);
  const [showCreate, setShowCreate] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [openingKey, setOpeningKey] = useState(initialOpeningKey);
  const [movementKey, setMovementKey] = useState(initialMovementKey);
  const [kind, setKind] = useState("ENTRY");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [editingProductId, setEditingProductId] = useState("");
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const editingProduct = products.find((product) => product.id === editingProductId);
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-sm text-zinc-600">Productos activos</p>
          <p className="mt-1 text-2xl font-bold">{summary.activeCount}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-sm text-zinc-600">Stock bajo o agotado</p>
          <p className="mt-1 text-2xl font-bold text-orange-800">
            {summary.lowStockCount}
          </p>
        </div>
        {canViewCost ? (
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-zinc-600">
              Valor estimado a costo de referencia
            </p>
            <p className="mt-1 text-xl font-bold">
              {summary.estimatedValue !== null
                ? formatCop(summary.estimatedValue)
                : "Sin costos completos"}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-zinc-600">Kardex</p>
            <p className="mt-1 text-xl font-bold">{movements.length} recientes</p>
          </div>
        )}
      </section>
      <section className="flex flex-wrap gap-3">
        {isAdministrator && batchReady ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 text-sm font-semibold text-orange-900"
            href="/inventario/carga-inicial"
          >
            Carga inicial por borrador
          </Link>
        ) : null}
        {isAdministrator ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white"
            onClick={() => setShowCreate(!showCreate)}
            type="button"
          >
            <PackagePlus className="size-4" />
            Crear producto
          </button>
        ) : null}
        {isAdministrator ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 text-sm font-semibold text-orange-900"
            onClick={() => setShowOpening(!showOpening)}
            type="button"
          >
            <Upload className="size-4" />
            Apertura individual
          </button>
        ) : null}
        {isAdministrator ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold"
            onClick={() => setShowMovement(!showMovement)}
            type="button"
          >
            Entrada, salida o ajuste
          </button>
        ) : null}
        <Link
          className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold"
          href="/api/inventario/plantilla"
        >
          Descargar plantilla Excel
        </Link>
      </section>
      {showCreate && isAdministrator ? (
        <form
          action={createAction}
          className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <Input
            name="sku"
            label="Código / SKU (opcional, se genera automáticamente)"
          />
          <Input name="name" label="Producto" />
          <label className="text-sm font-semibold">
            Categoría
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="category"
              required
            >
              <option value="">Selecciona</option>
              <option>Mercancía y accesorios</option>
              <option>Materias primas</option>
              <option>Productos terminados</option>
              <option>Servicios</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Unidad de medida
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="unit"
              required
            >
              <option value="">Selecciona</option>
              {["unidad", "juego", "par", "metro", "kilogramo", "rollo", "caja"].map(
                (unit) => (
                  <option key={unit}>{unit}</option>
                ),
              )}
            </select>
          </label>
          <Input name="costMinor" label="Costo unitario (COP)" type="number" />
          <Input name="salePriceMinor" label="Precio de venta (COP)" type="number" />
          <Input name="minimumQuantity" label="Stock mínimo" type="number" />
          <label className="sm:col-span-2 text-sm font-semibold">
            Descripción opcional
            <textarea
              className="mt-1 block w-full rounded-lg border p-2"
              name="description"
            />
          </label>
          <button
            className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white sm:col-span-2"
            type="submit"
          >
            Guardar producto
          </button>
          <Message state={createState} />
        </form>
      ) : null}
      {editingProduct && isAdministrator ? (
        <form
          key={editingProduct.id}
          action={editAction}
          className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <input name="id" type="hidden" value={editingProduct.id} readOnly />
          <h2 className="text-lg font-semibold sm:col-span-2">
            Editar producto: {editingProduct.name}
          </h2>
          <label className="text-sm font-semibold">
            SKU
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="sku"
              defaultValue={editingProduct.sku}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Nombre
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="name"
              defaultValue={editingProduct.name}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Categoría
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="category"
              defaultValue={editingProduct.category}
              required
            >
              {editingProduct.category === "Articulo" ? (
                <option value="Articulo">Articulo (valor actual)</option>
              ) : null}
              {[
                "Mercancía y accesorios",
                "Materias primas",
                "Productos terminados",
                "Servicios",
              ].map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Unidad
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="unit"
              defaultValue={editingProduct.unit}
              required
            >
              {editingProduct.unit === "Unidad" ? (
                <option value="Unidad">Unidad (valor actual)</option>
              ) : null}
              {["unidad", "juego", "par", "metro", "kilogramo", "rollo", "caja"].map(
                (unit) => (
                  <option key={unit}>{unit}</option>
                ),
              )}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Costo de referencia (COP)
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="costMinor"
              type="number"
              min="0"
              defaultValue={editingProduct.costMinor ?? ""}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            Precio de venta (COP)
            <input
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="salePriceMinor"
              type="number"
              min="0"
              defaultValue={editingProduct.salePriceMinor}
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
              defaultValue={editingProduct.minimumQuantity}
              required
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={editingProduct.isActive}
            />{" "}
            Activo
          </label>
          <label className="text-sm font-semibold sm:col-span-2">
            Descripción
            <textarea
              className="mt-1 block w-full rounded-lg border p-2"
              name="description"
              defaultValue={editingProduct.description ?? ""}
            />
          </label>
          <button
            className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white"
            type="submit"
          >
            Guardar cambios
          </button>
          <button
            className="min-h-11 rounded-lg border px-4 text-sm font-semibold"
            type="button"
            onClick={() => setEditingProductId("")}
          >
            Cerrar
          </button>
          <Message state={editState} />
        </form>
      ) : null}
      {showOpening && isAdministrator ? (
        <form
          action={openingAction}
          className="grid gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <input name="idempotencyKey" type="hidden" value={openingKey} readOnly />
          <label className="text-sm font-semibold">
            Producto
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="productId"
              required
            >
              <option value="">Selecciona</option>
              {products
                .filter((p) => p.quantity === 0 && p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
            </select>
          </label>
          <Input name="quantity" label="Cantidad inicial" type="number" />
          <Input name="unitCostMinor" label="Costo unitario (COP)" type="number" />
          <Input name="reference" label="Referencia (opcional)" />
          <Input name="reason" label="Motivo" placeholder="Apertura de inventario" />
          <button
            className="min-h-11 rounded-lg bg-orange-700 px-4 text-sm font-semibold text-white sm:col-span-2"
            type="submit"
            disabled={!openingKey}
          >
            Confirmar saldo inicial
          </button>
          <Message state={openingState} />
          {openingState.status === "success" ? (
            <button
              type="button"
              className="text-sm font-semibold text-orange-800"
              onClick={() => setOpeningKey(crypto.randomUUID())}
            >
              Preparar otra carga
            </button>
          ) : null}
        </form>
      ) : null}
      {showMovement && isAdministrator ? (
        <form
          action={movementAction}
          className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-5 sm:grid-cols-2"
        >
          <TabUnlockField />
          <input name="idempotencyKey" type="hidden" value={movementKey} readOnly />
          <label className="text-sm font-semibold">
            Operación
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="ENTRY">Entrada</option>
              <option value="EXIT">Salida o baja</option>
              <option value="ADJUSTMENT">Ajuste por conteo</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Producto
            <select
              className="mt-1 block min-h-11 w-full rounded-lg border p-2"
              name="productId"
              required
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
            >
              <option value="">Selecciona</option>
              {products
                .filter(
                  (product) => product.isActive && product.category !== "Servicios",
                )
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.name} ({product.quantity} {product.unit})
                  </option>
                ))}
            </select>
          </label>
          {kind === "ADJUSTMENT" ? (
            <>
              <input
                name="expectedQuantity"
                type="hidden"
                value={selectedProduct?.quantity ?? ""}
                readOnly
              />
              <p className="text-sm">
                Existencia registrada:{" "}
                <strong>{selectedProduct?.quantity ?? "—"}</strong>
              </p>
              <Input
                name="physicalQuantity"
                label="Cantidad física contada"
                type="number"
              />
            </>
          ) : (
            <>
              <Input name="quantity" label="Cantidad" type="number" />
              {kind === "ENTRY" ? (
                <Input
                  name="unitCostMinor"
                  label="Costo unitario de referencia (COP)"
                  type="number"
                />
              ) : null}
            </>
          )}
          <Input name="reference" label="Documento o referencia (opcional)" />
          <Input name="reason" label="Motivo" />
          <button
            className="min-h-11 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-50"
            type="submit"
            disabled={!movementKey}
          >
            Confirmar movimiento
          </button>
          <Message state={movementState} />
          {movementState.status === "success" ? (
            <button
              type="button"
              className="text-sm font-semibold text-orange-800"
              onClick={() => setMovementKey(crypto.randomUUID())}
            >
              Preparar otro movimiento
            </button>
          ) : null}
        </form>
      ) : null}
      <form className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-4">
        <label className="sm:col-span-2 text-sm font-semibold">
          Buscar
          <input
            className="mt-1 block min-h-11 w-full rounded-lg border p-2"
            name="q"
            placeholder="Nombre, SKU o categoría"
          />
        </label>
        <label className="text-sm font-semibold">
          Categoría
          <select
            className="mt-1 block min-h-11 w-full rounded-lg border p-2"
            name="category"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white">
          <Search className="size-4" />
          Buscar
        </button>
      </form>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="p-3">Producto</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Categoría</th>
              <th className="p-3">Existencia</th>
              <th className="p-3">Unidad</th>
              <th className="p-3">Precio</th>
              {canViewCost ? <th className="p-3">Costo</th> : null}
              <th className="p-3">Estado</th>
              {isAdministrator ? <th className="p-3">Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const state =
                p.quantity === 0
                  ? "Agotado"
                  : p.quantity <= p.minimumQuantity
                    ? "Stock bajo · PEDIR"
                    : "Disponible";
              return (
                <tr className="border-t" key={p.id}>
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3 text-xs text-zinc-600">{p.sku}</td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">
                    {p.quantity}
                    <span className="block text-xs text-zinc-500">
                      mínimo: {p.minimumQuantity}
                    </span>
                  </td>
                  <td className="p-3">{p.unit}</td>
                  {isAdministrator ? (
                    <td className="p-3">
                      <button
                        className="font-semibold text-orange-800 underline"
                        type="button"
                        onClick={() => setEditingProductId(p.id)}
                      >
                        Editar
                      </button>
                    </td>
                  ) : null}
                  <td className="p-3">{formatCop(p.salePriceMinor)}</td>
                  {canViewCost ? (
                    <td className="p-3">
                      {p.costMinor === null ? "—" : formatCop(p.costMinor)}
                    </td>
                  ) : null}
                  <td className="p-3">
                    <span
                      className={
                        p.quantity <= p.minimumQuantity
                          ? "font-semibold text-orange-800"
                          : "font-semibold text-emerald-700"
                      }
                    >
                      {state}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 ? (
          <p className="p-6 text-sm text-zinc-600">
            No hay productos todavía. Crea el primero o importa una plantilla validada.
          </p>
        ) : null}
      </section>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <h2 className="p-4 text-lg font-semibold">Kardex reciente</h2>
        <form className="grid gap-3 border-t p-4 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-semibold">
            Desde
            <input
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              type="date"
              name="dateFrom"
              defaultValue={movementFilters.dateFrom ?? ""}
            />
          </label>
          <label className="text-xs font-semibold">
            Hasta
            <input
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              type="date"
              name="dateTo"
              defaultValue={movementFilters.dateTo ?? ""}
            />
          </label>
          <label className="text-xs font-semibold">
            Producto
            <select
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              name="productId"
              defaultValue={movementFilters.productId ?? ""}
            >
              <option value="">Todos</option>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.sku} · {product.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Categoría
            <select
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              name="category"
              defaultValue={movementFilters.category ?? ""}
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Responsable
            <select
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              name="actorId"
              defaultValue={movementFilters.actorId ?? ""}
            >
              <option value="">Todos</option>
              {actors.map((actor) => (
                <option value={actor.id} key={actor.id}>
                  {actor.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Tipo
            <select
              className="mt-1 block min-h-10 w-full rounded-lg border p-2"
              name="type"
              defaultValue={movementFilters.type ?? ""}
            >
              <option value="">Todos</option>
              {[
                "OPENING_BALANCE",
                "ENTRY",
                "EXIT",
                "POSITIVE_ADJUSTMENT",
                "NEGATIVE_ADJUSTMENT",
                "SALE",
                "RETURN",
                "PURCHASE",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <button
            className="min-h-10 rounded-lg bg-zinc-950 px-3 text-sm font-semibold text-white"
            type="submit"
          >
            Filtrar Kardex
          </button>
          <Link
            className="inline-flex min-h-10 items-center text-sm font-semibold text-orange-800 underline"
            href="/inventario"
          >
            Limpiar filtros
          </Link>
        </form>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Producto</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Cantidad</th>
              <th className="p-3">Antes → después</th>
              <th className="p-3">Motivo</th>
              <th className="p-3">Responsable</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((movement) => (
              <tr className="border-t" key={movement.id}>
                <td className="p-3">
                  {new Intl.DateTimeFormat("es-CO", {
                    timeZone: "America/Bogota",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(movement.createdAt))}
                </td>
                <td className="p-3">
                  {movement.productName}
                  <span className="block text-xs text-zinc-500">{movement.sku}</span>
                </td>
                <td className="p-3">{movement.type}</td>
                <td className="p-3">{movement.quantity}</td>
                <td className="p-3">
                  {movement.previousQuantity} → {movement.nextQuantity}
                </td>
                <td className="p-3">
                  {movement.reason}
                  {movement.reference ? (
                    <span className="block text-xs text-zinc-500">
                      {movement.reference}
                    </span>
                  ) : null}
                </td>
                <td className="p-3">{movement.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movements.length === 0 ? (
          <p className="p-4 text-sm text-zinc-600">Todavía no hay movimientos.</p>
        ) : null}
      </section>
    </div>
  );
}
function Input({
  label,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        className="mt-1 block min-h-11 w-full rounded-lg border p-2"
        min={type === "number" ? 0 : undefined}
        name={name}
        placeholder={placeholder}
        required={name !== "reference" && name !== "sku"}
        type={type}
      />
    </label>
  );
}
function Message({ state }: { state: InventoryActionState }) {
  return state.message ? (
    <p
      className={
        state.status === "error"
          ? "text-sm text-orange-800 sm:col-span-2"
          : "text-sm text-emerald-700 sm:col-span-2"
      }
    >
      {state.message}
    </p>
  ) : null;
}
