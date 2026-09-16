import "dotenv/config";

import { resolve } from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { sqliteDb as db, sqlite } from "@/db/sqlite-backup";

try {
  migrate(db, {
    migrationsFolder: resolve(process.cwd(), "drizzle"),
  });
  sqlite.pragma("optimize");
  console.log("Migraciones aplicadas correctamente.");
} finally {
  sqlite.close();
}
