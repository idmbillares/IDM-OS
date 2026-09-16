import assert from "node:assert/strict";
import test from "node:test";

import {
  requireRole,
  requireSession,
  type SessionIdentity,
} from "@/modules/auth/contracts";
import { MAX_PIN_FAILURES, nextPinFailureState } from "@/modules/auth/pin-policy";

const identity: SessionIdentity = {
  id: "53db9b21-6763-40b0-86a7-f9f396017dce",
  email: "authorized@example.test",
  displayName: "Authorized User",
  roles: ["ADMINISTRADOR"],
  source: "google",
};

test("requireSession rejects an anonymous request", async () => {
  await assert.rejects(
    requireSession({ getSession: async () => null }),
    (error: unknown) =>
      error instanceof Error && error.name === "AuthenticationRequiredError",
  );
});

test("requireRole rejects an authenticated user without the required role", async () => {
  await assert.rejects(
    requireRole(
      { getSession: async () => ({ ...identity, roles: [] }) },
      "ADMINISTRADOR",
    ),
    (error: unknown) => error instanceof Error && error.name === "AuthorizationError",
  );
});

test("requireRole returns the server-side identity when the role is assigned", async () => {
  const result = await requireRole(
    { getSession: async () => identity },
    "ADMINISTRADOR",
  );
  assert.equal(result.id, identity.id);
});

test("the PIN policy locks exactly on the configured failed attempt", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const beforeLock = nextPinFailureState(MAX_PIN_FAILURES - 2, now);
  assert.equal(beforeLock.failedAttempts, MAX_PIN_FAILURES - 1);
  assert.equal(beforeLock.lockedUntil, null);

  const locked = nextPinFailureState(MAX_PIN_FAILURES - 1, now);
  assert.equal(locked.failedAttempts, 0);
  assert.equal(locked.lockedUntil?.getTime(), now.getTime() + 15 * 60 * 1000);
});
