import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const databasePath = join(
  process.cwd(),
  "data",
  `.verify-financial-accounts-${randomUUID()}.db`,
);

function removeTemporaryDatabase() {
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${databasePath}${suffix}`;
    if (existsSync(path)) {
      rmSync(path);
    }
  }
}

async function main() {
  execSync("pnpm db:migrate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databasePath, NODE_ENV: "test" },
    stdio: "pipe",
  });

  process.env.DATABASE_URL = databasePath;

  const [
    { db, sqlite },
    { auditLogs, financialAccounts, roles, userRoles, users },
    accounts,
  ] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
    import("@/modules/financial/accounts"),
  ]);

  const actorId = randomUUID();
  const roleId = randomUUID();
  const now = new Date();

  db.insert(roles)
    .values({
      id: roleId,
      key: "ADMINISTRADOR",
      displayName: "Administrador",
      description: "Rol temporal de verificación.",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(users)
    .values({
      id: actorId,
      email: "verify-financial-accounts@example.test",
      displayName: "Verificación temporal",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(userRoles)
    .values({ userId: actorId, roleId, assignedAt: now, assignedByUserId: null })
    .run();

  const actor = { id: actorId };
  const created = await accounts.createFinancialAccount(actor, {
    name: "Caja de prueba",
    kind: "CASH",
    description: "Cuenta temporal para verificar el servicio.",
    currency: "COP",
  });

  let duplicateRejected = false;
  try {
    await accounts.createFinancialAccount(actor, {
      name: "  CAJA DE PRUEBA ",
      kind: "CASH",
      currency: "COP",
    });
  } catch {
    duplicateRejected = true;
  }

  if (!duplicateRejected) {
    throw new Error("La cuenta duplicada normalizada no fue rechazada.");
  }

  await accounts.updateFinancialAccount(actor, {
    id: created.id,
    name: "Caja principal de prueba",
    description: "Descripción actualizada.",
  });
  await accounts.setFinancialAccountStatus(actor, { id: created.id, isActive: false });
  await accounts.setFinancialAccountStatus(actor, { id: created.id, isActive: true });

  const account = db
    .select({
      isActive: financialAccounts.isActive,
      description: financialAccounts.description,
    })
    .from(financialAccounts)
    .get();
  const auditCount = db.select().from(auditLogs).all().length;

  if (
    !account?.isActive ||
    account.description !== "Descripción actualizada." ||
    auditCount !== 4
  ) {
    throw new Error(
      "La operación de cuentas o su auditoría no produjo el resultado esperado.",
    );
  }

  sqlite.close();
  console.log("Servicio de cuentas financieras verificado en una base temporal.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(removeTemporaryDatabase);
