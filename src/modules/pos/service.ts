import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";

type Actor = { id: string };
const numeric = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
const nonnegative = z.preprocess(numeric, z.number().int().safe().nonnegative());
const positive = z.preprocess(numeric, z.number().int().safe().positive());
const saleSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerName: z.string().trim().max(160).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: positive,
        expectedPriceMinor: nonnegative,
        discountMinor: nonnegative,
      }),
    )
    .min(1)
    .max(100),
  payments: z
    .array(z.object({ accountId: z.string().uuid(), amountMinor: positive }))
    .max(10),
});
const voidSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
const collectionSchema = z.object({
  saleId: z.string().uuid(),
  accountId: z.string().uuid(),
  amountMinor: positive,
  idempotencyKey: z.string().uuid(),
});
function valid<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success)
    throw new ValidationError(result.error.issues[0]?.message ?? "Revisa la venta.");
  return result.data;
}
function safe(value: string | number) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount))
    throw new ValidationError("El importe excede el rango seguro.");
  return amount;
}
async function administrator(c: PoolClient, actor: Actor) {
  const result = await c.query(
    "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active AND r.key='ADMINISTRADOR'",
    [actor.id],
  );
  if (!result.rowCount) throw new AuthorizationError();
}
async function stock(c: PoolClient, productId: string) {
  return safe(
    (
      await c.query<{ quantity: string }>(
        "SELECT coalesce(sum(quantity),0)::text quantity FROM inventory_movements WHERE product_id=$1",
        [productId],
      )
    ).rows[0].quantity,
  );
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function createSale(actor: Actor, raw: unknown) {
  const item = valid(saleSchema.safeParse(raw));
  if (new Set(item.items.map((line) => line.productId)).size !== item.items.length)
    throw new ValidationError(
      "Cada producto debe aparecer una sola vez en el carrito.",
    );
  const requestFingerprint = hash({ actorId: actor.id, item });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await administrator(c, actor);
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `pos:${item.idempotencyKey}`,
    ]);
    const earlier = (
      await c.query<{
        id: string;
        created_by_user_id: string;
        fingerprint: string | null;
      }>(
        "SELECT s.id,s.created_by_user_id,a.metadata_json->>'requestFingerprint' fingerprint FROM pos_sales s LEFT JOIN audit_logs a ON a.entity_type='pos_sale' AND a.entity_id=s.id AND a.action='pos.sale_posted' WHERE s.idempotency_key=$1",
        [item.idempotencyKey],
      )
    ).rows[0];
    if (earlier) {
      if (
        earlier.created_by_user_id !== actor.id ||
        earlier.fingerprint !== requestFingerprint
      )
        throw new ValidationError("Esta solicitud ya se usó con otros datos.");
      await c.query("COMMIT");
      return earlier.id;
    }
    const products = new Map<
      string,
      {
        id: string;
        sku: string;
        name: string;
        unit: string;
        category: string;
        cost: number;
        price: number;
        available: number;
      }
    >();
    for (const productId of item.items.map((line) => line.productId).sort()) {
      const p = (
        await c.query<{
          id: string;
          sku: string;
          name: string;
          unit: string;
          category: string;
          cost: string;
          price: string;
        }>(
          "SELECT id,sku,name,unit,category,cost_minor::text cost,sale_price_minor::text price FROM inventory_products WHERE id=$1 AND is_active=true FOR UPDATE",
          [productId],
        )
      ).rows[0];
      if (!p) throw new ValidationError("Un producto ya no existe o está inactivo.");
      products.set(productId, {
        ...p,
        cost: safe(p.cost),
        price: safe(p.price),
        available: p.category === "Servicios" ? 0 : await stock(c, productId),
      });
    }
    const lines = item.items.map((line) => {
      const p = products.get(line.productId)!;
      if (p.price !== line.expectedPriceMinor)
        throw new ValidationError(
          `El precio de ${p.name} cambió. Actualiza el punto de venta.`,
        );
      if (p.category !== "Servicios" && line.quantity > p.available)
        throw new ValidationError(`Existencia insuficiente para ${p.name}.`);
      const gross = safe(p.price * line.quantity);
      if (line.discountMinor > gross)
        throw new ValidationError(
          `El descuento de ${p.name} supera el valor de la línea.`,
        );
      return { ...line, product: p, total: gross - line.discountMinor };
    });
    const total = safe(lines.reduce((sum, line) => safe(sum + line.total), 0));
    if (total <= 0)
      throw new ValidationError("El total de la venta debe ser mayor que cero.");
    const paid = safe(
      item.payments.reduce((sum, payment) => safe(sum + payment.amountMinor), 0),
    );
    if (paid > total)
      throw new ValidationError("Los pagos superan el total de la venta.");
    const accountIds = [
      ...new Set(item.payments.map((payment) => payment.accountId)),
    ].sort();
    for (const accountId of accountIds) {
      const account = (
        await c.query<{ currency: string }>(
          "SELECT currency FROM financial_accounts WHERE id=$1 AND is_active=true FOR UPDATE",
          [accountId],
        )
      ).rows[0];
      if (!account || account.currency !== "COP")
        throw new ValidationError(
          "Selecciona una cuenta activa en COP para cada pago.",
        );
    }
    const id = randomUUID(),
      now = new Date();
    const saleNumber = `POS-${id.replaceAll("-", "").toUpperCase()}`;
    await c.query(
      "INSERT INTO pos_sales(id,sale_number,status,customer_name,total_minor,idempotency_key,created_at,created_by_user_id) VALUES($1,$2,'DRAFT',$3,$4,$5,$6,$7)",
      [
        id,
        saleNumber,
        item.customerName || null,
        total,
        item.idempotencyKey,
        now,
        actor.id,
      ],
    );
    for (const line of lines) {
      await c.query(
        "INSERT INTO pos_sale_items(id,sale_id,product_id,sku_snapshot,name_snapshot,unit_snapshot,quantity,unit_price_minor,discount_minor,line_total_minor,unit_cost_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          randomUUID(),
          id,
          line.productId,
          line.product.sku,
          line.product.name,
          line.product.unit,
          line.quantity,
          line.product.price,
          line.discountMinor,
          line.total,
          line.product.cost,
        ],
      );
      if (line.product.category !== "Servicios") {
        const previous = await stock(c, line.productId);
        const next = previous - line.quantity;
        if (next < 0)
          throw new ValidationError(
            `Existencia insuficiente para ${line.product.name}.`,
          );
        await c.query(
          "INSERT INTO inventory_movements(id,product_id,type,quantity,previous_quantity,next_quantity,unit_cost_minor,reference,reason,source,idempotency_key,created_at,created_by_user_id,sale_id) VALUES($1,$2,'SALE',$3,$4,$5,$6,$7,'Venta POS','POS',$8,$9,$10,$11)",
          [
            randomUUID(),
            line.productId,
            -line.quantity,
            previous,
            next,
            line.product.cost,
            saleNumber,
            randomUUID(),
            now,
            actor.id,
            id,
          ],
        );
      }
    }
    await c.query("UPDATE pos_sales SET status='POSTED',posted_at=$1 WHERE id=$2", [
      now,
      id,
    ]);
    for (const payment of item.payments) {
      const transactionId = randomUUID();
      await c.query(
        "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,'SALE','DRAFT',$2,$3,$4,'Venta POS','POS',$5,$2,$2,$6,$6)",
        [
          transactionId,
          now,
          saleNumber,
          `Pago venta ${saleNumber}`,
          randomUUID(),
          actor.id,
        ],
      );
      await c.query(
        "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          transactionId,
          payment.accountId,
          payment.amountMinor,
          now,
          actor.id,
        ],
      );
      await c.query(
        "UPDATE financial_transactions SET status='POSTED',posted_at=$1 WHERE id=$2",
        [now, transactionId],
      );
      await c.query(
        "INSERT INTO pos_sale_payments(id,sale_id,account_id,financial_transaction_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          id,
          payment.accountId,
          transactionId,
          payment.amountMinor,
          now,
          actor.id,
        ],
      );
      await c.query(
        "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'pos.payment_posted','financial_transaction',$3,$4,$5,$5)",
        [
          randomUUID(),
          actor.id,
          transactionId,
          JSON.stringify({
            saleId: id,
            amountMinor: payment.amountMinor,
            accountId: payment.accountId,
          }),
          now,
        ],
      );
    }
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,metadata_json,occurred_at,created_at) VALUES($1,$2,'pos.sale_posted','pos_sale',$3,$4,$5,$6,$6)",
      [
        randomUUID(),
        actor.id,
        id,
        JSON.stringify({ saleNumber, total, paid, itemCount: lines.length }),
        JSON.stringify({ requestFingerprint }),
        now,
      ],
    );
    await c.query("COMMIT");
    return id;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export async function voidSale(actor: Actor, raw: unknown) {
  const item = valid(voidSchema.safeParse(raw));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await administrator(c, actor);
    const sale = (
      await c.query<{
        id: string;
        status: string;
        sale_number: string;
        void_reason: string | null;
      }>(
        "SELECT id,status,sale_number,void_reason FROM pos_sales WHERE id=$1 FOR UPDATE",
        [item.saleId],
      )
    ).rows[0];
    if (sale?.status === "VOIDED" && sale.void_reason === item.reason) {
      await c.query("COMMIT");
      return sale.id;
    }
    if (!sale || sale.status !== "POSTED")
      throw new ValidationError("La venta no existe o ya fue anulada.");
    const lines = (
      await c.query<{
        product_id: string;
        quantity: string;
        unit_cost_minor: string;
        category: string;
      }>(
        "SELECT i.product_id,i.quantity::text,i.unit_cost_minor::text,p.category FROM pos_sale_items i JOIN inventory_products p ON p.id=i.product_id WHERE i.sale_id=$1 ORDER BY i.product_id",
        [sale.id],
      )
    ).rows;
    for (const line of lines) {
      await c.query("SELECT 1 FROM inventory_products WHERE id=$1 FOR UPDATE", [
        line.product_id,
      ]);
    }
    const payments = (
      await c.query<{
        account_id: string;
        financial_transaction_id: string;
        amount_minor: string;
        type: string;
      }>(
        "SELECT p.account_id,p.financial_transaction_id,p.amount_minor::text,t.type FROM pos_sale_payments p JOIN financial_transactions t ON t.id=p.financial_transaction_id WHERE p.sale_id=$1 ORDER BY p.account_id,p.financial_transaction_id",
        [sale.id],
      )
    ).rows;
    for (const accountId of [...new Set(payments.map((p) => p.account_id))].sort()) {
      await c.query("SELECT 1 FROM financial_accounts WHERE id=$1 FOR UPDATE", [
        accountId,
      ]);
      const balance = safe(
        (
          await c.query<{ balance: string }>(
            "SELECT coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT'),0)::text balance FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id WHERE m.account_id=$1",
            [accountId],
          )
        ).rows[0].balance,
      );
      const refund = safe(
        payments
          .filter((p) => p.account_id === accountId)
          .reduce((sum, p) => safe(sum + safe(p.amount_minor)), 0),
      );
      if (balance < refund)
        throw new ValidationError(
          "No se puede anular: saldo insuficiente para devolver el pago en Caja.",
        );
    }
    const now = new Date();
    for (const line of lines) {
      if (line.category === "Servicios") continue;
      const previous = await stock(c, line.product_id),
        quantity = safe(line.quantity),
        next = safe(previous + quantity);
      await c.query(
        "INSERT INTO inventory_movements(id,product_id,type,quantity,previous_quantity,next_quantity,unit_cost_minor,reference,reason,source,idempotency_key,created_at,created_by_user_id,sale_id) VALUES($1,$2,'RETURN',$3,$4,$5,$6,$7,$8,'POS_VOID',$9,$10,$11,$12)",
        [
          randomUUID(),
          line.product_id,
          quantity,
          previous,
          next,
          safe(line.unit_cost_minor),
          sale.sale_number,
          `Anulación: ${item.reason}`,
          randomUUID(),
          now,
          actor.id,
          sale.id,
        ],
      );
    }
    for (const payment of payments) {
      const reversalId = randomUUID();
      await c.query(
        "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id,reversal_of_transaction_id) VALUES($1,$2,'DRAFT',$3,$4,$5,'Venta POS','POS_VOID',$6,$3,$3,$7,$7,$8)",
        [
          reversalId,
          payment.type,
          now,
          sale.sale_number,
          `Anulación: ${item.reason}`,
          randomUUID(),
          actor.id,
          payment.financial_transaction_id,
        ],
      );
      await c.query(
        "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          reversalId,
          payment.account_id,
          -safe(payment.amount_minor),
          now,
          actor.id,
        ],
      );
      await c.query(
        "UPDATE financial_transactions SET status='POSTED',posted_at=$1 WHERE id=$2",
        [now, reversalId],
      );
      await c.query(
        "UPDATE financial_transactions SET status='VOIDED',voided_at=$1,voided_by_user_id=$2,void_reason=$3,updated_at=$1,updated_by_user_id=$2 WHERE id=$4",
        [now, actor.id, item.reason, payment.financial_transaction_id],
      );
      await c.query(
        "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'pos.payment_reversed','financial_transaction',$3,$4,$5,$5)",
        [
          randomUUID(),
          actor.id,
          reversalId,
          JSON.stringify({
            saleId: sale.id,
            originalTransactionId: payment.financial_transaction_id,
          }),
          now,
        ],
      );
    }
    await c.query(
      "UPDATE pos_sales SET status='VOIDED',voided_at=$1,void_reason=$2,voided_by_user_id=$3 WHERE id=$4",
      [now, item.reason, actor.id, sale.id],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'pos.sale_voided','pos_sale',$3,$4,$5,$5)",
      [randomUUID(), actor.id, sale.id, JSON.stringify({ reason: item.reason }), now],
    );
    await c.query("COMMIT");
    return sale.id;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export async function collectSalePayment(actor: Actor, raw: unknown) {
  const item = valid(collectionSchema.safeParse(raw));
  const requestFingerprint = hash({ actorId: actor.id, item });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await administrator(c, actor);
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `pos-collection:${item.idempotencyKey}`,
    ]);
    const earlier = (
      await c.query<{ sale_id: string; fingerprint: string | null }>(
        "SELECT p.sale_id,a.metadata_json->>'requestFingerprint' fingerprint FROM pos_sale_payments p JOIN financial_transactions t ON t.id=p.financial_transaction_id LEFT JOIN audit_logs a ON a.entity_type='pos_sale' AND a.entity_id=p.sale_id AND a.action='pos.collection_posted' AND a.after_json->>'financialTransactionId'=t.id WHERE t.idempotency_key=$1",
        [item.idempotencyKey],
      )
    ).rows[0];
    if (earlier) {
      if (earlier.sale_id !== item.saleId || earlier.fingerprint !== requestFingerprint)
        throw new ValidationError("Esta solicitud ya se usó con otros datos.");
      await c.query("COMMIT");
      return earlier.sale_id;
    }
    const sale = (
      await c.query<{ sale_number: string; total_minor: string; status: string }>(
        "SELECT sale_number,total_minor::text,status FROM pos_sales WHERE id=$1 FOR UPDATE",
        [item.saleId],
      )
    ).rows[0];
    if (!sale || sale.status !== "POSTED")
      throw new ValidationError("La venta no está disponible para cobro.");
    const paid = safe(
      (
        await c.query<{ paid: string }>(
          "SELECT coalesce(sum(amount_minor),0)::text paid FROM pos_sale_payments WHERE sale_id=$1",
          [item.saleId],
        )
      ).rows[0].paid,
    );
    if (item.amountMinor > safe(sale.total_minor) - paid)
      throw new ValidationError("El cobro supera el saldo pendiente de la venta.");
    const account = (
      await c.query<{ currency: string }>(
        "SELECT currency FROM financial_accounts WHERE id=$1 AND is_active=true FOR UPDATE",
        [item.accountId],
      )
    ).rows[0];
    if (!account || account.currency !== "COP")
      throw new ValidationError("Selecciona una cuenta activa en COP.");
    const now = new Date(),
      transactionId = randomUUID();
    await c.query(
      "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,'COLLECTION','DRAFT',$2,$3,$4,'Cobro POS','POS_COLLECTION',$5,$2,$2,$6,$6)",
      [
        transactionId,
        now,
        sale.sale_number,
        `Cobro venta ${sale.sale_number}`,
        item.idempotencyKey,
        actor.id,
      ],
    );
    await c.query(
      "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), transactionId, item.accountId, item.amountMinor, now, actor.id],
    );
    await c.query(
      "UPDATE financial_transactions SET status='POSTED',posted_at=$1 WHERE id=$2",
      [now, transactionId],
    );
    await c.query(
      "INSERT INTO pos_sale_payments(id,sale_id,account_id,financial_transaction_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        item.saleId,
        item.accountId,
        transactionId,
        item.amountMinor,
        now,
        actor.id,
      ],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,metadata_json,occurred_at,created_at) VALUES($1,$2,'pos.collection_posted','pos_sale',$3,$4,$5,$6,$6)",
      [
        randomUUID(),
        actor.id,
        item.saleId,
        JSON.stringify({
          financialTransactionId: transactionId,
          amountMinor: item.amountMinor,
        }),
        JSON.stringify({ requestFingerprint }),
        now,
      ],
    );
    await c.query("COMMIT");
    return item.saleId;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

