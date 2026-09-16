import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";

const databasePath = join(
  process.cwd(),
  "data",
  `.verify-app-security-${randomUUID()}.db`,
);
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
  const [{ db, sqlite }, { auditLogs, userPinCredentials, users }, security] =
    await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("@/modules/auth/app-security"),
    ]);
  const actor = { id: randomUUID() };
  const now = new Date();
  db.insert(users)
    .values({
      ...actor,
      email: "security@example.test",
      displayName: "Seguridad temporal",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const setupToken = await security.configurePersonalPin(actor, {
    pin: "123456",
    confirmation: "123456",
  });
  assert.equal(security.hasPersonalPin(actor.id), true);
  assert.doesNotThrow(() => security.requireUnlockedSession(actor, setupToken));
  assert.throws(() => security.requireUnlockedSession(actor, "missing-tab-token"));
  security.lockPersonalSession(actor, setupToken);
  assert.throws(() => security.requireUnlockedSession(actor, setupToken));

  await assert.rejects(() => security.unlockWithPersonalPin(actor, "999999"));
  const unlockedToken = await security.unlockWithPersonalPin(actor, "123456");
  assert.doesNotThrow(() => security.requireUnlockedSession(actor, unlockedToken));
  security.revokeAllPersonalSessions(actor, "auth.logout");
  assert.throws(() => security.requireUnlockedSession(actor, unlockedToken));
  assert.equal(
    db
      .select({ userId: userPinCredentials.userId })
      .from(userPinCredentials)
      .where(eq(userPinCredentials.userId, actor.id))
      .get()?.userId,
    actor.id,
  );
  assert.ok(
    db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, actor.id))
      .all()
      .some((item) => item.action === "auth.pin_configured"),
  );
  sqlite.close();
  console.log(
    "PIN, bloqueo por pestaña y revocación de sesión verificados en una base temporal.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
