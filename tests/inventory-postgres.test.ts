import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Pool } from "pg";
import { postgresClient, postgresConfig } from "../scripts/postgres";

test(
  "Inventory movements remain atomic and idempotent in an isolated PostgreSQL schema",
  { skip: process.env.IDM_RUN_POSTGRES_INVENTORY_TESTS !== "1", timeout: 120000 },
  async () => {
    const schema = `idm_inventory_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^idm_inventory_test_[a-f0-9]{32}$/);
    const admin = postgresClient("POSTGRES_RUNTIME_URL");
    await admin.connect();
    let isolated: Pool | undefined;
    let created = false;
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
        readFileSync("drizzle-postgres/0002_inventory_kardex.sql", "utf8"),
      );
      await admin.query(
        readFileSync("drizzle-postgres/0004_inventory_movement_guard.sql", "utf8"),
      );
      await admin.query(
        readFileSync("drizzle-postgres/0006_inventory_opening_batches.sql", "utf8"),
      );
      isolated = new Pool({
        ...postgresConfig("POSTGRES_RUNTIME_URL"),
        options: `-c search_path=${schema}`,
        max: 2,
      });
      globalThis.__idmOsPostgresPool = isolated;
      const inventory = await import("../src/modules/inventory/service");
      const batches = await import("../src/modules/inventory/opening-batches");
      assert.equal(await batches.openingBatchSchemaReady(), true);
      const actor = { id: randomUUID() };
      const unauthorized = { id: randomUUID() };
      const role = randomUUID();
      await isolated.query(
        "INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES($1,'admin@invalid.test','Admin',now(),now()),($2,'other@invalid.test','Other',now(),now())",
        [actor.id, unauthorized.id],
      );
      await isolated.query(
        "INSERT INTO roles(id,key,display_name,description,created_at,updated_at) VALUES($1,'ADMINISTRADOR','Admin','Test',now(),now())",
        [role],
      );
      await isolated.query(
        "INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES($1,$2,now())",
        [actor.id, role],
      );
      const productId = await inventory.createProduct(actor, {
        sku: "TEST-1",
        name: "Producto aislado",
        category: "Mercancía y accesorios",
        unit: "unidad",
        costMinor: 1000,
        salePriceMinor: 2000,
        minimumQuantity: 5,
      });
      const base = {
        productId,
        reason: "Prueba aislada",
        idempotencyKey: randomUUID(),
      };
      assert.equal(
        await inventory.registerOpeningInventory(actor, {
          ...base,
          quantity: 50,
          unitCostMinor: 1000,
        }),
        await inventory.registerOpeningInventory(actor, {
          ...base,
          quantity: 50,
          unitCostMinor: 1000,
        }),
      );
      await assert.rejects(
        () =>
          inventory.registerOpeningInventory(actor, {
            ...base,
            idempotencyKey: randomUUID(),
            quantity: 50,
            unitCostMinor: 1000,
          }),
        /primer movimiento/,
      );
      await inventory.registerInventoryMovement(actor, {
        ...base,
        kind: "ENTRY",
        idempotencyKey: randomUUID(),
        quantity: 10,
        unitCostMinor: 1100,
      });
      await inventory.registerInventoryMovement(actor, {
        ...base,
        kind: "EXIT",
        idempotencyKey: randomUUID(),
        quantity: 5,
      });
      await inventory.registerInventoryMovement(actor, {
        ...base,
        kind: "EXIT",
        idempotencyKey: randomUUID(),
        quantity: 10,
        reason: "Consumo en producción",
      });
      assert.equal((await inventory.listInventory())[0].quantity, 45);
      await inventory.updateProduct(actor, {
        id: productId,
        sku: "TEST-1",
        name: "Producto aislado",
        category: "Mercancía y accesorios",
        unit: "unidad",
        costMinor: 1200,
        salePriceMinor: 2500,
        minimumQuantity: 5,
        isActive: true,
      });
      assert.equal((await inventory.listInventory())[0].salePriceMinor, 2500);
      assert.equal(
        (
          await isolated.query(
            "SELECT unit_cost_minor::text FROM inventory_movements WHERE type='OPENING_BALANCE'",
          )
        ).rows[0].unit_cost_minor,
        "1000",
      );
      await assert.rejects(
        isolated.query(
          "INSERT INTO inventory_movements(id,product_id,type,quantity,previous_quantity,next_quantity,unit_cost_minor,reason,idempotency_key,created_at,created_by_user_id) VALUES($1,$2,'ENTRY',1,0,1,1000,'Invalid direct write',$3,now(),$4)",
          [randomUUID(), productId, randomUUID(), actor.id],
        ),
        /does not match current stock/,
      );
      assert.equal(
        (await isolated.query("SELECT count(*) FROM financial_movements")).rows[0]
          .count,
        "0",
      );
      const legacyId = randomUUID();
      await isolated.query(
        "INSERT INTO inventory_products(id,sku,name,category,unit,cost_minor,sale_price_minor,minimum_quantity,created_at,updated_at,created_by_user_id,updated_by_user_id) VALUES($1,'LEGACY-1','Producto heredado','Articulo','Unidad',0,0,0,now(),now(),$2,$2)",
        [legacyId, actor.id],
      );
      await inventory.updateProduct(actor, {
        id: legacyId,
        sku: "LEGACY-1",
        name: "Producto heredado actualizado",
        category: "Articulo",
        unit: "Unidad",
        costMinor: 0,
        salePriceMinor: 0,
        minimumQuantity: 0,
        isActive: true,
      });
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === legacyId)?.unit,
        "Unidad",
      );
      await assert.rejects(
        () =>
          inventory.registerInventoryMovement(actor, {
            ...base,
            kind: "EXIT",
            idempotencyKey: randomUUID(),
            quantity: 46,
          }),
        /negativas/,
      );
      await assert.rejects(
        () =>
          inventory.registerInventoryMovement(unauthorized, {
            ...base,
            kind: "ADJUSTMENT",
            idempotencyKey: randomUUID(),
            expectedQuantity: 45,
            physicalQuantity: 44,
          }),
        /permiso|autorización|autorizado/i,
      );
      await inventory.registerInventoryMovement(actor, {
        ...base,
        kind: "ADJUSTMENT",
        idempotencyKey: randomUUID(),
        expectedQuantity: 45,
        physicalQuantity: 44,
      });
      assert.equal((await inventory.listInventory())[0].quantity, 44);
      const race = await Promise.allSettled(
        [1, 2].map(() =>
          inventory.registerInventoryMovement(actor, {
            ...base,
            kind: "EXIT",
            idempotencyKey: randomUUID(),
            quantity: 44,
          }),
        ),
      );
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal((await inventory.listInventory())[0].quantity, 0);
      assert.equal(
        (await isolated.query("SELECT count(*) FROM inventory_movements")).rows[0]
          .count,
        "6",
      );
      assert.equal(
        (await isolated.query("SELECT count(*) FROM financial_transactions")).rows[0]
          .count,
        "0",
      );
      const secondProductId = await inventory.createProduct(actor, {
        sku: "BATCH-TEST",
        name: "Producto en borrador",
        category: "Materias primas",
        unit: "unidad",
        costMinor: 0,
        salePriceMinor: 0,
        minimumQuantity: 0,
      });
      const batchId = randomUUID();
      const draft = {
        batchId,
        reference: "Conteo de papel",
        notes: "Captura aislada",
        items: [
          {
            productId: secondProductId,
            quantity: 50,
            unitCostMinor: 700,
            salePriceMinor: 1500,
          },
        ],
      };
      assert.equal(await batches.saveOpeningBatch(actor, draft), batchId);
      assert.equal((await batches.getOpeningBatch(batchId)).status, "DRAFT");
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === secondProductId)
          ?.quantity,
        0,
      );
      assert.equal(await batches.confirmOpeningBatch(actor, { batchId }), batchId);
      assert.equal(await batches.confirmOpeningBatch(actor, { batchId }), batchId);
      await assert.rejects(
        isolated.query(
          "UPDATE inventory_opening_batch_items SET quantity=1 WHERE batch_id=$1",
          [batchId],
        ),
        /immutable/,
      );
      assert.equal(
        (await inventory.listInventory()).find((p) => p.id === secondProductId)
          ?.quantity,
        50,
      );
      await assert.rejects(() => batches.saveOpeningBatch(actor, draft), /confirmada/);
      assert.equal(
        (await isolated.query("SELECT count(*) FROM financial_movements")).rows[0]
          .count,
        "0",
      );
    } finally {
      await isolated?.end();
      globalThis.__idmOsPostgresPool = undefined;
      if (created) {
        await admin.query("SET search_path TO public");
        assert.match(schema, /^idm_inventory_test_[a-f0-9]{32}$/);
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.end();
    }
  },
);
