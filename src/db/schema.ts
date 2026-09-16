import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Role keys are application-level constants. The table remains extensible so
 * future permissions can evolve without a schema change for each new role.
 */
export const roleKeys = [
  "ADMINISTRADOR",
  "CAJA_SECRETARIA",
  "CONTADORA",
  "PRODUCCION",
] as const;

export type RoleKey = (typeof roleKeys)[number];

export const financialAccountKinds = ["CASH", "PETTY_CASH", "BANK", "OTHER"] as const;

export type FinancialAccountKind = (typeof financialAccountKinds)[number];

export const financialTransactionTypes = [
  "SALE",
  "COLLECTION",
  "INCOME",
  "EXPENSE",
  "PURCHASE",
  "PAYMENT",
  "TRANSFER",
  "ADJUSTMENT",
] as const;

export type FinancialTransactionType = (typeof financialTransactionTypes)[number];

export const financialTransactionStatuses = ["DRAFT", "POSTED", "VOIDED"] as const;

export type FinancialTransactionStatus = (typeof financialTransactionStatuses)[number];

export const brandingAssetMimeTypes = ["image/png"] as const;

export type BrandingAssetMimeType = (typeof brandingAssetMimeTypes)[number];

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    contactEmail: text("contact_email"),
    phone: text("phone"),
    displayName: text("display_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("users_email_uq").on(table.email),
    index("users_active_idx").on(table.isActive),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    key: text("key", { enum: roleKeys }).notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("roles_key_uq").on(table.key)],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
    assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_idx").on(table.roleId),
  ],
);

/**
 * Provider identities intentionally live apart from application users. This
 * lets Google OAuth be introduced later without coupling roles to a vendor.
 */
export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_account_uq").on(
      table.provider,
      table.providerAccountId,
    ),
    index("auth_identities_user_idx").on(table.userId),
  ],
);

/**
 * The personal PIN is a second factor owned by IDM OS. The secret is stored
 * only as a salted, memory-hard derived value; it is never recoverable.
 */
export const userPinCredentials = sqliteTable(
  "user_pin_credentials",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    pinHash: text("pin_hash").notNull(),
    salt: text("salt").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check(
      "user_pin_credentials_failed_attempts_non_negative",
      sql`${table.failedAttempts} >= 0`,
    ),
  ],
);

/**
 * One opaque unlock credential per browser tab. The raw value exists only in
 * sessionStorage; SQLite retains its SHA-256 digest to support server checks.
 */
export const appUnlockSessions = sqliteTable(
  "app_unlock_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("app_unlock_sessions_token_hash_uq").on(table.tokenHash),
    index("app_unlock_sessions_user_active_idx").on(table.userId, table.revokedAt),
    index("app_unlock_sessions_expiry_idx").on(table.expiresAt),
  ],
);

/**
 * Brand assets are immutable metadata for files held outside the public tree.
 * This keeps local development portable and leaves room for object storage in
 * production without coupling the rest of the application to a provider.
 */
export const brandingAssets = sqliteTable(
  "branding_assets",
  {
    id: text("id").primaryKey(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type", { enum: brandingAssetMimeTypes }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("branding_assets_storage_key_uq").on(table.storageKey),
    uniqueIndex("branding_assets_sha256_uq").on(table.sha256),
    check("branding_assets_mime_type_allowed", sql`${table.mimeType} = 'image/png'`),
    check(
      "branding_assets_byte_size_allowed",
      sql`${table.byteSize} > 0 AND ${table.byteSize} <= 524288`,
    ),
    check(
      "branding_assets_dimensions_allowed",
      sql`${table.width} > 0 AND ${table.width} <= 512 AND ${table.height} > 0 AND ${table.height} <= 512`,
    ),
    check("branding_assets_sha256_length", sql`length(${table.sha256}) = 64`),
  ],
);

/**
 * Singleton global branding configuration. It intentionally does not belong
 * to a person: an application icon affects every IDM OS user.
 */
export const applicationBranding = sqliteTable(
  "application_branding",
  {
    id: text("id").primaryKey(),
    appIconAssetId: text("app_icon_asset_id").references(() => brandingAssets.id, {
      onDelete: "restrict",
    }),
    revision: integer("revision").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("application_branding_singleton", sql`${table.id} = 'default'`),
    check("application_branding_revision_non_negative", sql`${table.revision} >= 0`),
  ],
);

/**
 * Financial accounts are metadata only. Their balances are always derived
 * from financial_movements and are never persisted on this table.
 */
export const financialAccounts = sqliteTable(
  "financial_accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: financialAccountKinds }).notNull(),
    description: text("description"),
    currency: text("currency").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "financial_accounts_kind_allowed",
      sql`${table.kind} IN ('CASH', 'PETTY_CASH', 'BANK', 'OTHER')`,
    ),
    check(
      "financial_accounts_currency_iso_code",
      sql`${table.currency} GLOB '[A-Z][A-Z][A-Z]'`,
    ),
    index("financial_accounts_active_idx").on(table.isActive),
    index("financial_accounts_kind_idx").on(table.kind),
  ],
);

