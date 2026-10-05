import type { SessionIdentity } from "@/modules/auth/contracts";
import { AuthorizationError } from "@/lib/errors";

export function canReadCash(session: Pick<SessionIdentity, "roles">) {
  return session.roles.some(
    (role) =>
      role === "ADMINISTRADOR" || role === "CAJA_SECRETARIA" || role === "CONTADORA",
  );
}
export function assertCashRead(session: Pick<SessionIdentity, "roles">) {
  if (!canReadCash(session)) throw new AuthorizationError();
}
