import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { pool } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { businessDayBounds } from "@/lib/business-time";
import { z } from "zod";

type Actor = { id: string };
const integerInput = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
const nonnegative = z.preprocess(integerInput, z.number().int().safe().nonnegative());
const positive = z.preprocess(integerInput, z.number().int().safe().positive());
async function authorizeAdministrator(
  client: { query: typeof pool.query },
  actor: Actor,
) {
  const result = await client.query(
    "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active AND r.key='ADMINISTRADOR'",
    [actor.id],
  );
  if (!result.rowCount) throw new AuthorizationError();
}
function safeInteger(value: string | number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new ValidationError("La cantidad excede el rango seguro.");
  return parsed;
}
const productSchema = z.object({
  sku: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{N}._-]+$/u),
  ]),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  category: z.enum([
    "Mercancía y accesorios",
    "Materias primas",
    "Productos terminados",
    "Servicios",
  ]),
  unit: z.enum(["unidad", "juego", "par", "metro", "kilogramo", "rollo", "caja"]),
  costMinor: nonnegative,
  salePriceMinor: nonnegative,
  minimumQuantity: nonnegative,
});
const openingSchema = z.object({
  productId: z.string().uuid(),
  quantity: positive,
  unitCostMinor: nonnegative,
  reference: z.string().trim().max(120).optional(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});
const operationSchema = z.discriminatedUnion("kind", [
  openingSchema.extend({ kind: z.literal("OPENING_BALANCE") }),
  openingSchema.extend({ kind: z.literal("ENTRY") }),
  openingSchema.omit({ unitCostMinor: true }).extend({ kind: z.literal("EXIT") }),
  z.object({
    kind: z.literal("ADJUSTMENT"),
    productId: z.string().uuid(),
    expectedQuantity: nonnegative,
    physicalQuantity: nonnegative,
    reason: z.string().trim().min(3).max(500),
    reference: z.string().trim().max(120).optional(),
    idempotencyKey: z.string().uuid(),
  }),
]);
function parse<T>(result: z.ZodSafeParseResult<T>) {
  if (!result.success)
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Revisa los datos de inventario.",
    );
  return result.data;
}
export async function createProduct(actor: Actor, raw: unknown) {
  const item = parse(productSchema.safeParse(raw));
  const now = new Date();
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await authorizeAdministrator(client, actor);
    await client.query(
      "INSERT INTO inventory_products(id,sku,name,description,category,unit,cost_minor,sale_price_minor,minimum_quantity,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$11)",
      [
        id,
        item.sku
          ? item.sku.toUpperCase()
          : `IDM-${id.replaceAll("-", "").toUpperCase()}`,
        item.name,
        item.description || null,
        item.category,
        item.unit,
        item.costMinor,
        item.salePriceMinor,
        item.minimumQuantity,
        now,
        actor.id,
      ],
    );
    await client.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'inventory.product_created','inventory_product',$3,$4,$5,$5)",
      [randomUUID(), actor.id, id, JSON.stringify(item), now],
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505")
      throw new ValidationError("Ya existe un producto con ese código/SKU.");
    throw error;
  } finally {
    client.release();
  }
}
export async function updateProduct(actor: Actor, raw: unknown) {
  const item = parse(
    productSchema
      .extend({
        id: z.string().uuid(),
        isActive: z.boolean(),
        category: z.union([productSchema.shape.category, z.literal("Articulo")]),
        unit: z.union([productSchema.shape.unit, z.literal("Unidad")]),
      })
      .safeParse(raw),
  );
  if (!item.sku) throw new ValidationError("El SKU existente no puede quedar vacío.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await authorizeAdministrator(client, actor);
    const previous = (
      await client.query<{
        id: string;
        sku: string;
        name: string;
        description: string | null;
        category: string;
        unit: string;
        cost_minor: string;
        sale_price_minor: string;
        minimum_quantity: string;
        is_active: boolean;
      }>(
        "SELECT id,sku,name,description,category,unit,cost_minor::text,sale_price_minor::text,minimum_quantity::text,is_active FROM inventory_products WHERE id=$1 FOR UPDATE",
        [item.id],
      )
    ).rows[0];
    if (!previous) throw new ValidationError("El producto no existe.");
    if (
      (item.category === "Articulo" && previous.category !== "Articulo") ||
      (item.unit === "Unidad" && previous.unit !== "Unidad")
    )
      throw new ValidationError(
        "Los valores heredados solo pueden conservarse en el producto original.",
      );
    const hasMovements = (
      await client.query(
        "SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1",
        [item.id],
      )
    ).rowCount;
    if (
      hasMovements &&
      (previous.sku !== item.sku.toUpperCase() ||
        previous.unit !== item.unit ||
        (previous.category === "Servicios") !== (item.category === "Servicios"))
    )
      throw new ValidationError(
        "El SKU, unidad y condición de servicio no pueden cambiar después del primer movimiento.",
      );
    const now = new Date();
    await client.query(
      "UPDATE inventory_products SET sku=$1,name=$2,description=$3,category=$4,unit=$5,cost_minor=$6,sale_price_minor=$7,minimum_quantity=$8,is_active=$9,updated_at=$10,updated_by_user_id=$11 WHERE id=$12",
      [
        item.sku.toUpperCase(),
        item.name,
        item.description || null,
        item.category,
        item.unit,
        item.costMinor,
        item.salePriceMinor,
        item.minimumQuantity,
        item.isActive,
        now,
        actor.id,
        item.id,
      ],
    );
    await client.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at,created_at) VALUES($1,$2,'inventory.product_updated','inventory_product',$3,$4,$5,$6,$6)",
      [
        randomUUID(),
        actor.id,
        item.id,
        JSON.stringify(previous),
        JSON.stringify(item),
        now,
      ],
    );
    await client.query("COMMIT");
    return item.id;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505")
      throw new ValidationError("Ya existe un producto con ese código/SKU.");
    throw error;
  } finally {
    client.release();
  }
}
export async function registerInventoryMovement(actor: Actor, raw: unknown) {
  const item = parse(operationSchema.safeParse(raw));
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ actorId: actor.id, item }))
    .digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await authorizeAdministrator(client, actor);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `inventory:${item.idempotencyKey}`,
    ]);
    const existing = (
      await client.query<{
        id: string;
        created_by_user_id: string;
        metadata_json: { requestFingerprint?: string } | null;
      }>(
        "SELECT m.id,m.created_by_user_id,a.metadata_json FROM inventory_movements m LEFT JOIN audit_logs a ON a.entity_type='inventory_movement' AND a.entity_id=m.id AND a.action='inventory.movement_created' WHERE m.idempotency_key=$1",
        [item.idempotencyKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.created_by_user_id !== actor.id ||
        existing.metadata_json?.requestFingerprint !== requestFingerprint
      )
        throw new ValidationError("Esta solicitud ya se usó con otros datos.");
      await client.query("COMMIT");
      return existing.id;
    }
    const product = (
      await client.query<{ id: string; category: string; cost_minor: string }>(
        "SELECT id,category,cost_minor::text FROM inventory_products WHERE id=$1 AND is_active=true FOR UPDATE",
        [item.productId],
      )
    ).rows[0];
    if (!product) throw new ValidationError("El producto no existe o está inactivo.");
    if (product.category === "Servicios")
      throw new ValidationError("Los servicios no tienen existencias propias.");
    const previous = safeInteger(
      (
        await client.query<{ stock: string }>(
          "SELECT coalesce(sum(quantity),0)::text stock FROM inventory_movements WHERE product_id=$1",
          [item.productId],
        )
      ).rows[0].stock,
    );
    if (
      item.kind === "OPENING_BALANCE" &&
      (
        await client.query(
          "SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1",
          [item.productId],
        )
      ).rowCount
    )
      throw new ValidationError(
        "El saldo de apertura solo se registra antes del primer movimiento.",
      );
    if (item.kind === "ADJUSTMENT" && previous !== item.expectedQuantity)
      throw new ValidationError(
        "La existencia cambió desde el conteo. Actualiza la página.",
      );
    const delta =
      item.kind === "ADJUSTMENT"
        ? item.physicalQuantity - previous
        : item.kind === "EXIT"
          ? -item.quantity
          : item.quantity;
    const next = previous + delta;
    if (!Number.isSafeInteger(next) || next < 0)
      throw new ValidationError(
        "La operación dejaría existencias negativas o fuera del rango seguro.",
      );
    if (delta === 0) throw new ValidationError("El ajuste no cambia las existencias.");
    const type =
      item.kind === "ADJUSTMENT"
        ? delta > 0
          ? "POSITIVE_ADJUSTMENT"
          : "NEGATIVE_ADJUSTMENT"
        : item.kind;
    const unitCostMinor =
      item.kind === "ADJUSTMENT" || item.kind === "EXIT"
        ? safeInteger(product.cost_minor)
        : item.unitCostMinor;
    const now = new Date();
    const movementId = randomUUID();
    await client.query(
      "INSERT INTO inventory_movements(id,product_id,type,quantity,previous_quantity,next_quantity,unit_cost_minor,reference,reason,idempotency_key,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        movementId,
        item.productId,
        type,
        delta,
        previous,
        next,
        unitCostMinor,
        item.reference || null,
        item.reason,
        item.idempotencyKey,
        now,
        actor.id,
      ],
    );
    if (item.kind === "OPENING_BALANCE" || item.kind === "ENTRY")
      await client.query(
        "UPDATE inventory_products SET cost_minor=$1,updated_at=$2,updated_by_user_id=$3 WHERE id=$4",
        [unitCostMinor, now, actor.id, item.productId],
      );
    await client.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,metadata_json,occurred_at,created_at) VALUES($1,$2,'inventory.movement_created','inventory_movement',$3,$4,$5,$6,$6)",
      [
        randomUUID(),
        actor.id,
        movementId,
        JSON.stringify({ ...item, delta, previous, next }),
        JSON.stringify({ requestFingerprint }),
        now,
      ],
    );
    await client.query("COMMIT");
    return movementId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function registerOpeningInventory(actor: Actor, raw: unknown) {
  return registerInventoryMovement(actor, {
    ...(raw as object),
    kind: "OPENING_BALANCE",
  });
}
export async function listInventory(
  filters: { q?: string; category?: string; status?: string } = {},
) {
  filters = parse(
    z
      .object({
        q: z.string().trim().max(160).optional(),
        category: z.string().trim().max(100).optional(),
        status: z.enum(["active", "inactive"]).optional(),
      })
      .safeParse(filters),
  );
  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.q?.trim()) {
    values.push(`%${filters.q.trim()}%`);
    conditions.push(
      `(p.sku ILIKE $${values.length} OR p.name ILIKE $${values.length} OR p.category ILIKE $${values.length})`,
    );
  }
  if (filters.category) add("p.category = ?", filters.category);
  if (filters.status === "active") conditions.push("p.is_active=true");
  if (filters.status === "inactive") conditions.push("p.is_active=false");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (
    await pool.query<{
      id: string;
      sku: string;
      name: string;
      description: string | null;
      category: string;
      unit: string;
      costMinor: string;
      salePriceMinor: string;
      minimumQuantity: string;
      isActive: boolean;
      quantity: string;
    }>(
      `SELECT p.id,p.sku,p.name,p.description,p.category,p.unit,p.cost_minor::text "costMinor",p.sale_price_minor::text "salePriceMinor",p.minimum_quantity::text "minimumQuantity",p.is_active "isActive",coalesce(sum(m.quantity),0)::text quantity FROM inventory_products p LEFT JOIN inventory_movements m ON m.product_id=p.id ${where} GROUP BY p.id ORDER BY p.name`,
      values,
    )
  ).rows.map((x) => ({
    ...x,
    costMinor: safeInteger(x.costMinor),
    salePriceMinor: safeInteger(x.salePriceMinor),
    minimumQuantity: safeInteger(x.minimumQuantity),
    quantity: safeInteger(x.quantity),
  }));
}
export async function listInventoryMovements(
  raw: {
    dateFrom?: string;
    dateTo?: string;
    productId?: string;
    category?: string;
    actorId?: string;
    type?: string;
  } = {},
) {
  const filters = parse(
    z
      .object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        productId: z.string().uuid().optional(),
        category: z.string().trim().max(100).optional(),
        actorId: z.string().uuid().optional(),
        type: z
          .enum([
            "OPENING_BALANCE",
            "ENTRY",
            "EXIT",
            "POSITIVE_ADJUSTMENT",
            "NEGATIVE_ADJUSTMENT",
            "SALE",
            "RETURN",
            "PURCHASE",
          ])
          .optional(),
      })
      .safeParse(raw),
  );
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (filters.dateFrom) {
    const bounds = businessDayBounds(filters.dateFrom);
    if (!bounds) throw new ValidationError("Fecha inicial de Kardex inválida.");
    values.push(bounds.start);
    conditions.push(`m.created_at >= $${values.length}`);
  }
  if (filters.dateTo) {
    const bounds = businessDayBounds(filters.dateTo);
    if (!bounds) throw new ValidationError("Fecha final de Kardex inválida.");
    values.push(bounds.end);
    conditions.push(`m.created_at <= $${values.length}`);
  }
  for (const [column, value] of [
    ["m.product_id", filters.productId],
    ["p.category", filters.category],
    ["m.created_by_user_id", filters.actorId],
    ["m.type", filters.type],
  ] as const)
    if (value) {
      values.push(value);
      conditions.push(`${column}=$${values.length}`);
    }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return (
    await pool.query<{
      id: string;
      sku: string;
      productName: string;
      type: string;
      quantity: string;
      previousQuantity: string;
      nextQuantity: string;
      reason: string;
      reference: string | null;
      createdAt: Date;
      actorName: string;
    }>(
      `SELECT m.id,p.sku,p.name "productName",m.type,m.quantity::text quantity,
      m.previous_quantity::text "previousQuantity",m.next_quantity::text "nextQuantity",
      m.reason,m.reference,m.created_at "createdAt",u.display_name "actorName"
     FROM inventory_movements m JOIN inventory_products p ON p.id=m.product_id
     JOIN users u ON u.id=m.created_by_user_id ${where}
     ORDER BY m.created_at DESC,m.id DESC LIMIT 200`,
      values,
    )
  ).rows.map((row) => ({
    ...row,
    quantity: safeInteger(row.quantity),
    previousQuantity: safeInteger(row.previousQuantity),
    nextQuantity: safeInteger(row.nextQuantity),
  }));
}
export async function inventoryActors() {
  return (
    await pool.query<{ id: string; displayName: string }>(
      'SELECT DISTINCT u.id,u.display_name "displayName" FROM inventory_movements m JOIN users u ON u.id=m.created_by_user_id ORDER BY u.display_name',
    )
  ).rows;
}
export async function inventoryCategories() {
  return (
    await pool.query<{ category: string }>(
      "SELECT DISTINCT category FROM inventory_products ORDER BY category",
    )
  ).rows.map((x) => x.category);
}
