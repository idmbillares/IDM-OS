import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";

const databasePath = join(process.cwd(), "data", `.verify-ledger-${randomUUID()}.db`);
const cleanup = () =>
  ["", "-wal", "-shm"].forEach((suffix) => {
    const path = `${databasePath}${suffix}`;
    if (existsSync(path)) rmSync(path);
  });

async function main() {
  execSync("pnpm db:migrate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databasePath, NODE_ENV: "test" },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = databasePath;
  const [
    { db, sqlite },
    { auditLogs, financialTransactions, roles, userRoles, users },
    accounts,
    ledger,
    money,
    authContracts,
    businessTime,
  ] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
    import("@/modules/financial/accounts"),
    import("@/modules/financial/ledger"),
    import("@/modules/financial/money"),
    import("@/modules/auth/contracts"),
    import("@/lib/business-time"),
  ]);
  const actor = { id: randomUUID() };
  const now = new Date();
  const roleId = randomUUID();
  db.insert(roles)
    .values({
      id: roleId,
      key: "ADMINISTRADOR",
      displayName: "Administrador",
      description: "Temporal",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(users)
    .values({
      ...actor,
      email: "ledger@example.test",
      displayName: "Temporal",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(userRoles)
    .values({ userId: actor.id, roleId, assignedAt: now, assignedByUserId: null })
    .run();
  const bank = await accounts.createFinancialAccount(actor, {
    name: "Banco temporal",
    kind: "BANK",
    currency: "COP",
  });
  const cash = await accounts.createFinancialAccount(actor, {
    name: "Caja temporal",
    kind: "CASH",
    currency: "COP",
  });
  const empty = await accounts.createFinancialAccount(actor, {
    name: "Cuenta vacía temporal",
    kind: "CASH",
    currency: "COP",
  });
  const date = "2026-09-15";
  await ledger.registerOpeningBalance(actor, {
    accountId: bank.id,
    amountMinor: 2_000_000,
    occurredAt: date,
  });
  await ledger.registerOpeningBalance(actor, {
    accountId: cash.id,
    amountMinor: 500_000,
    occurredAt: date,
  });
  await ledger.registerTransfer(actor, {
    originAccountId: bank.id,
    destinationAccountId: cash.id,
    amountMinor: 1_000_000,
    description: "Traslado",
    occurredAt: date,
  });
  const incomeId = await ledger.registerIncome(actor, {
    accountId: cash.id,
    amountMinor: 1_000_000,
    category: "Venta",
    description: "Ingreso",
    occurredAt: date,
  });
  await ledger.registerExpense(actor, {
    accountId: cash.id,
    amountMinor: 250_000,
    category: "Materiales",
    description: "Egreso",
    occurredAt: date,
  });
  const overview = ledger.getFinancialOverview();
  const balances = Object.fromEntries(
    overview.accounts.map((account) => [account.id, account.balanceMinor]),
  );
  if (
    balances[bank.id] !== 1_000_000 ||
    balances[cash.id] !== 2_250_000 ||
    overview.totalAvailableMinor !== 3_250_000 ||
    overview.incomeMinor !== 1_000_000 ||
    overview.expenseMinor !== 250_000
  )
    throw new Error("Los cálculos financieros no coinciden con el ledger.");
  assert.equal(money.parseCop("$ 1.500.000"), "1500000");
  assert.equal(money.formatCop(1_500_000), "$ 1.500.000");
  assert.equal(
    businessTime.businessToday(new Date("2026-09-16T01:00:00.000Z")),
    "2026-09-15",
    "La fecha operativa debe permanecer en Colombia cuando UTC ya cambió de día.",
  );
  const filtered = ledger.getFinancialOverview({
    accountId: cash.id,
    category: "Venta",
    dateFrom: new Date("2026-09-01T00:00:00"),
    dateTo: new Date("2026-09-30T23:59:59"),
    search: "Ingreso",
    type: "INCOME",
  });
  assert.equal(
    filtered.history.total,
    1,
    "Los filtros del historial deben combinarse.",
  );
  await assert.rejects(
    authContracts.requireRole(
      {
        getSession: async () => ({
          ...actor,
          email: "other@example.test",
          displayName: "Otro",
          roles: [],
          source: "development",
        }),
      },
      "ADMINISTRADOR",
    ),
    "Un usuario sin rol no puede ejecutar acciones de Caja.",
  );
  for (const invalid of [
    () =>
      ledger.registerExpense(actor, {
        accountId: empty.id,
        amountMinor: 300_000,
        category: "Servicios",
        description: "No debe permitir saldo negativo",
        occurredAt: date,
      }),
    () =>
      ledger.registerExpense(actor, {
        accountId: cash.id,
        amountMinor: 3_000_000,
        category: "Servicios",
        description: "Mayor al saldo disponible",
        occurredAt: date,
      }),
    () =>
      ledger.registerTransfer(actor, {
        originAccountId: cash.id,
        destinationAccountId: bank.id,
        amountMinor: 3_000_000,
        description: "Transferencia sin fondos",
        occurredAt: date,
      }),
    () =>
      ledger.registerIncome(actor, {
        accountId: cash.id,
        amountMinor: 0,
        category: "Venta",
        description: "x",
        occurredAt: date,
      }),
    () =>
      ledger.registerExpense(actor, {
        accountId: cash.id,
        amountMinor: -1,
        category: "Venta",
        description: "x",
        occurredAt: date,
      }),
    () =>
      ledger.registerTransfer(actor, {
        originAccountId: cash.id,
        destinationAccountId: cash.id,
        amountMinor: 1,
        description: "x",
        occurredAt: date,
      }),
  ]) {
    let rejected = false;
    try {
      await invalid();
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Una validación financiera inválida fue aceptada.");
  }
  assert.equal(
    ledger.getFinancialOverview().accounts.find((account) => account.id === empty.id)
      ?.balanceMinor,
    0,
    "Un egreso rechazado no puede modificar el saldo de una cuenta sin fondos.",
  );
  await ledger.voidFinancialTransaction(actor, {
    transactionId: incomeId,
    reason: "Registro de prueba incorrecto",
  });
  const voided = db
    .select({
      status: financialTransactions.status,
      reason: financialTransactions.voidReason,
    })
    .from(financialTransactions)
    .where(eq(financialTransactions.id, incomeId))
    .get();
  assert.equal(voided?.status, "VOIDED");
  assert.equal(voided?.reason, "Registro de prueba incorrecto");
  const afterVoid = ledger.getFinancialOverview({ search: "Ingreso" });
  const afterVoidBalances = Object.fromEntries(
    afterVoid.accounts.map((account) => [account.id, account.balanceMinor]),
  );
  assert.equal(afterVoidBalances[cash.id], 1_250_000);
  assert.equal(afterVoid.incomeMinor, 0);
  assert.equal(afterVoid.history.total, 1);
  await ledger.registerBalanceAdjustment(actor, {
    accountId: cash.id,
    actualBalanceMinor: 1_300_000,
    occurredAt: date,
    reason: "Conteo positivo temporal",
  });
  assert.equal(
    ledger.getFinancialOverview().accounts.find((account) => account.id === cash.id)
      ?.balanceMinor,
    1_300_000,
    "El ajuste positivo debe conciliar el saldo real.",
  );
  await ledger.registerBalanceAdjustment(actor, {
    accountId: cash.id,
    actualBalanceMinor: 1_270_000,
    occurredAt: date,
    reason: "Conteo negativo temporal",
  });
  assert.equal(
    ledger.getFinancialOverview().accounts.find((account) => account.id === cash.id)
      ?.balanceMinor,
    1_270_000,
    "El ajuste negativo debe conciliar el saldo real sin volverla negativa.",
  );
  const audit = db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(eq(auditLogs.action, "financial_transaction.voided"))
    .get();
  assert.ok(audit, "La anulación debe quedar en auditoría.");
  sqlite.close();
  console.log(
    "Ledger: ingresos, egresos, transferencias, saldos y validaciones verificados.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
