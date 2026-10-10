import { z } from "zod";
import { ValidationError } from "@/lib/errors";

const decimal = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(value.trim()))
    return value;
  return Number(value.trim());
};

export const nonnegativeQuantity = z.preprocess(
  decimal,
  z
    .number()
    .finite()
    .nonnegative()
    .refine((value) => Number.isSafeInteger(value * 1000)),
);
export const positiveQuantity = z.preprocess(
  decimal,
  z
    .number()
    .finite()
    .positive()
    .refine((value) => Number.isSafeInteger(value * 1000)),
);

export function milliunits(value: number): number {
  const scaled = Math.round(value * 1000);
  if (!Number.isSafeInteger(scaled) || Math.abs(value * 1000 - scaled) > 1e-7)
    throw new ValidationError("La cantidad debe tener máximo tres decimales.");
  return scaled;
}

export function quantityFromDatabase(value: string): number {
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(value))
    throw new ValidationError("Cantidad de inventario inválida.");
  const amount = Number(value);
  milliunits(amount);
  return amount;
}

export function ensureUnitQuantity(unit: string, quantity: number) {
  if (unit !== "metro" && unit !== "kilogramo" && milliunits(quantity) % 1000 !== 0)
    throw new ValidationError("Esta unidad de medida requiere cantidades enteras.");
}

export function moneyForQuantity(priceMinor: number, quantity: number) {
  const total =
    (BigInt(priceMinor) * BigInt(milliunits(quantity)) + BigInt(500)) / BigInt(1000);
  const amount = Number(total);
  if (!Number.isSafeInteger(amount))
    throw new ValidationError("El importe excede el rango seguro.");
  return amount;
}
