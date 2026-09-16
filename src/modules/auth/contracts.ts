import type { RoleKey } from "@/db/schema";
import { AuthenticationRequiredError, AuthorizationError } from "@/lib/errors";

export type AuthSource = "development" | "google";

export type SessionIdentity = {
  id: string;
  email: string;
  displayName: string;
  roles: RoleKey[];
  source: AuthSource;
};

/**
 * Authentication providers implement this contract. UI and business services
 * depend on the contract, not on a particular OAuth vendor.
 */
export interface AuthProvider {
  getSession(): Promise<SessionIdentity | null>;
}

export async function requireSession(provider: AuthProvider) {
  const session = await provider.getSession();

  if (!session) {
    throw new AuthenticationRequiredError();
  }

  return session;
}

export async function requireRole(provider: AuthProvider, role: RoleKey) {
  const session = await requireSession(provider);

  if (!session.roles.includes(role)) {
    throw new AuthorizationError();
  }

  return session;
}
