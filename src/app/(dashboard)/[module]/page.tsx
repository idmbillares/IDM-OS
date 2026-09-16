import { notFound } from "next/navigation";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";
import { getPlaceholderModule, placeholderModules } from "@/lib/navigation";

type ModulePageProps = {
  params: Promise<{ module: string }>;
};

export function generateStaticParams() {
  return placeholderModules
    .filter(({ slug }) => slug !== "configuracion")
    .map(({ slug }) => ({ module: slug }));
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { module: slug } = await params;
  const section = getPlaceholderModule(slug);

  if (!section) {
    notFound();
  }

  return <ModulePlaceholder module={section} />;
}
