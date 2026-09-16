import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

export const runtime = "nodejs";
export const POST = handlers.POST;

export function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Auth.js starts OAuth sign-in with a CSRF-protected POST. A bookmark or
  // stale link to the provider-specific GET endpoint is not a valid sign-in
  // attempt; return the user to the application login screen instead of
  // exposing Auth.js' generic Configuration page.
  if (url.pathname === "/api/auth/signin/google") {
    return new Response(null, { status: 302, headers: { Location: "/acceso" } });
  }

  return handlers.GET(request);
}
