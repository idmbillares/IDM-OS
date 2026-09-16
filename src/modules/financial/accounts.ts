import { randomUUID } from "node:crypto";
import { pool } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { z } from "zod";
import {
  createFinancialAccountSchema,
  setFinancialAccountStatusSchema,
  updateFinancialAccountSchema,
} from "./validation";
type Actor = { id: string };
export type FinancialAccountSummary = {
  id: string;
  name: string;
  kind: "CASH" | "PETTY_CASH" | "BANK" | "OTHER";
  description: string | null;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
const validate = <T>(r: z.ZodSafeParseResult<T>) => {
  if (!r.success)
    throw new ValidationError(
      r.error.issues[0]?.message ?? "Revisa los datos de la cuenta.",
    );
  return r.data;
};
const toSummary = (r: {
  id: string;
  name: string;
  kind: FinancialAccountSummary["kind"];
  description: string | null;
  currency: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}): FinancialAccountSummary => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  description: r.description,
  currency: r.currency,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const snapshot = (a: FinancialAccountSummary) => ({
  name: a.name,
  kind: a.kind,
  description: a.description,
  currency: a.currency,
  isActive: a.isActive,
});
export async function listFinancialAccounts() {
  return (
    await pool.query<Parameters<typeof toSummary>[0]>(
      "SELECT id,name,kind,description,currency,is_active,created_at,updated_at FROM financial_accounts ORDER BY lower(trim(name))",
    )
  ).rows.map(toSummary);
}
async function current(id: string) {
  const r = (
    await pool.query<Parameters<typeof toSummary>[0]>(
      "SELECT id,name,kind,description,currency,is_active,created_at,updated_at FROM financial_accounts WHERE id=$1",
      [id],
    )
  ).rows[0];
  return r ? toSummary(r) : null;
}
async function unique(client: { query: typeof pool.query }, name: string, id?: string) {
  const r = await client.query(
    "SELECT 1 FROM financial_accounts WHERE lower(trim(name))=lower(trim($1)) AND ($2::text IS NULL OR id<>$2)",
    [name, id ?? null],
  );
  if (r.rowCount) throw new ValidationError("Ya existe una cuenta con ese nombre.");
}
async function audit(
  client: { query: typeof pool.query },
  actor: string,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
  now: Date,
) {
  await client.query(
    "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at,created_at) VALUES($1,$2,$3,'financial_account',$4,$5,$6,$7,$7)",
    [
      randomUUID(),
      actor,
      action,
      id,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      now,
    ],
  );
}
export async function createFinancialAccount(actor: Actor, raw: unknown) {
  const input = validate(createFinancialAccountSchema.safeParse(raw));
  const now = new Date();
  const account: FinancialAccountSummary = {
    id: randomUUID(),
    name: input.name,
    kind: input.kind,
    description: input.description?.trim() || null,
    currency: input.currency,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await unique(c, account.name);
    await c.query(
      "INSERT INTO financial_accounts(id,name,kind,description,currency,is_active,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5,true,$6,$6,$7,$7)",
      [
        account.id,
        account.name,
        account.kind,
        account.description,
        account.currency,
        now,
        actor.id,
      ],
    );
    await audit(
      c,
      actor.id,
      "financial_account.created",
      account.id,
      null,
      snapshot(account),
      now,
    );
    await c.query("COMMIT");
    return account;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function updateFinancialAccount(actor: Actor, raw: unknown) {
  const input = validate(updateFinancialAccountSchema.safeParse(raw));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const existing = await current(input.id);
    if (!existing) throw new ValidationError("La cuenta financiera ya no existe.");
    await unique(c, input.name, input.id);
    const now = new Date(),
      updated = {
        ...existing,
        name: input.name,
        description: input.description?.trim() || null,
        updatedAt: now,
      };
    await c.query(
      "UPDATE financial_accounts SET name=$1,description=$2,updated_at=$3,updated_by_user_id=$4 WHERE id=$5",
      [updated.name, updated.description, now, actor.id, input.id],
    );
    await audit(
      c,
      actor.id,
      "financial_account.updated",
      input.id,
      snapshot(existing),
      snapshot(updated),
      now,
    );
    await c.query("COMMIT");
    return updated;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function setFinancialAccountStatus(actor: Actor, raw: unknown) {
  const input = validate(setFinancialAccountStatusSchema.safeParse(raw));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const existing = await current(input.id);
    if (!existing) throw new ValidationError("La cuenta financiera ya no existe.");
    if (existing.isActive === input.isActive) {
      await c.query("COMMIT");
      return { account: existing, changed: false };
    }
    const now = new Date(),
      updated = { ...existing, isActive: input.isActive, updatedAt: now };
    await c.query(
      "UPDATE financial_accounts SET is_active=$1,archived_at=$2,updated_at=$2,updated_by_user_id=$3 WHERE id=$4",
      [input.isActive, input.isActive ? null : now, actor.id, input.id],
    );
    await audit(
      c,
      actor.id,
      input.isActive ? "financial_account.activated" : "financial_account.deactivated",
      input.id,
      snapshot(existing),
      snapshot(updated),
      now,
    );
    await c.query("COMMIT");
    return { account: updated, changed: true };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
