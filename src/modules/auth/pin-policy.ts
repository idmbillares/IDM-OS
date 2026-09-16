export const MAX_PIN_FAILURES = 5;
export const PIN_LOCK_DURATION_MS = 15 * 60 * 1000;
export const PIN_LENGTH = 6;

export function nextPinFailureState(failedAttempts: number, now: Date) {
  const nextFailures = failedAttempts + 1;
  const locked = nextFailures >= MAX_PIN_FAILURES;

  return {
    failedAttempts: locked ? 0 : nextFailures,
    lockedUntil: locked ? new Date(now.getTime() + PIN_LOCK_DURATION_MS) : null,
  };
}
