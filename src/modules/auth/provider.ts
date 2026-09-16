import "server-only";

import type { AuthProvider } from "./contracts";
import { DevelopmentAuthProvider } from "./development-auth";
import { GoogleAuthProvider } from "./google-auth";

/**
 * Single composition point for authentication. Replacing this factory with a
 * Google provider later does not require changing business services.
 */
export function getAuthProvider(): AuthProvider {
  const mode = process.env.IDM_AUTH_MODE ?? "local-development";

  if (mode === "local-development") {
    return new DevelopmentAuthProvider();
  }

  if (mode === "google") return new GoogleAuthProvider();

  throw new Error("El modo de autenticación no es válido.");
}
