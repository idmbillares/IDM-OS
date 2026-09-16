import { randomUUID } from "node:crypto";
import { pool } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { businessMonthBounds } from "@/lib/business-time";
import { z } from "zod";
import {
  createBalanceAdjustmentSchema,
  createExpenseSchema,
  createIncomeSchema,
  createOpeningBalanceSchema,
  createTransferSchema,
  voidFinancialTransactionSchema,
} from "./validation";
type Actor = { id: string };
type Movement = { accountId: string; amountMinor: number };
const valid = <T>(r: z.ZodSafeParseResult<T>) => {
  if (!r.success)
    throw new ValidationError(
      r.error.issues[0]?.message ?? "Revisa los datos financieros.",
    );
  return r.data;
};
async function account(c: { query: typeof pool.query }, id: string) {
  const r = (
    await c.query<{ id: string; currency: string }>(
      "SELECT id,currency FROM financial_accounts WHERE id=$1 AND is_active=true FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!r) throw new ValidationError("La cuenta no existe o está inactiva.");
  return r;
}
async function balance(c: { query: typeof pool.query }, id: string) {
  return Number(
    (
      await c.query<{ balance: string }>(
        "SELECT coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT'),0)::text balance FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id WHERE m.account_id=$1",
        [id],
      )
    ).rows[0]?.balance ?? 0,
  );
}
async function post(
  actor: Actor,
  input: {
    type: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER";
    source: string;
    description: string;
    occurredAt: Date;
    reference?: string | null;
    category?: string | null;
    movements: Movement[];
  },
  action: string,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    for (const m of input.movements) {
      await account(c, m.accountId);
      if (m.amountMinor < 0) {
        const b = await balance(c, m.accountId);
        if (b + m.amountMinor < 0)
          throw new ValidationError("Saldo insuficiente para esta operación.");
      }
    }
    const now = new Date(),
      id = randomUUID();
    await c.query(
      "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$9,$10,$10)",
      [
        id,
        input.type,
        input.occurredAt,
        input.reference?.trim() || null,
        input.description,
        input.category?.trim() || null,
        input.source,
        randomUUID(),
        now,
        actor.id,
      ],
    );
    for (const m of input.movements)
      await c.query(
        "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), id, m.accountId, m.amountMinor, now, actor.id],
      );
    await c.query(
      "UPDATE financial_transactions SET status='POSTED',posted_at=$1,updated_at=$1,updated_by_user_id=$2 WHERE id=$3",
      [now, actor.id, id],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,$3,'financial_transaction',$4,$5,$6,$6)",
      [
        randomUUID(),
        actor.id,
        action,
        id,
        JSON.stringify({
          type: input.type,
          source: input.source,
          movements: input.movements,
        }),
        now,
      ],
    );
    await c.query("COMMIT");
    return id;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function registerOpeningBalance(a: Actor, r: unknown) {
  const i = valid(createOpeningBalanceSchema.safeParse(r));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await account(c, i.accountId);
    if (
      (
        await c.query(
          "SELECT 1 FROM financial_transactions t JOIN financial_movements m ON m.transaction_id=t.id WHERE m.account_id=$1 AND t.source='OPENING_BALANCE' AND t.status='POSTED'",
          [i.accountId],
        )
      ).rowCount
    )
      throw new ValidationError("Esta cuenta ya tiene un saldo inicial registrado.");
    await c.query("ROLLBACK");
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    c.release();
    throw e;
  }
  c.release();
  return post(
    a,
    {
      type: "ADJUSTMENT",
      source: "OPENING_BALANCE",
      description: i.description || "Saldo inicial",
      category: "Saldo inicial",
      reference: i.reference,
      occurredAt: i.occurredAt,
      movements: [{ accountId: i.accountId, amountMinor: i.amountMinor }],
    },
    "financial_transaction.opening_balance_created",
  );
}
export async function registerIncome(a: Actor, r: unknown) {
  const i = valid(createIncomeSchema.safeParse(r));
  return post(
    a,
    {
      type: "INCOME",
      source: "MANUAL",
      description: i.description,
      category: i.category,
      reference: i.reference,
      occurredAt: i.occurredAt,
      movements: [{ accountId: i.accountId, amountMinor: i.amountMinor }],
    },
    "financial_transaction.income_created",
  );
}
export async function registerExpense(a: Actor, r: unknown) {
  const i = valid(createExpenseSchema.safeParse(r));
  return post(
    a,
    {
      type: "EXPENSE",
      source: "MANUAL",
      description: i.description,
      category: i.category,
      reference: i.reference,
      occurredAt: i.occurredAt,
      movements: [{ accountId: i.accountId, amountMinor: -i.amountMinor }],
    },
    "financial_transaction.expense_created",
  );
}
export async function registerTransfer(a: Actor, r: unknown) {
  const i = valid(createTransferSchema.safeParse(r));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const o = await account(c, i.originAccountId),
      d = await account(c, i.destinationAccountId);
    if (o.currency !== d.currency)
      throw new ValidationError(
        "Las transferencias requieren cuentas de la misma moneda.",
      );
    await c.query("ROLLBACK");
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    c.release();
    throw e;
  }
  c.release();
  return post(
    a,
    {
      type: "TRANSFER",
      source: "MANUAL",
      description: i.description,
      reference: i.reference,
      occurredAt: i.occurredAt,
      movements: [
        { accountId: i.originAccountId, amountMinor: -i.amountMinor },
        { accountId: i.destinationAccountId, amountMinor: i.amountMinor },
      ],
    },
    "financial_transaction.transfer_created",
  );
}
export async function registerBalanceAdjustment(a: Actor, r: unknown) {
  const i = valid(createBalanceAdjustmentSchema.safeParse(r));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await account(c, i.accountId);
    const b = await balance(c, i.accountId);
    await c.query("ROLLBACK");
    if (b === i.actualBalanceMinor)
      throw new ValidationError(
        "El saldo real coincide con el saldo registrado; no se requiere un ajuste.",
      );
    return post(
      a,
      {
        type: "ADJUSTMENT",
        source: "BALANCE_ADJUSTMENT",
        description: i.reason,
        category: "Ajuste de saldo",
        reference: i.reference,
        occurredAt: i.occurredAt,
        movements: [{ accountId: i.accountId, amountMinor: i.actualBalanceMinor - b }],
      },
      "financial_transaction.balance_adjustment_created",
    );
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    c.release();
  }
}
export async function voidFinancialTransaction(a: Actor, r: unknown) {
  const i = valid(voidFinancialTransactionSchema.safeParse(r));
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const o = (
      await c.query<{
        id: string;
        type: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER";
        occurred_at: Date;
        reference: string | null;
        category: string | null;
      }>(
        "SELECT * FROM financial_transactions WHERE id=$1 AND status='POSTED' FOR UPDATE",
        [i.transactionId],
      )
    ).rows[0];
    if (!o)
      throw new ValidationError(
        "La operación no existe, ya fue anulada o no está publicada.",
      );
    const ms = (
      await c.query<{ account_id: string; amount_minor: string }>(
        "SELECT account_id,amount_minor::text FROM financial_movements WHERE transaction_id=$1",
        [o.id],
      )
    ).rows;
    if (!ms.length)
      throw new ValidationError("La operación no tiene movimientos para compensar.");
    const now = new Date(),
      id = randomUUID();
    await c.query(
      "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id,reversal_of_transaction_id) VALUES($1,$2,'DRAFT',$3,$4,$5,$6,'VOID_REVERSAL',$7,$8,$8,$9,$9,$10)",
      [
        id,
        o.type,
        o.occurred_at,
        o.reference,
        `Anulación: ${i.reason}`,
        o.category,
        randomUUID(),
        now,
        a.id,
        o.id,
      ],
    );
    for (const m of ms)
      await c.query(
        "INSERT INTO financial_movements(id,transaction_id,account_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), id, m.account_id, -Number(m.amount_minor), now, a.id],
      );
    await c.query(
      "UPDATE financial_transactions SET status='POSTED',posted_at=$1,updated_at=$1,updated_by_user_id=$2 WHERE id=$3",
      [now, a.id, id],
    );
    await c.query(
      "UPDATE financial_transactions SET status='VOIDED',voided_at=$1,voided_by_user_id=$2,void_reason=$3,updated_at=$1,updated_by_user_id=$2 WHERE id=$4",
      [now, a.id, i.reason, o.id],
    );
    await c.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at,created_at) VALUES($1,$2,'financial_transaction.voided','financial_transaction',$3,$4,$5,$5)",
      [
        randomUUID(),
        a.id,
        o.id,
        JSON.stringify({ reversalId: id, reason: i.reason }),
        now,
      ],
    );
    await c.query("COMMIT");
    return id;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export type FinancialHistoryFilters = {
  accountId?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  search?: string;
  type?: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER";
};
export async function getFinancialOverview(f: FinancialHistoryFilters = {}) {
  const p = Math.max(f.page ?? 1, 1),
    s = 25,
    month = businessMonthBounds();
  const accounts = (
    await pool.query<{
      id: string;
      name: string;
      kind: "CASH" | "PETTY_CASH" | "BANK" | "OTHER";
      description: string | null;
      isActive: boolean;
      currency: string;
      createdAt: Date;
      updatedAt: Date;
      balanceMinor: string;
    }>(
      'SELECT a.id,a.name,a.kind,a.description,a.is_active "isActive",a.currency,a.created_at "createdAt",a.updated_at "updatedAt",coalesce(sum(m.amount_minor) FILTER(WHERE t.status<>\'DRAFT\'),0)::text "balanceMinor" FROM financial_accounts a LEFT JOIN financial_movements m ON m.account_id=a.id LEFT JOIN financial_transactions t ON t.id=m.transaction_id GROUP BY a.id ORDER BY a.name',
    )
  ).rows.map((x) => ({ ...x, balanceMinor: Number(x.balanceMinor) }));
  const totals = (
    await pool.query<{ income: string; expense: string }>(
      "SELECT coalesce(sum(CASE WHEN t.type='INCOME' AND t.status<>'DRAFT' THEN m.amount_minor ELSE 0 END),0)::text income,coalesce(sum(CASE WHEN t.type='EXPENSE' AND t.status<>'DRAFT' THEN -m.amount_minor ELSE 0 END),0)::text expense FROM financial_transactions t LEFT JOIN financial_movements m ON m.transaction_id=t.id WHERE t.occurred_at BETWEEN $1 AND $2",
      [month.start, month.end],
    )
  ).rows[0];
  return {
    accounts,
    totalAvailableMinor: accounts
      .filter((x) => x.isActive)
      .reduce((n, x) => n + x.balanceMinor, 0),
    incomeMinor: Number(totals.income),
    expenseMinor: Number(totals.expense),
    history: { page: p, pageSize: s, total: 0 },
    recent: [],
  };
}
