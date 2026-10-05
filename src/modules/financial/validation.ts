import { z } from "zod";

import { financialAccountKinds, financialTransactionTypes } from "@/db/schema";
import { businessDateToInstant } from "@/lib/business-time";

const uuid = z.string().uuid();
const amountMinor = z
  .number()
  .int()
  .safe()
  .refine((amount) => amount !== 0, "El movimiento no puede ser cero.");

const integerInput = (value: unknown) =>
  typeof value === "string" && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;

const positiveAmountMinor = z.preprocess(
  integerInput,
  z
    .number()
    .int("El valor debe ser un número entero de pesos.")
    .positive("El valor debe ser mayor que cero.")
    .safe(),
);

const optionalText = z.string().trim().max(500).optional();
const businessDate = z.preprocess(
  (value) => (typeof value === "string" ? businessDateToInstant(value) : value),
  z.date(),
);

const financialEntryBaseSchema = z.object({
  idempotencyKey: uuid,
  accountId: uuid,
  amountMinor: positiveAmountMinor,
  category: z.string().trim().min(2, "Indica una categoría.").max(120),
  description: z.string().trim().min(2, "Indica una descripción.").max(500),
  occurredAt: businessDate,
  reference: optionalText,
});

export const createOpeningBalanceSchema = financialEntryBaseSchema
  .pick({
    accountId: true,
    idempotencyKey: true,
    amountMinor: true,
    occurredAt: true,
    reference: true,
  })
  .extend({
    description: z.string().trim().max(500).optional(),
  });

export const createIncomeSchema = financialEntryBaseSchema;
export const createExpenseSchema = financialEntryBaseSchema;

export const createTransferSchema = z
  .object({
    idempotencyKey: uuid,
    destinationAccountId: uuid,
    description: z.string().trim().min(2, "Indica una descripción.").max(500),
    occurredAt: businessDate,
    originAccountId: uuid,
    amountMinor: positiveAmountMinor,
    reference: optionalText,
  })
  .refine((value) => value.originAccountId !== value.destinationAccountId, {
    message: "La cuenta origen y destino deben ser diferentes.",
    path: ["destinationAccountId"],
  });

export const voidFinancialTransactionSchema = z.object({
  transactionId: uuid,
  reason: z
    .string()
    .trim()
    .min(3, "Indica un motivo de anulación.")
    .max(500, "El motivo de anulación no puede superar 500 caracteres."),
});

export const createBalanceAdjustmentSchema = z.object({
  idempotencyKey: uuid,
  accountId: uuid,
  actualBalanceMinor: z.preprocess(
    integerInput,
    z
      .number()
      .int("El saldo real debe ser un número entero de pesos.")
      .min(0, "El saldo real no puede ser negativo.")
      .safe(),
  ),
  occurredAt: businessDate,
  reason: z.string().trim().min(3, "Indica un motivo para el ajuste.").max(500),
  reference: optionalText,
});

export const createFinancialAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financialAccountKinds),
  description: z.string().trim().max(500).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
});

export const updateFinancialAccountSchema = z.object({
  id: uuid,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

export const setFinancialAccountStatusSchema = z.object({
  id: uuid,
  isActive: z.boolean(),
});

export const recordFinancialTransactionSchema = z
  .object({
    type: z.enum(financialTransactionTypes),
    occurredAt: z.coerce.date(),
    reference: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid(),
    movements: z
      .array(
        z.object({
          accountId: uuid,
          amountMinor,
        }),
      )
      .min(1),
  })
  .superRefine((transaction, context) => {
    if (transaction.type !== "TRANSFER") {
      return;
    }

    const total = transaction.movements.reduce(
      (sum, movement) => sum + movement.amountMinor,
      0,
    );

    const [origin, destination] = transaction.movements;

    if (
      transaction.movements.length !== 2 ||
      total !== 0 ||
      origin.accountId === destination.accountId
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Una transferencia debe tener dos cuentas distintas y exactamente dos movimientos que se compensen entre sí.",
        path: ["movements"],
      });
    }
  });

export type CreateFinancialAccountInput = z.infer<typeof createFinancialAccountSchema>;
export type UpdateFinancialAccountInput = z.infer<typeof updateFinancialAccountSchema>;
export type RecordFinancialTransactionInput = z.infer<
  typeof recordFinancialTransactionSchema
>;

export const financialHistoryFiltersSchema = z
  .object({
    accountId: uuid.optional(),
    category: z.string().trim().max(120).optional(),
    dateFrom: z.date().optional(),
    dateTo: z.date().optional(),
    page: z.number().int().positive().max(1_000_000).optional(),
    search: z.string().trim().max(500).optional(),
    type: z
      .enum(["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT", "OPENING_BALANCE"])
      .optional(),
  })
  .refine(
    (f) => !f.dateFrom || !f.dateTo || f.dateFrom <= f.dateTo,
    "La fecha desde debe ser anterior a la fecha hasta.",
  );
