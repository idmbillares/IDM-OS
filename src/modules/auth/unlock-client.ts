export const tabUnlockStorageKey = "idm-os.tab-unlock-token";

let inMemoryTabUnlockToken: string | null = null;

function getSessionStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    // WebKit and privacy-focused browser configurations can deny access to
    // script-writable storage. The server still validates every unlock token;
    // this fallback only keeps the current tab usable until it is reloaded.
    return null;
  }
}

export function readTabUnlockToken() {
  try {
    return getSessionStorage()?.getItem(tabUnlockStorageKey) ?? inMemoryTabUnlockToken;
  } catch {
    return inMemoryTabUnlockToken;
  }
}

export function writeTabUnlockToken(token: string) {
  inMemoryTabUnlockToken = token;

  try {
    getSessionStorage()?.setItem(tabUnlockStorageKey, token);
  } catch {
    // The in-memory copy preserves this tab without weakening server checks.
  }
}

export function clearTabUnlockToken() {
  inMemoryTabUnlockToken = null;

  try {
    getSessionStorage()?.removeItem(tabUnlockStorageKey);
  } catch {
    // There is no persisted token to clear when storage is unavailable.
  }
}
