/** The operational calendar for IDM OS, independent from server/browser UTC. */
export const BUSINESS_TIME_ZONE = "America/Bogota";

function parts(date: Date) {
  const values = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(values.map((part) => [part.type, part.value]));
}

function offsetMinutes(date: Date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = value?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error("No fue posible resolver la zona horaria de negocio.");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export function businessToday(date = new Date()) {
  const value = parts(date);
  return `${value.year}-${value.month}-${value.day}`;
}

/** Interprets an ISO calendar date as a business day in America/Bogota. */
export function businessDateToInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date("invalid");
  const [year, month, day] = value.split("-").map(Number);
  const midnightUtc = new Date(Date.UTC(year, month - 1, day));
  if (
    midnightUtc.getUTCFullYear() !== year ||
    midnightUtc.getUTCMonth() !== month - 1 ||
    midnightUtc.getUTCDate() !== day
  )
    return new Date("invalid");
  return new Date(midnightUtc.valueOf() - offsetMinutes(midnightUtc) * 60_000);
}

export function businessDayBounds(value: string) {
  const start = businessDateToInstant(value);
  if (Number.isNaN(start.valueOf())) return null;
  const end = businessDateToInstant(nextBusinessDay(value));
  return { end: new Date(end.valueOf() - 1), start };
}

function nextBusinessDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const nextParts = parts(next);
  return `${nextParts.year}-${nextParts.month}-${nextParts.day}`;
}

export function businessMonthBounds(date = new Date()) {
  const value = parts(date);
  const year = Number(value.year);
  const month = Number(value.month);
  const start = businessDateToInstant(`${value.year}-${value.month}-01`);
  const nextMonth = new Date(Date.UTC(year, month, 1, 12));
  const nextParts = parts(nextMonth);
  const end = businessDateToInstant(`${nextParts.year}-${nextParts.month}-01`);
  return { end: new Date(end.valueOf() - 1), start };
}

export function formatBusinessDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(value);
}

export function formatBusinessDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(value);
}
