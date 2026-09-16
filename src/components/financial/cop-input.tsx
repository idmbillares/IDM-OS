"use client";

import { useId, useState } from "react";
import { formatCop, parseCop } from "@/modules/financial/money";

export { formatCop, parseCop } from "@/modules/financial/money";

export function CopInput({
  id,
  name = "amountMinor",
  onValueChange,
  required = true,
}: {
  id?: string;
  name?: string;
  onValueChange?: (value: number) => void;
  required?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [minor, setMinor] = useState("");

  return (
    <div>
      <input name={name} type="hidden" value={minor} />
      <label className="block text-sm font-semibold text-zinc-800" htmlFor={inputId}>
        Valor (COP)
      </label>
      <input
        aria-describedby={`${inputId}-help`}
        className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base font-semibold text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
        id={inputId}
        inputMode="numeric"
        onChange={(event) => {
          const next = parseCop(event.target.value);
          setMinor(next);
          onValueChange?.(next ? Number(next) : 0);
        }}
        placeholder="$ 0"
        required={required}
        type="text"
        value={minor ? formatCop(Number(minor)) : ""}
      />
      <p className="mt-1 text-xs text-zinc-500" id={`${inputId}-help`}>
        Sin decimales. Escribe o pega el valor; por ejemplo, 1500000.
      </p>
    </div>
  );
}
