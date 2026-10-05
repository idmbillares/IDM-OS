import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { postgresClient, postgresConfig } from "../scripts/postgres";
import { businessToday, businessDayBounds } from "../src/lib/business-time";

test(
  "Required A–G scenarios in disposable isolated PostgreSQL schema",
  { skip: process.env.IDM_RUN_POSTGRES_CASH_TESTS !== "1", timeout: 120000 },
  async () => {
    const schema = `idm_cash_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^idm_cash_test_[a-f0-9]{32}$/);
    const admin = postgresClient("POSTGRES_RUNTIME_URL");
    await admin.connect();
    let isolated: Pool | undefined,
      created = false;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await admin.query(`SET search_path TO "${schema}"`);
      await admin.query(
        readFileSync("drizzle-postgres/0000_idm_os_baseline.sql", "utf8").replaceAll(
          "SCHEMA public",
          `SCHEMA "${schema}"`,
        ),
      );
      await admin.query(
        readFileSync("drizzle-postgres/0003_cash_integrity_branding.sql", "utf8"),
      );
      isolated = new Pool({
        ...postgresConfig("POSTGRES_RUNTIME_URL"),
        options: `-c search_path=${schema}`,
      });
      globalThis.__idmOsPostgresPool = isolated;
      const ledger = await import("../src/modules/financial/ledger");
      const actor = { id: randomUUID() },
        role = randomUUID(),
        cash = randomUUID(),
        bank = randomUUID();
      await isolated.query(
        "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES($1,'isolated@invalid.test','Isolated test',now(),now())",
        [actor.id],
      );
      await isolated.query(
        "INSERT INTO roles(id,key,display_name,description,created_at,updated_at) VALUES($1,'ADMINISTRADOR','Isolated test','Isolated test',now(),now())",
        [role],
      );
      await isolated.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,now())",
        [actor.id, role],
      );
      for (const [id, name] of [
        [cash, "Isolated cash"],
        [bank, "Isolated bank"],
      ])
        await isolated.query(
          "INSERT INTO financial_accounts(id,name,kind,currency,created_at,updated_at) VALUES($1,$2,'CASH','COP',now(),now())",
          [id, name],
        );
      const date = businessToday(),
        day = businessDayBounds(date)!;
      const input = (amountMinor: number) => ({
        accountId: cash,
        amountMinor,
        occurredAt: date,
        category: "Isolated test",
        description: "Isolated test",
        idempotencyKey: randomUUID(),
      });
      async function check(expected: number[]) {
        const o = await ledger.getFinancialOverview();
        assert.deepEqual(
          [
            o.totalAvailableMinor,
            o.incomeMinor,
            o.expenseMinor,
            o.flowNetMinor,
            o.history.total,
          ],
          expected,
        );
        return o;
      }
      await check([0, 0, 0, 0, 0]); // A
      await ledger.registerIncome(actor, input(500000));
      await check([500000, 500000, 0, 500000, 1]); // B
      await ledger.registerExpense(actor, input(200000));
      await check([300000, 500000, 200000, 300000, 2]); // C
      await ledger.registerTransfer(actor, {
        originAccountId: cash,
        destinationAccountId: bank,
        amountMinor: 100000,
        occurredAt: date,
        description: "Isolated transfer",
        idempotencyKey: randomUUID(),
      });
      const transferred = await check([300000, 500000, 200000, 300000, 3]); // D
      assert.equal(
        transferred.accounts.find((a) => a.id === cash)?.balanceMinor,
        200000,
      );
      assert.equal(
        transferred.accounts.find((a) => a.id === bank)?.balanceMinor,
        100000,
      );
      assert.equal(
        (await ledger.getFinancialOverview({ dateFrom: day.start, dateTo: day.end }))
          .history.total,
        3,
      ); // E
      assert.equal(
        (
          await ledger.getFinancialOverview({
            dateTo: new Date(day.start.valueOf() - 1),
          })
        ).history.total,
        0,
      );
      await check([300000, 500000, 200000, 300000, 3]); // F: no filters
      await isolated.end();
      isolated = new Pool({
        ...postgresConfig("POSTGRES_RUNTIME_URL"),
        options: `-c search_path=${schema}`,
      });
      const reread = await isolated.query(
        "SELECT sum(m.amount_minor)::text balance FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id WHERE t.status<>'DRAFT'",
      );
      assert.equal(reread.rows[0].balance, "300000"); // G: separate connection
    } finally {
      await isolated?.end();
      if (created) {
        await admin.query("SET search_path TO public");
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.end();
    }
  },
);
