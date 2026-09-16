/** Read/maintenance access to the retained SQLite recovery copy only. */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { resolve } from "node:path";
import * as schema from "./schema";
const file = resolve(
  process.cwd(),
  (process.env.DATABASE_URL ?? "./data/idm-os.db").replace(/^file:/, ""),
);
export const sqlite = new Database(file);
sqlite.pragma("foreign_keys = ON");
export const sqliteDb = drizzle(sqlite, { schema });
