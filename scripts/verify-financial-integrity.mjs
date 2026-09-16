import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import Database from "better-sqlite3";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "idm-os-integrity-"));
const databasePath = join(temporaryDirectory, "integrity.db");
const database = new Database(databasePath);

function applyMigration(filename) {
  const migration = readFileSync(resolve("drizzle", filename), "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );

  database.exec(migration);
}

function expectConstraint(action, message) {
  assert.throws(action, Error, message);
}

try {
  database.pragma("foreign_keys = ON");

  applyMigration("0000_fine_hellfire_club.sql");
  applyMigration("0001_rare_talos.sql");
  applyMigration("0002_enforce_same_currency_transfers.sql");
  applyMigration("0003_colossal_vision.sql");

  expectConstraint(
    () =>
      database
        .prepare(
          `INSERT INTO financial_accounts
            (id, name, kind, currency, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("invalid-currency", "Cuenta inválida", "CASH", "cop", 1, 1),
    "SQLite must reject an invalid currency code.",
  );

  database
    .prepare(
      `INSERT INTO users (id, email, display_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("actor-1", "actor@example.test", "Actor temporal", 1, 1, 1);

  const brandingAssetId = "branding-asset-1";
  const brandingSha256 = "a".repeat(64);

  database
    .prepare(
      `INSERT INTO branding_assets
        (id, storage_key, sha256, mime_type, byte_size, width, height, created_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      brandingAssetId,
      `branding/${brandingSha256}.png`,
      brandingSha256,
      "image/png",
      1,
      1,
      1,
      1,
      "actor-1",
    );

  expectConstraint(
    () =>
      database
        .prepare("UPDATE branding_assets SET width = ? WHERE id = ?")
        .run(2, brandingAssetId),
    "Branding asset metadata must be immutable.",
  );

  expectConstraint(
    () =>
      database
        .prepare(
          `INSERT INTO application_branding
            (id, app_icon_asset_id, revision, created_at, updated_at, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run("invalid", brandingAssetId, 1, 1, 1, "actor-1"),
    "Application branding must remain a singleton.",
  );

  database
    .prepare(
      `INSERT INTO financial_accounts
        (id, name, kind, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "cash-1",
      "Caja temporal",
      "CASH",
      "COP",
      1,
      1,
      "bank-1",
      "Banco temporal",
      "BANK",
      "COP",
      1,
      1,
      "usd-1",
      "Cuenta temporal USD",
      "BANK",
      "USD",
      1,
      1,
    );

  expectConstraint(
    () =>
      database
        .prepare(
          `INSERT INTO financial_transactions
            (id, type, status, occurred_at, idempotency_key, created_at, updated_at, posted_at)
           VALUES (?, ?, 'POSTED', ?, ?, ?, ?, ?)`,
        )
        .run("direct-post", "INCOME", 1, "direct-post-key", 1, 1, 1),
    "SQLite must require transactions to start as drafts.",
  );

  database
    .prepare(
      `INSERT INTO financial_transactions
        (id, type, status, occurred_at, idempotency_key, created_at, updated_at)
       VALUES (?, 'TRANSFER', 'DRAFT', ?, ?, ?, ?)`,
    )
    .run("transfer-1", 1, "transfer-1-key", 1, 1);

  expectConstraint(
    () =>
      database
        .prepare(
          `INSERT INTO financial_movements
            (id, transaction_id, account_id, amount_minor, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("fractional-movement", "transfer-1", "cash-1", 1.5, 1),
    "SQLite must reject fractional monetary amounts.",
  );

  const insertMovement = database.prepare(
    `INSERT INTO financial_movements
      (id, transaction_id, account_id, amount_minor, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  insertMovement.run("transfer-1-cash", "transfer-1", "cash-1", -100, 1);
  insertMovement.run("transfer-1-bank", "transfer-1", "bank-1", 100, 1);

  database
    .prepare(
      `UPDATE financial_transactions
       SET status = 'POSTED', posted_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(2, 2, "transfer-1");

  expectConstraint(
    () =>
      database
        .prepare("UPDATE financial_movements SET amount_minor = ? WHERE id = ?")
        .run(-99, "transfer-1-cash"),
    "Posted movements must be immutable.",
  );

  database
    .prepare(
      `INSERT INTO financial_transactions
        (id, type, status, occurred_at, idempotency_key, created_at, updated_at)
       VALUES (?, 'TRANSFER', 'DRAFT', ?, ?, ?, ?)`,
    )
    .run("cross-currency-transfer", 3, "cross-currency-key", 3, 3);

  insertMovement.run(
    "cross-currency-cash",
    "cross-currency-transfer",
    "cash-1",
    -100,
    3,
  );
  insertMovement.run("cross-currency-usd", "cross-currency-transfer", "usd-1", 100, 3);

  expectConstraint(
    () =>
      database
        .prepare(
          `UPDATE financial_transactions
           SET status = 'POSTED', posted_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(3, 3, "cross-currency-transfer"),
    "Transfers must not cross currencies without an exchange model.",
  );

  database
    .prepare(
      `INSERT INTO financial_transactions
        (id, type, status, occurred_at, idempotency_key, created_at, updated_at, reversal_of_transaction_id)
       VALUES (?, 'TRANSFER', 'DRAFT', ?, ?, ?, ?, ?)`,
    )
    .run("reversal-1", 4, "reversal-1-key", 4, 4, "transfer-1");

  insertMovement.run("reversal-1-cash", "reversal-1", "cash-1", 100, 4);
  insertMovement.run("reversal-1-bank", "reversal-1", "bank-1", -100, 4);

  database
    .prepare(
      `UPDATE financial_transactions
       SET status = 'POSTED', posted_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(5, 5, "reversal-1");

  database
    .prepare(
      `UPDATE financial_transactions
       SET status = 'VOIDED', voided_at = ?, voided_by_user_id = ?, void_reason = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(6, "actor-1", "Verificación temporal", 6, "transfer-1");

  expectConstraint(
    () =>
      database
        .prepare("DELETE FROM financial_transactions WHERE id = ?")
        .run("transfer-1"),
    "Posted or voided transactions must not be deleted.",
  );

  database
    .prepare(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, occurred_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("audit-1", "verification", "financial_transaction", "transfer-1", 6, 6);

  expectConstraint(
    () => database.prepare("DELETE FROM audit_logs WHERE id = ?").run("audit-1"),
    "Audit records must be append-only.",
  );

  const triggerCount = database
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger'")
    .get().count;
  const foreignKeyViolations = database.pragma("foreign_key_check");
  const integrityCheck = database.pragma("integrity_check", { simple: true });

  assert.equal(triggerCount, 13, "Expected the integrity triggers.");
  assert.deepEqual(foreignKeyViolations, [], "Foreign keys must remain valid.");
  assert.equal(integrityCheck, "ok", "SQLite integrity_check must pass.");

  console.log("Integridad financiera de SQLite verificada en una base temporal.");
} finally {
  database.close();
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
