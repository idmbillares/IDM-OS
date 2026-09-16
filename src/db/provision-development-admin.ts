import "dotenv/config";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { sqliteDb as db, sqlite } from "@/db/sqlite-backup";
import { roles, userRoles, users } from "@/db/schema";

const configSchema = z.object({
  IDM_AUTH_MODE: z.literal("local-development"),
  IDM_DEV_ACTOR_ID: z.string().uuid(),
  IDM_DEV_ACTOR_EMAIL: z.string().email(),
  IDM_DEV_ACTOR_NAME: z.string().trim().min(2).max(120),
});

function fail(message: string): never {
  throw new Error(`No fue posible aprovisionar el administrador local: ${message}`);
}

try {
  if (process.env.NODE_ENV === "production") {
    fail("este comando nunca puede ejecutarse con NODE_ENV=production.");
  }

  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    fail(
      "configura IDM_AUTH_MODE=local-development, IDM_DEV_ACTOR_ID, IDM_DEV_ACTOR_EMAIL e IDM_DEV_ACTOR_NAME en .env.",
    );
  }

  const config = parsed.data;
  const administratorRole = db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "ADMINISTRADOR"))
    .get();

  if (!administratorRole) {
    fail("primero ejecuta pnpm db:seed para verificar los roles base.");
  }

  const userWithId = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, config.IDM_DEV_ACTOR_ID))
    .get();

  const userWithEmail = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, config.IDM_DEV_ACTOR_EMAIL))
    .get();

  if (userWithId && userWithId.email !== config.IDM_DEV_ACTOR_EMAIL) {
    fail("el ID local ya pertenece a un correo diferente.");
  }

  if (userWithEmail && userWithEmail.id !== config.IDM_DEV_ACTOR_ID) {
    fail("el correo ya pertenece a otro usuario local.");
  }

  const existingUser = userWithId;

  const now = new Date();

  db.transaction((tx) => {
    if (existingUser) {
      tx.update(users)
        .set({
          displayName: config.IDM_DEV_ACTOR_NAME,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(users.id, existingUser.id))
        .run();
    } else {
      tx.insert(users)
        .values({
          id: config.IDM_DEV_ACTOR_ID,
          email: config.IDM_DEV_ACTOR_EMAIL,
          displayName: config.IDM_DEV_ACTOR_NAME,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    tx.insert(userRoles)
      .values({
        userId: config.IDM_DEV_ACTOR_ID,
        roleId: administratorRole.id,
        assignedAt: now,
        assignedByUserId: null,
      })
      .onConflictDoNothing()
      .run();
  });

  console.log(
    `Administrador local ${existingUser ? "verificado" : "creado"} correctamente para ${config.IDM_DEV_ACTOR_EMAIL}.`,
  );
} finally {
  sqlite.close();
}
