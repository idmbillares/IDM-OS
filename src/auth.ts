import "server-only";

import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";

import { pool } from "@/db/client";
import { requireCanonicalAuthUrl, requireServerEnvironment } from "@/lib/server-env";

requireCanonicalAuthUrl();
const googleClientId = requireServerEnvironment("GOOGLE_CLIENT_ID");
const googleClientSecret = requireServerEnvironment("GOOGLE_CLIENT_SECRET");
const authSecret = requireServerEnvironment("AUTH_SECRET");

const googleDiscoveryFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const url = input instanceof Request ? input.url : input.toString();

  if (url !== "https://accounts.google.com/.well-known/openid-configuration")
    return response;

  const metadata = (await response.clone().json()) as Record<string, unknown>;
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  // Google advertises support for the RFC 9207 `iss` callback parameter but does
  // not return it in the authorization response. Keep OIDC discovery and token
  // validation intact while preventing Auth.js from requiring that absent value.
  return new Response(
    JSON.stringify({
      ...metadata,
      authorization_response_iss_parameter_supported: false,
    }),
    { headers, status: response.status, statusText: response.statusText },
  );
};

export const { auth, handlers, signIn, signOut } = NextAuth({
  // Vercel forwards the canonical request host to this Route Handler. Do not
  // rely on platform-specific environment inference for this security check.
  trustHost: true,
  // Keep the production signing key explicit instead of relying on automatic
  // environment alias resolution at runtime.
  secret: authSecret,
  session: {
    maxAge: 8 * 60 * 60,
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      [customFetch]: googleDiscoveryFetch,
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      const email = (profile?.email ?? user.email)?.trim().toLowerCase();
      if (
        account?.provider !== "google" ||
        !account.providerAccountId ||
        !email ||
        profile?.email_verified !== true
      )
        return false;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const systemUser = (
          await client.query<{ id: string }>(
            "SELECT id FROM users WHERE email=$1 AND is_active=true FOR SHARE",
            [email],
          )
        ).rows[0];
        if (!systemUser) {
          await client.query("ROLLBACK");
          return false;
        }

        const now = new Date();
        await client.query(
          "INSERT INTO auth_identities(id,user_id,provider,provider_account_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT (provider,provider_account_id) DO NOTHING",
          [
            crypto.randomUUID(),
            systemUser.id,
            "google",
            account.providerAccountId,
            now,
          ],
        );

        const identity = (
          await client.query<{ user_id: string }>(
            "SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_account_id=$2 FOR UPDATE",
            ["google", account.providerAccountId],
          )
        ).rows[0];
        if (identity?.user_id !== systemUser.id) {
          await client.query("ROLLBACK");
          return false;
        }

        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  },
});
