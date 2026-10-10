import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";

type Actor = { id: string };
const integerInput = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
const nonnegative = z.preprocess(integerInput, z.number().int().safe().nonnegative());
const positive = z.preprocess(integerInput, z.number().int().safe().positive());
const draftSchema = z.object({
  batchId: z.string().uuid(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: positive,
        unitCostMinor: nonnegative,
        salePriceMinor: nonnegative,
      }),
    )
    .max(500),
});
const confirmSchema = z.object({ batchId: z.string().uuid() });
function valid<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success)
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Revisa la carga inicial.",
    );
  return result.data;
}
function safeInteger(value: string | number) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new ValidationError("Cantidad o importe fuera del rango seguro.");
  return parsed;
}
async function administrator(client: { query: typeof pool.query }, actor: Actor) {
  const result = await client.query(
    "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active AND r.key='ADMINISTRADOR'",
    [actor.id],
  );
  if (!result.rowCount) throw new AuthorizationError();
}

export async function saveOpeningBatch(actor: Actor, raw: unknown) {
  const item = valid(draftSchema.safeParse(raw));
  if (new Set(item.items.map((line) => line.productId)).size !== item.items.length)
    throw new ValidationError("Cada producto debe aparecer una sola vez en la carga.");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await administrator(c, actor);
    const now = new Date();
    await c.query(
      "INSERT INTO inventory_opening_batches(id,status,reference,notes,created_at,updated_at,created_by_user_id) VALUES($1,'DRAFT',$2,$3,$4,$4,$5) ON CONFLICT (id) DO NOTHING",
      [item.batchId, item.reference || null, item.notes || null, now, actor.id],
    );
    const batch = (
      await c.query<{ status: string }>(
        "SELECT status FROM inventory_opening_batches WHERE id=$1 FOR UPDATE",
        [item.batchId],
      )
    ).rows[0];
    if (!batch || batch.status !== "DRAFT")
      throw new ValidationError("La carga ya fue confirmada.");
    for (const line of item.items) {
      const product = (
        await c.query<{ category: string; is_active: boolean }>(
          "SELECT category,is_active FROM inventory_products WHERE id=$1",
          [line.productId],
        )
      ).rows[0];
      if (!product || !product.is_active || product.category === "Servicios")
        throw new ValidationError(
          "La carga contiene un producto inactivo, inexistente o un servicio.",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1",
            [line.productId],
          )
        ).rowCount
      )
        throw new ValidationError(
          "Un producto de la carga ya tiene movimientos. Usa un ajuste controlado.",
        );
    }
    await c.query("DELETE FROM inventory_opening_batch_items WHERE batch_id=$1", [
      item.batchId,
    ]);
    for (const line of item.items)
      await c.query(
        "INSERT INTO inventory_opening_batch_items(id,batch_id,product_id,quantity,unit_cost_minor,sale_price_minor) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          item.batchId,
          line.productId,
          line.quantity,
          line.unitCostMinor,
          line.salePriceMinor,
        ],
      );
    await c.query(
      "UPDATE inventory_opening_batches SET reference=$1,notes=$2,updated_at=$3 WHERE id=$4",
      [item.reference || null, item.notes || null, now, item.batchId],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'inventory.opening_draft_saved','inventory_opening_batch',$3,$4,$5,$5)",
      [
        randomUUID(),
        actor.id,
        item.batchId,
        JSON.stringify({ itemCount: item.items.length, reference: item.reference }),
        now,
      ],
    );
    await c.query("COMMIT");
    return item.batchId;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export async function confirmOpeningBatch(actor: Actor, raw: unknown) {
  const item = valid(confirmSchema.safeParse(raw));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await administrator(c, actor);
    const batch = (
      await c.query<{ status: string; reference: string | null }>(
        "SELECT status,reference FROM inventory_opening_batches WHERE id=$1 FOR UPDATE",
        [item.batchId],
      )
    ).rows[0];
    if (!batch) throw new ValidationError("La carga no existe.");
    if (batch.status === "POSTED") {
      await c.query("COMMIT");
      return item.batchId;
    }
    const lines = (
      await c.query<{
        product_id: string;
        quantity: string;
        unit_cost_minor: string;
        sale_price_minor: string;
      }>(
        "SELECT product_id,quantity::text,unit_cost_minor::text,sale_price_minor::text FROM inventory_opening_batch_items WHERE batch_id=$1 ORDER BY product_id",
        [item.batchId],
      )
    ).rows;
    if (!lines.length)
      throw new ValidationError("Agrega productos antes de confirmar la carga.");
    for (const line of lines) {
      const product = (
        await c.query<{ category: string }>(
          "SELECT category FROM inventory_products WHERE id=$1 AND is_active=true FOR UPDATE",
          [line.product_id],
        )
      ).rows[0];
      if (!product || product.category === "Servicios")
        throw new ValidationError(
          "La carga contiene un producto inactivo, inexistente o un servicio.",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM inventory_movements WHERE product_id=$1 LIMIT 1",
            [line.product_id],
          )
        ).rowCount
      )
        throw new ValidationError(
          "Un producto de la carga ya tiene movimientos. Revisa antes de confirmar.",
        );
    }
    const now = new Date();
    for (const line of lines) {
      const quantity = safeInteger(line.quantity),
        unitCost = safeInteger(line.unit_cost_minor),
        price = safeInteger(line.sale_price_minor);
      const movementId = randomUUID();
      await c.query(
        "INSERT INTO inventory_movements(id,product_id,type,quantity,previous_quantity,next_quantity,unit_cost_minor,reference,reason,source,idempotency_key,created_at,created_by_user_id,opening_batch_id) VALUES($1,$2,'OPENING_BALANCE',$3,0,$3,$4,$5,'Carga inicial confirmada','OPENING_BATCH',$6,$7,$8,$9)",
        [
          movementId,
          line.product_id,
          quantity,
          unitCost,
          batch.reference,
          randomUUID(),
          now,
          actor.id,
          item.batchId,
        ],
      );
      await c.query(
        "UPDATE inventory_products SET cost_minor=$1,sale_price_minor=$2,updated_at=$3,updated_by_user_id=$4 WHERE id=$5",
        [unitCost, price, now, actor.id, line.product_id],
      );
      await c.query(
        "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'inventory.opening_movement_posted','inventory_movement',$3,$4,$5,$5)",
        [
          randomUUID(),
          actor.id,
          movementId,
          JSON.stringify({
            batchId: item.batchId,
            productId: line.product_id,
            quantity,
            unitCost,
            price,
          }),
          now,
        ],
      );
    }
    await c.query(
      "UPDATE inventory_opening_batches SET status='POSTED',posted_at=$1,posted_by_user_id=$2,updated_at=$1 WHERE id=$3",
      [now, actor.id, item.batchId],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'inventory.opening_batch_posted','inventory_opening_batch',$3,$4,$5,$5)",
      [
        randomUUID(),
        actor.id,
        item.batchId,
        JSON.stringify({ itemCount: lines.length }),
        now,
      ],
    );
    await c.query("COMMIT");
    return item.batchId;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export async function listOpeningBatches() {
  return (
    await pool.query<{
      id: string;
      status: string;
      reference: string | null;
      createdAt: Date;
      itemCount: string;
    }>(
      'SELECT b.id,b.status,b.reference,b.created_at "createdAt",count(i.id)::text "itemCount" FROM inventory_opening_batches b LEFT JOIN inventory_opening_batch_items i ON i.batch_id=b.id GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100',
    )
  ).rows.map((row) => ({ ...row, itemCount: safeInteger(row.itemCount) }));
}
export async function openingBatchSchemaReady() {
  return (
    await pool.query<{ ready: boolean }>(
      "SELECT to_regclass('inventory_opening_batches') IS NOT NULL AND to_regclass('inventory_opening_batch_items') IS NOT NULL ready",
    )
  ).rows[0].ready;
}
export async function getOpeningBatch(id: string) {
  const batchId = valid(z.string().uuid().safeParse(id));
  const batch = (
    await pool.query<{
      id: string;
      status: string;
      reference: string | null;
      notes: string | null;
      createdAt: Date;
      postedAt: Date | null;
    }>(
      'SELECT id,status,reference,notes,created_at "createdAt",posted_at "postedAt" FROM inventory_opening_batches WHERE id=$1',
      [batchId],
    )
  ).rows[0];
  if (!batch) throw new ValidationError("La carga no existe.");
  const items = (
    await pool.query<{
      productId: string;
      quantity: string;
      unitCostMinor: string;
      salePriceMinor: string;
    }>(
      'SELECT product_id "productId",quantity::text,unit_cost_minor::text "unitCostMinor",sale_price_minor::text "salePriceMinor" FROM inventory_opening_batch_items WHERE batch_id=$1 ORDER BY product_id',
      [batchId],
    )
  ).rows.map((row) => ({
    ...row,
    quantity: safeInteger(row.quantity),
    unitCostMinor: safeInteger(row.unitCostMinor),
    salePriceMinor: safeInteger(row.salePriceMinor),
  }));
  return { ...batch, items };
}
