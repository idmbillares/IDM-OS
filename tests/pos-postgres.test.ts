import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { postgresClient, postgresConfig } from "../scripts/postgres";

test(
  "POS commits stock and received cash together in an isolated schema",
  {
    skip: process.env.IDM_RUN_POSTGRES_POS_TESTS !== "1",
    timeout: 180000,
  },
  async () => {
    const schema = `idm_pos_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^idm_pos_test_[a-f0-9]{32}$/);
    const admin = postgresClient("POSTGRES_RUNTIME_URL");
    await admin.connect();
    let isolated: Pool | undefined;
    let created = false;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await admin.query(`SET search_path TO "${schema}"`);
      for (const name of [
        "0000_idm_os_baseline.sql",
        "0002_inventory_kardex.sql",
        "0003_cash_integrity_branding.sql",
        "0004_inventory_movement_guard.sql",
        "0005_pos_sales.sql",
        "0006_inventory_opening_batches.sql",
        "0007_inventory_catalog_fractional.sql",
      ]) {
        await admin.query(
          readFileSync(`drizzle-postgres/${name}`, "utf8").replaceAll(
            "SCHEMA public",
            `SCHEMA "${schema}"`,
          ),
        );
      }
      isolated = new Pool({
        ...postgresConfig("POSTGRES_RUNTIME_URL"),
        options: `-c search_path=${schema}`,
        max: 2,
      });
      globalThis.__idmOsPostgresPool = isolated;
      const inventory = await import("../src/modules/inventory/service");
      const pos = await import("../src/modules/pos/service");
      assert.equal(await pos.posSchemaReady(), true);
      const actor = { id: randomUUID() },
        other = { id: randomUUID() },
        role = randomUUID(),
        account = randomUUID();
      await isolated.query(
        "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES($1,'pos-admin@invalid.test','Admin',now(),now()),($2,'pos-other@invalid.test','Other',now(),now())",
        [actor.id, other.id],
      );
      await isolated.query(
        "INSERT INTO roles(id,key,display_name,description,created_at,updated_at) VALUES($1,'ADMINISTRADOR','Admin','Test',now(),now())",
        [role],
      );
      await isolated.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,now())",
        [actor.id, role],
      );
      await isolated.query(
        "INSERT INTO financial_accounts(id,name,kind,currency,created_at,updated_at) VALUES($1,'Cuenta aislada','CASH','COP',now(),now())",
        [account],
      );
      const productId = await inventory.createProduct(actor, {
        sku: "POS-TEST",
        name: "Tiza aislada",
        category: "Mercancía y accesorios",
        unit: "unidad",
        costMinor: 1000,
        salePriceMinor: 2000,
        minimumQuantity: 5,
      });
      const serviceId = await inventory.createProduct(actor, {
        sku: "POS-SERVICE",
        name: "Servicio aislado",
        category: "Servicios",
        unit: "unidad",
        costMinor: 0,
        salePriceMinor: 3000,
        minimumQuantity: 0,
      });
      await inventory.registerOpeningInventory(actor, {
        productId,
        quantity: 50,
        unitCostMinor: 1000,
        reason: "Apertura aislada",
        idempotencyKey: randomUUID(),
      });
      const make = (
        quantity: number,
        payments: Array<{ accountId: string; amountMinor: number }>,
        key = randomUUID(),
      ) => ({
        idempotencyKey: key,
        items: [{ productId, quantity, expectedPriceMinor: 2000, discountMinor: 0 }],
        payments,
      });
      const key = randomUUID(),
        cash = make(5, [{ accountId: account, amountMinor: 10000 }], key);
      const firstId = await pos.createSale(actor, cash);
      await assert.rejects(
        isolated.query(
          "UPDATE pos_sales SET status='VOIDED',voided_at=now(),void_reason='Sin reversos',voided_by_user_id=$1 WHERE id=$2",
          [actor.id, firstId],
        ),
        /requires stock and cash reversals/,
      );
      assert.equal(await pos.createSale(actor, cash), firstId);
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === productId)?.quantity,
        45,
      );
      assert.equal((await pos.getSale(firstId)).payments[0].amountMinor, 10000);
      const originalTransactionId = (
        await isolated.query<{ financial_transaction_id: string }>(
          "SELECT financial_transaction_id FROM pos_sale_payments WHERE sale_id=$1",
          [firstId],
        )
      ).rows[0].financial_transaction_id;
      await assert.rejects(
        isolated.query(
          "INSERT INTO pos_sale_payments(id,sale_id,account_id,financial_transaction_id,amount_minor,created_at,created_by_user_id) VALUES($1,$2,$3,$4,1,now(),$5)",
          [randomUUID(), firstId, account, originalTransactionId, actor.id],
        ),
        /does not match its posted cash movement/,
      );
      const creditId = await pos.createSale(actor, make(5, []));
      assert.equal((await pos.getSale(creditId)).payments.length, 0);
      const partialId = await pos.createSale(
        actor,
        make(5, [{ accountId: account, amountMinor: 5000 }]),
      );
      assert.equal((await pos.getSale(partialId)).totalMinor, 10000);
      const collection = {
        saleId: partialId,
        accountId: account,
        amountMinor: 5000,
        idempotencyKey: randomUUID(),
      };
      assert.equal(await pos.collectSalePayment(actor, collection), partialId);
      assert.equal(await pos.collectSalePayment(actor, collection), partialId);
      assert.equal(
        (await pos.getSale(partialId)).payments.reduce(
          (sum, payment) => sum + payment.amountMinor,
          0,
        ),
        10000,
      );
      await assert.rejects(
        () =>
          pos.collectSalePayment(actor, {
            ...collection,
            idempotencyKey: randomUUID(),
            amountMinor: 1,
          }),
        /supera el saldo pendiente/,
      );
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === productId)?.quantity,
        35,
      );
      assert.equal(
        (
          await isolated.query(
            "SELECT sum(amount_minor)::text total FROM financial_movements",
          )
        ).rows[0].total,
        "20000",
      );
      await assert.rejects(() => pos.createSale(actor, make(36, [])), /insuficiente/);
      await assert.rejects(
        () => pos.createSale(other, make(1, [])),
        /permiso|autorización|autorizado/i,
      );
      const mixedId = await pos.createSale(actor, {
        idempotencyKey: randomUUID(),
        items: [
          {
            productId: serviceId,
            quantity: 1,
            expectedPriceMinor: 3000,
            discountMinor: 0,
          },
        ],
        payments: [],
      });
      assert.equal((await pos.getSale(mixedId)).totalMinor, 3000);
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === serviceId)?.quantity,
        0,
      );
      const race = await Promise.allSettled(
        [1, 2].map(() => pos.createSale(actor, make(35, []))),
      );
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === productId)?.quantity,
        0,
      );
      await inventory.updateProduct(actor, {
        id: productId,
        sku: "POS-TEST",
        name: "Tiza aislada",
        category: "Mercancía y accesorios",
        unit: "unidad",
        costMinor: 1100,
        salePriceMinor: 2500,
        minimumQuantity: 5,
        isActive: true,
      });
      assert.equal((await pos.getSale(firstId)).items[0].unitPriceMinor, 2000);
      await pos.voidSale(actor, { saleId: firstId, reason: "Anulación aislada" });
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === productId)?.quantity,
        5,
      );
      assert.equal((await pos.getSale(firstId)).status, "VOIDED");
      assert.equal(
        (
          await isolated.query(
            "SELECT sum(amount_minor)::text total FROM financial_movements",
          )
        ).rows[0].total,
        "10000",
      );
      assert.equal(
        await pos.voidSale(actor, { saleId: firstId, reason: "Anulación aislada" }),
        firstId,
      );
      const secretaryRole = randomUUID();
      await isolated.query(
        "INSERT INTO roles(id,key,display_name,description,created_at,updated_at) VALUES($1,'CAJA_SECRETARIA','Secretaria','Test',now(),now())",
        [secretaryRole],
      );
      await isolated.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,now())",
        [other.id, secretaryRole],
      );
      const measuredId = await inventory.createProduct(actor, {
        sku: "POS-METRO",
        name: "Tela medida",
        category: "Materias primas",
        unit: "metro",
        costMinor: 1000,
        salePriceMinor: 2000,
        minimumQuantity: 0,
      });
      await inventory.registerOpeningInventory(actor, {
        productId: measuredId,
        quantity: 2,
        unitCostMinor: 1000,
        reason: "Apertura medida",
        idempotencyKey: randomUUID(),
      });
      const measuredSale = await pos.createSale(other, {
        idempotencyKey: randomUUID(),
        items: [
          {
            productId: measuredId,
            quantity: 0.125,
            expectedPriceMinor: 2000,
            discountMinor: 0,
          },
        ],
        payments: [],
      });
      assert.equal((await pos.getSale(measuredSale)).totalMinor, 250);
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === measuredId)?.quantity,
        1.875,
      );
      assert.equal(
        await pos.collectSalePayment(other, {
          saleId: measuredSale,
          accountId: account,
          amountMinor: 250,
          idempotencyKey: randomUUID(),
        }),
        measuredSale,
      );
      await assert.rejects(
        () =>
          pos.createSale(other, {
            idempotencyKey: randomUUID(),
            items: [
              {
                productId: measuredId,
                quantity: 0.125,
                expectedPriceMinor: 2000,
                discountMinor: 1,
              },
            ],
            payments: [],
          }),
        /permiso|autorización|autorizado/i,
      );
      await assert.rejects(
        () => pos.voidSale(other, { saleId: measuredSale, reason: "No autorizado" }),
        /permiso|autorización|autorizado/i,
      );
    } finally {
      await isolated?.end();
      globalThis.__idmOsPostgresPool = undefined;
      if (created) {
        await admin.query("SET search_path TO public");
        assert.match(schema, /^idm_pos_test_[a-f0-9]{32}$/);
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.end();
    }
  },
);
