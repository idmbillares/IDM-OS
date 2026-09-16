import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { pool } from "@/db/client";

import type { AuthProvider, SessionIdentity } from "./contracts";

export const developmentSessionCookieName = "idm_os_development_session";
const sessionLifetimeSeconds = 60 * 60 * 8;

const optionalEnvironmentValue = (validator: z.ZodString) =>
  z
    .union([validator, z.literal("")])
    .optional()
    .transform((value) => value || undefined);

const developmentAuthSchema = z.object({
  IDM_AUTH_MODE: z.enum(["local-development", "google"]).default("local-development"),
  IDM_DEV_ACTOR_ID: optionalEnvironmentValue(z.string().uuid()),
  IDM_DEV_ACTOR_EMAIL: optionalEnvironmentValue(z.string().email()),
  IDM_DEV_SESSION_SECRET: optionalEnvironmentValue(z.string().min(32)),
});

type DevelopmentAuthConfig = z.infer<typeof developmentAuthSchema>;

type DevelopmentSessionPayload = {
  expiresAt: number;
  userId: string;
};

function getDevelopmentConfig(): DevelopmentAuthConfig | null {
  const config = developmentAuthSchema.parse(process.env);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "El adaptador de autenticación local no puede usarse en producción.",
    );
  }

  if (
    config.IDM_AUTH_MODE !== "local-development" ||
    !config.IDM_DEV_ACTOR_ID ||
    !config.IDM_DEV_ACTOR_EMAIL ||
    !config.IDM_DEV_SESSION_SECRET
  ) {
    return null;
  }

  return config;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionValue(payload: DevelopmentSessionPayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function readSessionValue(value: string | undefined, secret: string) {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature, ...remainder] = value.split(".");

  if (!encodedPayload || !signature || remainder.length > 0) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);

  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const payload = z
      .object({ expiresAt: z.number().int().positive(), userId: z.string().uuid() })
      .parse(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")));

    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function findConfiguredDevelopmentUser(config: DevelopmentAuthConfig) {
  if (!config.IDM_DEV_ACTOR_ID || !config.IDM_DEV_ACTOR_EMAIL) {
    return null;
  }

  const user = (
    await pool.query<{ id: string; email: string; display_name: string }>(
      "SELECT id,email,display_name FROM users WHERE id=$1 AND email=$2 AND is_active=true",
      [config.IDM_DEV_ACTOR_ID, config.IDM_DEV_ACTOR_EMAIL],
    )
  ).rows[0];

  if (!user) {
    return null;
  }

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
    source: "development" as const,
  };
}

export async function getLocalDevelopmentLoginIdentity() {
  const config = getDevelopmentConfig();
  return config ? findConfiguredDevelopmentUser(config) : null;
}

export async function createLocalDevelopmentSession() {
  const config = getDevelopmentConfig();
  const user = config ? await findConfiguredDevelopmentUser(config) : null;

  if (!config || !user) {
    return null;
  }

  const expiresAt = Date.now() + sessionLifetimeSeconds * 1000;

  return {
    cookie: {
      expires: new Date(expiresAt),
      httpOnly: true,
      maxAge: sessionLifetimeSeconds,
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      value: createSessionValue(
        { expiresAt, userId: user.id },
        config.IDM_DEV_SESSION_SECRET!,
      ),
    },
    user,
  };
}

export class DevelopmentAuthProvider implements AuthProvider {
  async getSession(): Promise<SessionIdentity | null> {
    const config = getDevelopmentConfig();

    if (!config) {
      return null;
    }

    const cookieStore = await cookies();
    const payload = readSessionValue(
      cookieStore.get(developmentSessionCookieName)?.value,
      config.IDM_DEV_SESSION_SECRET!,
    );

    if (!payload || payload.userId !== config.IDM_DEV_ACTOR_ID) {
      return null;
    }

    return findConfiguredDevelopmentUser(config);
  }
}
