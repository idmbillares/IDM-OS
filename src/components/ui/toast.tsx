"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export type ToastNotice = { message: string; status: "error" | "success" };

export function Toast({
  notice,
  onDismiss,
}: {
  notice: ToastNotice | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return (
    <div
      aria-live="polite"
      className={`fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border p-4 shadow-xl ${
        notice.status === "error"
          ? "border-orange-300 bg-orange-50 text-orange-950"
          : "border-emerald-200 bg-white text-zinc-950"
      }`}
      role="status"
    >
      <p className="text-sm font-medium leading-6">{notice.message}</p>
      <button
        aria-label="Cerrar notificación"
        className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-black/5"
        onClick={onDismiss}
        type="button"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
