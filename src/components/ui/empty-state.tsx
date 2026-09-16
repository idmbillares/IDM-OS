import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center sm:px-10">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-white text-orange-700 shadow-sm ring-1 ring-zinc-200">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-base leading-7 text-zinc-600">
        {description}
      </p>
    </div>
  );
}
