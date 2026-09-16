"use client";

import { useEffect, useState } from "react";

import { tabUnlockStorageKey } from "@/modules/auth/unlock-client";

export function TabUnlockField() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToken(window.sessionStorage.getItem(tabUnlockStorageKey) ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <input name="unlockToken" type="hidden" value={token} readOnly />;
}
