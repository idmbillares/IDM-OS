"use client";

import { useEffect, useState } from "react";

import { readTabUnlockToken } from "@/modules/auth/unlock-client";

export function TabUnlockField() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToken(readTabUnlockToken() ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <input name="unlockToken" type="hidden" value={token} readOnly />;
}
