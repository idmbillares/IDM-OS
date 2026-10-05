import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { postgresClient, postgresConfig } from "../scripts/postgres";
import { businessDayBounds, businessToday } from "../src/lib/business-time";
import {
  cashIntegrityIssuesSql,
  cashReconciliationSql,
} from "../src/modules/financial/reconciliation";

// Explicit opt-in only. Fixtures never touch public operational tables.
test(
  "Caja/PostgreSQL: isolated integration",
  { skip: process.env.IDM_RUN_POSTGRES_CASH_TESTS !== "1", timeout: 180000 },
  async (t) => {
    const schema = `idm_cash_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^idm_cash_test_[a-f0-9]{32}$/);
    const admin = postgresClient("POSTGRES_RUNTIME_URL");
    await admin.connect();
    let isolated: Pool | undefined;
    let created = false;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await admin.query(`SET search_path TO "${schema}"`);
      const baseline = readFileSync(
        "drizzle-postgres/0000_idm_os_baseline.sql",
        "utf8",
      ).replaceAll("SCHEMA public", `SCHEMA "${schema}"`);
      await admin.query(baseline);
      await admin.query(
        readFileSync("drizzle-postgres/0003_cash_integrity_branding.sql", "utf8"),
      );
      isolated = new Pool({
        ...postgresConfig("POSTGRES_RUNTIME_URL"),
        options: `-c search_path=${schema}`,
        max: 4,
      });
      globalThis.__idmOsPostgresPool = isolated;
      const ledger = await import("../src/modules/financial/ledger");
      const branding = await import("../src/modules/branding/service");
      const actor = { id: randomUUID() },
        observer = { id: randomUUID() };
      const a = randomUUID(),
        b = randomUUID(),
        otherCurrency = randomUUID(),
        role = randomUUID();
      for (const user of [actor, observer])
        await isolated.query(
          "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES($1,$2,'Isolated test',now(),now())",
          [user.id, `${user.id}@isolated.test`],
        );
      await isolated.query(
        "INSERT INTO roles(id,key,display_name,description,created_at,updated_at) VALUES($1,'ADMINISTRADOR','Test','Isolated fixture',now(),now())",
        [role],
      );
      await isolated.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,now())",
        [actor.id, role],
      );
      for (const [id, currency] of [
        [a, "COP"],
        [b, "COP"],
        [otherCurrency, "USD"],
      ])
        await isolated.query(
          "INSERT INTO financial_accounts(id,name,kind,currency,created_at,updated_at) VALUES($1,$1,'CASH',$2,now(),now())",
          [id, currency],
        );
      const date = businessToday();
      const input = (accountId = a, amountMinor = 1000) => ({
        idempotencyKey: randomUUID(),
        accountId,
        amountMinor,
        occurredAt: date,
        category: "Prueba aislada",
        description: "Fixture aislado",
        reference: "TEST-REF",
      });
      const overview = () => ledger.getFinancialOverview();
      const getBalance = async (id: string) =>
        (await overview()).accounts.find((x) => x.id === id)!.balanceMinor;
      let incomeId = "",
        expenseId = "",
        transferId = "";

      await t.test(
        "opening balance persists with actor and rejects duplicate opening",
        async () => {
          await ledger.registerOpeningBalance(actor, input(a, 500000));
          assert.equal(await getBalance(a), 500000);
          await assert.rejects(
            ledger.registerOpeningBalance(actor, input(a, 500000)),
            /saldo inicial/,
          );
          assert.equal((await overview()).recent[0].source, "OPENING_BALANCE");
        },
      );
      await t.test(
        "income posts movement, audit, balance and real history",
        async () => {
          incomeId = await ledger.registerIncome(actor, input(a, 100000));
          assert.equal(await getBalance(a), 600000);
          const result = await overview();
          assert.equal(result.history.total, 2);
          assert.equal(result.recent.length, 2);
          assert.ok(
            result.recent.some(
              (x) => x.id === incomeId && x.userName === "Isolated test",
            ),
          );
          assert.equal(
            (
              await isolated!.query(
                "SELECT count(*) FROM audit_logs WHERE entity_id=$1",
                [incomeId],
              )
            ).rows[0].count,
            "1",
          );
        },
      );
      await t.test(
        "expense posts and insufficient funds rolls back every record",
        async () => {
          expenseId = await ledger.registerExpense(actor, input(a, 50000));
          assert.equal(await getBalance(a), 550000);
          await assert.rejects(
            ledger.registerExpense(actor, input(a, 600000)),
            /Saldo insuficiente/,
          );
          assert.equal((await overview()).history.total, 3);
        },
      );
      await t.test(
        "transfer has linked legs, correct balances and no income/expense effect",
        async () => {
          const before = await overview();
          transferId = await ledger.registerTransfer(actor, {
            ...input(a, 125000),
            originAccountId: a,
            destinationAccountId: b,
          });
          const after = await overview();
          assert.equal(await getBalance(a), 425000);
          assert.equal(await getBalance(b), 125000);
          assert.equal(after.incomeMinor, before.incomeMinor);
          assert.equal(after.expenseMinor, before.expenseMinor);
          const row = after.recent.find((x) => x.id === transferId)!;
          assert.equal(row.amountMinor, 0);
          assert.equal(row.displayAmountMinor, 125000);
          assert.equal(
            (
              await isolated!.query(
                "SELECT count(*) FROM financial_movements WHERE transaction_id=$1",
                [transferId],
              )
            ).rows[0].count,
            "2",
          );
          await assert.rejects(
            ledger.registerTransfer(actor, {
              ...input(),
              originAccountId: a,
              destinationAccountId: otherCurrency,
            }),
            /moneda|COP/,
          );
        },
      );
      await t.test(
        "positive and negative adjustments remain traceable with reasons",
        async () => {
          for (const target of [450000, 440000])
            await ledger.registerBalanceAdjustment(actor, {
              idempotencyKey: randomUUID(),
              accountId: a,
              actualBalanceMinor: target,
              occurredAt: date,
              reason: "Conteo aislado",
            });
          assert.equal(await getBalance(a), 440000);
          assert.equal(
            (await ledger.getFinancialOverview({ type: "ADJUSTMENT" })).history.total,
            3,
          );
        },
      );
      await t.test(
        "history filters by type, source, account, category, text, reference and full Colombian day",
        async () => {
          assert.equal(
            (await ledger.getFinancialOverview({ type: "INCOME" })).history.total,
            1,
          );
          assert.equal(
            (await ledger.getFinancialOverview({ type: "EXPENSE" })).recent[0].id,
            expenseId,
          );
          assert.equal(
            (await ledger.getFinancialOverview({ type: "OPENING_BALANCE" })).history
              .total,
            1,
          );
          assert.equal(
            (await ledger.getFinancialOverview({ accountId: b })).recent[0].id,
            transferId,
          );
          assert.equal(
            (await ledger.getFinancialOverview({ category: "aislada" })).history.total,
            2,
          );
          assert.equal(
            (await ledger.getFinancialOverview({ search: "TEST-REF" })).history.total,
            4,
          );
          const bounds = businessDayBounds(date)!;
          assert.equal(
            (
              await ledger.getFinancialOverview({
                dateFrom: bounds.start,
                dateTo: bounds.end,
              })
            ).history.total,
            6,
          );
          const empty = await ledger.getFinancialOverview({
            search: "no such operation",
          });
          assert.equal(empty.history.total, 0);
          assert.equal(empty.history.totalAll, 6);
          assert.equal(
            (await ledger.getFinancialOverview({ page: 999 })).history.page,
            1,
          );
        },
      );
      await t.test(
        "simultaneous retries post exactly once and reject changed payload",
        async () => {
          const request = input(a, 1000);
          const ids = await Promise.all([
            ledger.registerIncome(actor, request),
            ledger.registerIncome(actor, request),
          ]);
          assert.equal(ids[0], ids[1]);
          assert.equal(await getBalance(a), 441000);
          await assert.rejects(
            ledger.registerIncome(actor, { ...request, amountMinor: 2000 }),
            /otros datos/,
          );
        },
      );
      await t.test(
        "concurrent expenses cannot spend the same available balance",
        async () => {
          const results = await Promise.allSettled([
            ledger.registerExpense(actor, input(a, 300000)),
            ledger.registerExpense(actor, input(a, 300000)),
          ]);
          assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
          assert.equal(await getBalance(a), 141000);
        },
      );
      await t.test("service authorization rejects a non-administrator", async () => {
        await assert.rejects(ledger.registerIncome(observer, input()), /permiso/);
        await assert.rejects(
          ledger.voidFinancialTransaction(observer, {
            transactionId: incomeId,
            reason: "Prueba",
          }),
          /permiso/,
        );
      });
      await t.test("failed audit rolls back the financial operation", async () => {
        await isolated!.query(
          "CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated audit failure'; END $$; CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_audit()",
        );
        const before = (await overview()).history.total;
        await assert.rejects(
          ledger.registerIncome(actor, input()),
          /isolated audit failure/,
        );
        assert.equal((await overview()).history.total, before);
        assert.equal(await getBalance(a), 141000);
        await isolated!.query(
          "DROP TRIGGER reject_test_audit ON audit_logs; DROP FUNCTION reject_test_audit()",
        );
      });
      await t.test(
        "void requires funds, compensates exactly once and preserves original",
        async () => {
          const spend = await ledger.registerExpense(actor, input(b, 125000));
          await assert.rejects(
            ledger.voidFinancialTransaction(actor, {
              transactionId: transferId,
              reason: "Prueba de reverso",
            }),
            /saldo negativo/,
          );
          await ledger.voidFinancialTransaction(actor, {
            transactionId: spend,
            reason: "Devolver gasto aislado",
          });
          const reversal = await ledger.voidFinancialTransaction(actor, {
            transactionId: transferId,
            reason: "Prueba de reverso",
          });
          assert.equal(await getBalance(a), 266000);
          assert.equal(await getBalance(b), 0);
          assert.equal(
            await ledger.voidFinancialTransaction(actor, {
              transactionId: transferId,
              reason: "Prueba de reverso",
            }),
            reversal,
          );
          await assert.rejects(
            ledger.voidFinancialTransaction(actor, {
              transactionId: reversal,
              reason: "Revertir reverso",
            }),
            /no está publicada/,
          );
          assert.equal(
            (await overview()).recent.find((x) => x.id === transferId)!.status,
            "VOIDED",
          );
        },
      );
      await t.test(
        "published movements and audits are immutable with unset migration mode",
        async () => {
          await assert.rejects(
            isolated!.query(
              "UPDATE financial_movements SET amount_minor=1 WHERE transaction_id=$1",
              [incomeId],
            ),
            /immutable/,
          );
          await assert.rejects(
            isolated!.query("DELETE FROM financial_transactions WHERE id=$1", [
              incomeId,
            ]),
            /cannot be deleted/,
          );
          await assert.rejects(
            isolated!.query("UPDATE audit_logs SET action='changed'"),
            /immutable/,
          );
        },
      );
      await t.test(
        "account balances reconcile against categorized ledger, including reversals",
        async () => {
          assert.equal((await isolated!.query(cashIntegrityIssuesSql)).rowCount, 0);
          assert.ok(
            (await isolated!.query(cashReconciliationSql)).rows.every(
              (x) => x.consistent && x.safe,
            ),
          );
        },
      );
      await t.test(
        "pagination shows real operations and clamps oversized pages",
        async () => {
          for (let i = 0; i < 26; i++) await ledger.registerIncome(actor, input(a, 1));
          const last = await ledger.getFinancialOverview({ page: 999 });
          assert.equal(last.history.page, 2);
          assert.ok(last.recent.length > 0);
          assert.equal((await overview()).recent.length, 25);
        },
      );
      await t.test(
        "logo bytes persist, are immutable and restoration retains historical assets",
        async () => {
          const bytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          );
          const file = new File([bytes], "isolated.png", { type: "image/png" });
          await assert.rejects(
            branding.changeApplicationIcon(observer, file),
            /permiso/,
          );
          await branding.changeApplicationIcon(actor, file);
          assert.deepEqual((await branding.getCurrentAppIcon())!.bytes, bytes);
          await isolated!
            .query(`CREATE FUNCTION reject_brand_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated branding audit failure'; END $$;
            CREATE TRIGGER reject_brand_audit BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.action='branding.app_icon_restored') EXECUTE FUNCTION reject_brand_audit();`);
          await assert.rejects(
            branding.restoreApplicationIcon(actor),
            /isolated branding audit failure/,
          );
          assert.deepEqual((await branding.getCurrentAppIcon())!.bytes, bytes);
          await isolated!.query(
            "DROP TRIGGER reject_brand_audit ON audit_logs; DROP FUNCTION reject_brand_audit()",
          );
          const current = await branding.getBrandingSnapshot();
          const corrupt = Buffer.from(bytes);
          corrupt[50] ^= 1;
          await assert.rejects(
            branding.changeApplicationIcon(
              actor,
              new File([corrupt], "corrupt.png", { type: "image/png" }),
            ),
            /corrupto/,
          );
          assert.deepEqual(await branding.getBrandingSnapshot(), current);
          assert.deepEqual((await branding.getCurrentAppIcon())!.bytes, bytes);
          assert.equal((await branding.getBrandingSnapshot()).hasCustomIcon, true);
          assert.equal(
            (await branding.changeApplicationIcon(actor, file)).changed,
            false,
          );
          await assert.rejects(
            isolated!.query(
              "UPDATE branding_asset_contents SET content='changed'::bytea",
            ),
            /immutable/,
          );
          await branding.restoreApplicationIcon(actor);
          assert.equal(await branding.getCurrentAppIcon(), null);
          assert.equal((await branding.getBrandingSnapshot()).hasCustomIcon, false);
          assert.equal(
            (await isolated!.query("SELECT count(*) FROM branding_asset_contents"))
              .rows[0].count,
            "1",
          );
        },
      );
    } finally {
      await isolated?.end();
      if (created) {
        await admin.query("SET search_path TO public");
        assert.match(schema, /^idm_cash_test_[a-f0-9]{32}$/);
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.end();
      globalThis.__idmOsPostgresPool = undefined;
    }
  },
);
