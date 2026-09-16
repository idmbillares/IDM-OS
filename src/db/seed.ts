import "dotenv/config";

import { randomUUID } from "node:crypto";

import { sqliteDb as db, sqlite } from "@/db/sqlite-backup";
import { roleKeys, roles, type RoleKey } from "@/db/schema";

const roleDefinitions: Record<RoleKey, { displayName: string; description: string }> = {
  ADMINISTRADOR: {
    displayName: "Administrador",
    description: "Administra la configuración y la evolución del sistema.",
  },
  CAJA_SECRETARIA: {
    displayName: "Caja / Secretaría",
    description: "Opera procesos de caja y apoyo administrativo autorizados.",
  },
  CONTADORA: {
    displayName: "Contadora",
    description: "Consulta y procesa información contable autorizada.",
  },
  PRODUCCION: {
    displayName: "Producción",
    description: "Opera procesos de producción autorizados.",
  },
};

try {
  const now = new Date();

  for (const key of roleKeys) {
    const role = roleDefinitions[key];

    db.insert(roles)
      .values({
        id: randomUUID(),
        key,
        displayName: role.displayName,
        description: role.description,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  console.log("Roles base verificados correctamente.");
} finally {
  sqlite.close();
}
