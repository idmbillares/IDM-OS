import "server-only";

import { auth } from "@/auth";
import { pool } from "@/db/client";

import type { AuthProvider, SessionIdentity } from "./contracts";

export class GoogleAuthProvider implements AuthProvider {
  async getSession(): Promise<SessionIdentity | null> {
    const googleSession = await auth();
    const email = googleSession?.user?.email?.trim().toLowerCase();
    if (!email) return null;
    const user = (
      await pool.query<{ id: string; email: string; display_name: string }>(
        "SELECT id,email,display_name FROM users WHERE email=$1 AND is_active=true",
        [email],
      )
    ).rows[0];
    if (!user) return null;
    const assignedRoles = (
      await pool.query<{ key: string }>(
        "SELECT r.key FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1",
        [user.id],
      )
    ).rows;
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      roles: assignedRoles.map(({ key }) => key as SessionIdentity["roles"][number]),
      source: "google",
    };
  }
}
