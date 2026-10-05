import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { pool } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { businessMonthBounds } from "@/lib/business-time";
import { z } from "zod";
import {
  createBalanceAdjustmentSchema,
  createExpenseSchema,
  createIncomeSchema,
  createOpeningBalanceSchema,
  createTransferSchema,
  voidFinancialTransactionSchema,
  financialHistoryFiltersSchema,
} from "./validation";
type Actor = { id: string };
type Movement = { accountId: string; amountMinor: number };
function safeMoney(value: string | number) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount))
    throw new ValidationError("El saldo excede el rango monetario seguro.");
  return amount;
}
async function authorizeAdministrator(c: { query: typeof pool.query }, actor: Actor) {
  const allowed = await c.query(
    "SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_active AND r.key='ADMINISTRADOR'",
    [actor.id],
  );
  if (!allowed.rowCount) throw new AuthorizationError();
}
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
  return safeMoney(
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
    idempotencyKey: string;
    actualBalanceMinor?: number;
    source: string;
    description: string;
    occurredAt: Date;
    reference?: string | null;
    category?: string | null;
    movements: Movement[];
  },
  action: string,
  options: {
    afterAccountsLocked?: (client: { query: typeof pool.query }) => Promise<void>;
    resolveMovements?: (client: { query: typeof pool.query }) => Promise<Movement[]>;
  } = {},
) {
  const c = await pool.connect();
  try {
    // Row locks serialize every writer per account; READ COMMITTED sees the
    // preceding writer's committed ledger after acquiring those locks.
    await c.query("BEGIN");
    await authorizeAdministrator(c, actor);
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      input.idempotencyKey,
    ]);
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ actorId: actor.id, ...input }))
      .digest("hex");
    const previous = (
      await c.query<{ id: string; actorId: string; fingerprint: string | null }>(
        "SELECT t.id,t.created_by_user_id AS \"actorId\",a.after_json->>'requestFingerprint' fingerprint FROM financial_transactions t LEFT JOIN audit_logs a ON a.entity_id=t.id AND a.action=$2 WHERE t.idempotency_key=$1",
        [input.idempotencyKey, action],
      )
    ).rows[0];
    if (previous) {
      if (previous.actorId !== actor.id || previous.fingerprint !== requestFingerprint)
        throw new ValidationError(
          "La solicitud ya fue usada con otros datos. Abre un formulario nuevo.",
        );
      await c.query("COMMIT");
      return previous.id;
    }
    const lockedAccountIds = [
      ...new Set(input.movements.map(({ accountId }) => accountId)),
    ].sort();
    const currencies = new Set<string>();
    for (const accountId of lockedAccountIds) {
      currencies.add((await account(c, accountId)).currency);
    }
    if (currencies.size !== 1 || !currencies.has("COP"))
      throw new ValidationError(
        "Caja opera en COP. Las transferencias deben usar cuentas de la misma moneda.",
      );
    await options.afterAccountsLocked?.(c);
    const movements = options.resolveMovements
      ? await options.resolveMovements(c)
      : input.movements;
    if (
      movements.length === 0 ||
      movements.some(({ accountId }) => !lockedAccountIds.includes(accountId))
    ) {
      throw new ValidationError("Los movimientos de la operación no son válidos.");
    }
    for (const m of movements) {
      safeMoney(m.amountMinor);
      const b = await balance(c, m.accountId);
      safeMoney(b + m.amountMinor);
      if (m.amountMinor < 0) {
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
        input.idempotencyKey,
        now,
        actor.id,
      ],
    );
    for (const m of movements)
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
          movements,
          requestFingerprint,
          actualBalanceMinor: input.actualBalanceMinor,
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
  return post(
    a,
    {
      type: "ADJUSTMENT",
      idempotencyKey: i.idempotencyKey,
      source: "OPENING_BALANCE",
      description: i.description || "Saldo inicial",
      category: "Saldo inicial",
      reference: i.reference,
      occurredAt: i.occurredAt,
      movements: [{ accountId: i.accountId, amountMinor: i.amountMinor }],
    },
    "financial_transaction.opening_balance_created",
    {
      async afterAccountsLocked(client) {
        if (
          (
            await client.query(
              "SELECT 1 FROM financial_transactions t JOIN financial_movements m ON m.transaction_id=t.id WHERE m.account_id=$1 AND t.source='OPENING_BALANCE' AND t.status='POSTED'",
              [i.accountId],
            )
          ).rowCount
        ) {
          throw new ValidationError(
            "Esta cuenta ya tiene un saldo inicial registrado.",
          );
        }
      },
    },
  );
}
export async function registerIncome(a: Actor, r: unknown) {
  const i = valid(createIncomeSchema.safeParse(r));
  return post(
    a,
    {
      type: "INCOME",
      idempotencyKey: i.idempotencyKey,
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
      idempotencyKey: i.idempotencyKey,
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
  return post(
    a,
    {
      type: "TRANSFER",
      idempotencyKey: i.idempotencyKey,
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
  return post(
    a,
    {
      type: "ADJUSTMENT",
      source: "BALANCE_ADJUSTMENT",
      idempotencyKey: i.idempotencyKey,
      actualBalanceMinor: i.actualBalanceMinor,
      description: i.reason,
      category: "Ajuste de saldo",
      reference: i.reference,
      occurredAt: i.occurredAt,
      // The account id is used to acquire the row lock. The actual amount is
      // resolved below only after that lock is held.
      movements: [{ accountId: i.accountId, amountMinor: 0 }],
    },
    "financial_transaction.balance_adjustment_created",
    {
      async resolveMovements(client) {
        const currentBalance = await balance(client, i.accountId);
        if (currentBalance === i.actualBalanceMinor) {
          throw new ValidationError(
            "El saldo real coincide con el saldo registrado; no se requiere un ajuste.",
          );
        }
        return [
          {
            accountId: i.accountId,
            amountMinor: i.actualBalanceMinor - currentBalance,
          },
        ];
      },
    },
  );
}
export async function voidFinancialTransaction(a: Actor, r: unknown) {
  const i = valid(voidFinancialTransactionSchema.safeParse(r));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await authorizeAdministrator(c, a);
    const o = (
      await c.query<{
        id: string;
        type: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER";
        occurred_at: Date;
        reference: string | null;
        category: string | null;
        status: string;
        source: string;
        void_reason: string | null;
      }>("SELECT * FROM financial_transactions WHERE id=$1 FOR UPDATE", [
        i.transactionId,
      ])
    ).rows[0];
    if (o?.status === "VOIDED" && o.void_reason === i.reason) {
      const reversal = (
        await c.query<{ id: string }>(
          "SELECT id FROM financial_transactions WHERE reversal_of_transaction_id=$1 AND status='POSTED'",
          [o.id],
        )
      ).rows[0];
      if (reversal) {
        await c.query("COMMIT");
        return reversal.id;
      }
    }
    if (!o || o.status !== "POSTED" || o.source === "VOID_REVERSAL")
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
    for (const accountId of [...new Set(ms.map((m) => m.account_id))].sort()) {
      // Inactive accounts retain their history and can still be compensated.
      await c.query("SELECT id FROM financial_accounts WHERE id=$1 FOR UPDATE", [
        accountId,
      ]);
      const delta = ms
        .filter((m) => m.account_id === accountId)
        .reduce((sum, m) => safeMoney(sum - safeMoney(m.amount_minor)), 0);
      if (safeMoney((await balance(c, accountId)) + delta) < 0)
        throw new ValidationError(
          "No se puede anular: la compensación dejaría saldo negativo en una cuenta.",
        );
    }
    const now = new Date(),
      id = randomUUID();
    await c.query(
      "INSERT INTO financial_transactions(id,type,status,occurred_at,reference,description,category,source,idempotency_key,created_at,updated_at,created_by_user_id,updated_by_user_id,reversal_of_transaction_id) VALUES($1,$2,'DRAFT',$3,$4,$5,$6,'VOID_REVERSAL',$7,$8,$8,$9,$9,$10)",
      [
        id,
        o.type,
        now,
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
        [randomUUID(), id, m.account_id, -safeMoney(m.amount_minor), now, a.id],
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
  type?: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER" | "OPENING_BALANCE";
};
export async function getFinancialOverview(f: FinancialHistoryFilters = {}) {
  f = valid(financialHistoryFiltersSchema.safeParse(f));
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    let p = f.page ?? 1;
    const s = 25,
      month = businessMonthBounds();
    const accounts = (
      await c.query<{
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
    ).rows.map((x) => ({ ...x, balanceMinor: safeMoney(x.balanceMinor) }));
    const totals = (
      await c.query<{ income: string; expense: string }>(
        "SELECT coalesce(sum(CASE WHEN t.type='INCOME' AND t.status<>'DRAFT' THEN m.amount_minor ELSE 0 END),0)::text income,coalesce(sum(CASE WHEN t.type='EXPENSE' AND t.status<>'DRAFT' THEN -m.amount_minor ELSE 0 END),0)::text expense FROM financial_transactions t LEFT JOIN financial_movements m ON m.transaction_id=t.id WHERE t.occurred_at BETWEEN $1 AND $2",
        [month.start, month.end],
      )
    ).rows[0];
    const clauses = ["t.status <> 'DRAFT'"];
    const values: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      clauses.push(clause.replace("?", `$${values.length}`));
    };
    if (f.accountId)
      add(
        "EXISTS(SELECT 1 FROM financial_movements fm WHERE fm.transaction_id=t.id AND fm.account_id=?)",
        f.accountId,
      );
    if (f.category) add("t.category ILIKE ?", `%${f.category.trim()}%`);
    if (f.dateFrom) add("t.occurred_at >= ?", f.dateFrom);
    if (f.dateTo) add("t.occurred_at <= ?", f.dateTo);
    if (f.type === "OPENING_BALANCE") add("t.source = ?", "OPENING_BALANCE");
    else if (f.type) add("t.type = ?", f.type);
    if (f.search?.trim()) {
      const search = `%${f.search.trim()}%`;
      values.push(search, search);
      clauses.push(
        `(t.description ILIKE $${values.length - 1} OR t.reference ILIKE $${values.length})`,
      );
    }
    const where = clauses.join(" AND ");
    const count = await c.query<{ total: string }>(
      `SELECT count(*)::text total FROM financial_transactions t WHERE ${where}`,
      values,
    );
    const total = Number(count.rows[0]?.total ?? 0);
    const totalAll = Number(
      (
        await c.query<{ total: string }>(
          "SELECT count(*)::text total FROM financial_transactions WHERE status<>'DRAFT'",
        )
      ).rows[0].total,
    );
    p = Math.min(p, Math.max(1, Math.ceil(total / s)));
    const offset = (p - 1) * s;
    const recent = (
      await c.query<{
        id: string;
        type: "ADJUSTMENT" | "EXPENSE" | "INCOME" | "TRANSFER";
        status: "POSTED" | "VOIDED";
        occurredAt: Date;
        reference: string | null;
        description: string | null;
        category: string | null;
        source: string;
        createdAt: Date;
        voidedAt: Date | null;
        voidReason: string | null;
        voidedByName: string | null;
        reversalOfTransactionId: string | null;
        userName: string | null;
        accountNames: string | null;
        amountMinor: string;
        displayAmountMinor: string;
      }>(
        `SELECT t.id,t.type,t.status,t.occurred_at "occurredAt",t.reference,t.description,t.category,t.source,t.created_at "createdAt",t.voided_at "voidedAt",t.void_reason "voidReason",t.reversal_of_transaction_id "reversalOfTransactionId",u.display_name "userName",v.display_name "voidedByName",string_agg(a.name, ' → ' ORDER BY m.amount_minor) "accountNames",coalesce(sum(m.amount_minor),0)::text "amountMinor",coalesce(max(abs(m.amount_minor)),0)::text "displayAmountMinor" FROM financial_transactions t LEFT JOIN financial_movements m ON m.transaction_id=t.id LEFT JOIN financial_accounts a ON a.id=m.account_id LEFT JOIN users u ON u.id=t.created_by_user_id LEFT JOIN users v ON v.id=t.voided_by_user_id WHERE ${where} GROUP BY t.id,u.display_name,v.display_name ORDER BY t.occurred_at DESC,t.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, s, offset],
      )
    ).rows.map((row) => ({
      ...row,
      amountMinor: safeMoney(row.amountMinor),
      displayAmountMinor: safeMoney(row.displayAmountMinor),
    }));
    await c.query("COMMIT");
    return {
      accounts,
      totalAvailableMinor: accounts
        .filter((x) => x.isActive)
        .reduce((n, x) => safeMoney(n + x.balanceMinor), 0),
      incomeMinor: safeMoney(totals.income),
      expenseMinor: safeMoney(totals.expense),
      flowNetMinor: safeMoney(safeMoney(totals.income) - safeMoney(totals.expense)),
      period: { start: month.start, end: month.end },
      history: { page: p, pageSize: s, total, totalAll },
      recent,
    };
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
