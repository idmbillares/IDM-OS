import { randomUUID } from "node:crypto";
import { DomainError } from "./errors";

/** Never log SQL, connection strings, tokens, form bodies or raw error messages. */
export function operationError(
  operation: string,
  actorId: string | undefined,
  error: unknown,
) {
  const correlationId = randomUUID();
  const poolExhausted =
    error instanceof Error && error.message.includes("EMAXCONNSESSION");
  const rawCode = poolExhausted
    ? "DB_POOL_EXHAUSTED"
    : error instanceof DomainError
      ? error.code
      : error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "UNEXPECTED";
  const code = /^[A-Z0-9_]{1,40}$/.test(rawCode) ? rawCode : "UNEXPECTED";
  console.error(
    JSON.stringify({
      operation,
      actorId: actorId ?? null,
      timestamp: new Date().toISOString(),
      code,
      correlationId,
      errorType: error instanceof Error ? error.name : "Unknown",
    }),
  );
  if (error instanceof DomainError) return error.message;
  const reason =
    code === "DB_POOL_EXHAUSTED" || code === "53300"
      ? "El almacenamiento alcanzó su límite de conexiones. Inténtalo nuevamente."
      : code === "42501"
        ? "Permisos de base de datos insuficientes para guardar la operación."
        : ["42P01", "42703"].includes(code)
          ? "La base de datos no tiene la migración requerida."
          : [
                "ECONNRESET",
                "ECONNREFUSED",
                "ETIMEDOUT",
                "ENOTFOUND",
                "53300",
                "57P01",
              ].includes(code)
            ? "No se pudo conectar con el almacenamiento persistente. Inténtalo nuevamente."
            : /^[0-9A-Z]{5}$/.test(code)
              ? "La base de datos rechazó la operación; se conservó el estado anterior."
              : ["EROFS", "EACCES", "ENOSPC"].includes(code)
                ? "El almacenamiento no permite guardar el archivo."
                : "Ocurrió un error inesperado; consulta el código de diagnóstico.";
  return `${reason} Código: ${correlationId}.`;
}
