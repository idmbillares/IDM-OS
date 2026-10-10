import type { SessionIdentity } from "@/modules/auth/contracts";
import { AuthorizationError } from "@/lib/errors";

export function canViewPos(session: Pick<SessionIdentity, "roles">) {
  return session.roles.some((role) =>
    ["ADMINISTRADOR", "CAJA_SECRETARIA", "CONTADORA"].includes(role),
  );
}
export function canOperatePos(session: Pick<SessionIdentity, "roles">) {
  return session.roles.some((role) =>
    ["ADMINISTRADOR", "CAJA_SECRETARIA"].includes(role),
  );
}
export function assertPosView(session: Pick<SessionIdentity, "roles">) {
  if (!canViewPos(session)) throw new AuthorizationError();
}
export function assertPosOperation(session: Pick<SessionIdentity, "roles">) {
  if (!canOperatePos(session)) throw new AuthorizationError();
}