/**
 * Header for an append-only financial operation. A posted record is never
 * deleted; it is later voided through a compensating operation.
 */
export const financialTransactions = sqliteTable(
  "financial_transactions",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: financialTransactionTypes }).notNull(),
    status: text("status", { enum: financialTransactionStatuses })
      .notNull()
      .default("DRAFT"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    reference: text("reference"),
    description: text("description"),
    category: text("category"),
    source: text("source").notNull().default("MANUAL"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
    voidedByUserId: text("voided_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    voidReason: text("void_reason"),
    reversalOfTransactionId: text("reversal_of_transaction_id"),
  },
  (table) => [
    foreignKey({
      name: "financial_transactions_reversal_of_fk",
      columns: [table.reversalOfTransactionId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    check(
      "financial_transactions_type_allowed",
      sql`${table.type} IN ('SALE', 'COLLECTION', 'INCOME', 'EXPENSE', 'PURCHASE', 'PAYMENT', 'TRANSFER', 'ADJUSTMENT')`,
    ),
    check(
      "financial_transactions_status_allowed",
      sql`${table.status} IN ('DRAFT', 'POSTED', 'VOIDED')`,
    ),
    check(
      "financial_transactions_lifecycle_metadata",
      sql`(
        (${table.status} = 'DRAFT' AND ${table.postedAt} IS NULL AND ${table.voidedAt} IS NULL AND ${table.voidedByUserId} IS NULL AND ${table.voidReason} IS NULL)
        OR
        (${table.status} = 'POSTED' AND ${table.postedAt} IS NOT NULL AND ${table.voidedAt} IS NULL AND ${table.voidedByUserId} IS NULL AND ${table.voidReason} IS NULL)
        OR
        (${table.status} = 'VOIDED' AND ${table.postedAt} IS NOT NULL AND ${table.voidedAt} IS NOT NULL AND ${table.voidedByUserId} IS NOT NULL AND ${table.voidReason} IS NOT NULL)
      )`,
    ),
    check(
      "financial_transactions_reversal_not_self",
      sql`${table.reversalOfTransactionId} IS NULL OR ${table.reversalOfTransactionId} <> ${table.id}`,
    ),
    uniqueIndex("financial_transactions_idempotency_uq").on(table.idempotencyKey),
    uniqueIndex("financial_transactions_reversal_of_uq").on(
      table.reversalOfTransactionId,
    ),
    index("financial_transactions_status_date_idx").on(table.status, table.occurredAt),
    index("financial_transactions_type_date_idx").on(table.type, table.occurredAt),
    index("financial_transactions_source_date_idx").on(table.source, table.occurredAt),
  ],
);

/**
 * A signed amount in the smallest monetary unit. This avoids floating-point
 * arithmetic: a positive value increases an account balance; a negative value
 * decreases it. Transfers use multiple rows under one transaction and sum to
 * zero across the affected financial accounts.
 */
export const financialMovements = sqliteTable(
  "financial_movements",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => financialTransactions.id, { onDelete: "restrict" }),
    accountId: text("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check("financial_movements_amount_non_zero", sql`${table.amountMinor} <> 0`),
    check(
      "financial_movements_amount_integer",
      sql`typeof(${table.amountMinor}) = 'integer'`,
    ),
    index("financial_movements_account_transaction_idx").on(
      table.accountId,
      table.transactionId,
    ),
    index("financial_movements_transaction_idx").on(table.transactionId),
  ],
);

/**
 * Append-only record of important actions. JSON is stored as text on SQLite so
 * the same audit shape can be migrated deliberately to PostgreSQL JSONB later.
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestId: text("request_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    metadataJson: text("metadata_json"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("audit_logs_entity_date_idx").on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
    index("audit_logs_actor_date_idx").on(table.actorUserId, table.occurredAt),
  ],
);