export async function listPosAccounts() {
  return (
    await pool.query<{ id: string; name: string }>(
      "SELECT id,name FROM financial_accounts WHERE is_active=true AND currency='COP' ORDER BY name",
    )
  ).rows;
}
export async function posSchemaReady() {
  return (
    await pool.query<{ ready: boolean }>(
      "SELECT to_regclass('pos_sales') IS NOT NULL AND to_regclass('pos_sale_items') IS NOT NULL AND to_regclass('pos_sale_payments') IS NOT NULL ready",
    )
  ).rows[0].ready;
}
export async function listSales() {
  return (
    await pool.query<{
      id: string;
      saleNumber: string;
      status: string;
      customerName: string | null;
      totalMinor: string;
      paidMinor: string;
      createdAt: Date;
    }>(
      `SELECT s.id,s.sale_number "saleNumber",s.status,s.customer_name "customerName",
      s.total_minor::text "totalMinor",coalesce(sum(p.amount_minor),0)::text "paidMinor",s.created_at "createdAt"
     FROM pos_sales s LEFT JOIN pos_sale_payments p ON p.sale_id=s.id
     GROUP BY s.id ORDER BY s.created_at DESC LIMIT 100`,
    )
  ).rows.map((row) => ({
    ...row,
    totalMinor: safe(row.totalMinor),
    paidMinor: safe(row.paidMinor),
  }));
}
export async function getSale(id: string) {
  const saleId = valid(z.string().uuid().safeParse(id));
  const sale = (
    await pool.query<{
      id: string;
      saleNumber: string;
      status: string;
      customerName: string | null;
      totalMinor: string;
      createdAt: Date;
      postedAt: Date | null;
      voidReason: string | null;
    }>(
      'SELECT id,sale_number "saleNumber",status,customer_name "customerName",total_minor::text "totalMinor",created_at "createdAt",posted_at "postedAt",void_reason "voidReason" FROM pos_sales WHERE id=$1',
      [saleId],
    )
  ).rows[0];
  if (!sale) throw new ValidationError("La venta no existe.");
  const [items, payments] = await Promise.all([
    pool.query<{
      sku: string;
      name: string;
      unit: string;
      quantity: string;
      unitPriceMinor: string;
      discountMinor: string;
      lineTotalMinor: string;
    }>(
      'SELECT sku_snapshot sku,name_snapshot name,unit_snapshot unit,quantity::text,unit_price_minor::text "unitPriceMinor",discount_minor::text "discountMinor",line_total_minor::text "lineTotalMinor" FROM pos_sale_items WHERE sale_id=$1 ORDER BY name_snapshot',
      [saleId],
    ),
    pool.query<{ accountName: string; amountMinor: string }>(
      'SELECT a.name "accountName",p.amount_minor::text "amountMinor" FROM pos_sale_payments p JOIN financial_accounts a ON a.id=p.account_id WHERE p.sale_id=$1 ORDER BY p.created_at',
      [saleId],
    ),
  ]);
  return {
    ...sale,
    totalMinor: safe(sale.totalMinor),
    items: items.rows.map((line) => ({
      ...line,
      quantity: safe(line.quantity),
      unitPriceMinor: safe(line.unitPriceMinor),
      discountMinor: safe(line.discountMinor),
      lineTotalMinor: safe(line.lineTotalMinor),
    })),
    payments: payments.rows.map((payment) => ({
      ...payment,
      amountMinor: safe(payment.amountMinor),
    })),
  };
}
