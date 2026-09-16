import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";

import { pool } from "@/db/client";

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
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      [customFetch]: googleDiscoveryFetch,
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      const email = (profile?.email ?? user.email)?.trim().toLowerCase();
      if (account?.provider !== "google" || !email || profile?.email_verified !== true)
        return false;
      const systemUser = (
        await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE email=$1 AND is_active=true",
          [email],
        )
      ).rows[0];
      if (!systemUser) return false;
      const existingIdentity = (
        await pool.query<{ user_id: string }>(
          "SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_account_id=$2",
          ["google", account.providerAccountId],
        )
      ).rows[0];
      if (existingIdentity && existingIdentity.user_id !== systemUser.id) return false;
      if (!existingIdentity) {
        const now = new Date();
        await pool.query(
          "INSERT INTO auth_identities(id,user_id,provider,provider_account_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)",
          [
            crypto.randomUUID(),
            systemUser.id,
            "google",
            account.providerAccountId,
            now,
          ],
        );
      }
      return true;
    },
  },
});
