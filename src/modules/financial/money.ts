export const copFormatter = new Intl.NumberFormat("es-CO", {
  currency: "COP",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatCop(value: number) {
  return copFormatter.format(value);
}

export function parseCop(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? String(parsed) : "";
}
