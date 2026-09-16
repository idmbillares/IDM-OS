type StatusBadgeProps = {
  label: string;
  tone?: "orange" | "neutral";
};

export function StatusBadge({ label, tone = "orange" }: StatusBadgeProps) {
  const toneClass =
    tone === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-zinc-200 bg-zinc-100 text-zinc-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.08em] uppercase ${toneClass}`}
    >
      {label}
    </span>
  );
}
