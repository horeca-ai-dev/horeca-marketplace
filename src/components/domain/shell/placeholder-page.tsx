/**
 * Stand-in for a screen that is not built yet, so the shell and its navigation can be judged in the
 * browser (D4-A1). It shows the page header of the navigation entry at `path`; any other path is a
 * 404. Each real page replaces its placeholder; when the last one lands, this file and the
 * `[...slug]` routes are deleted.
 */
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type Area, AREAS } from "./nav";
import { PageHeader } from "./page-header";

export async function PlaceholderPage({
  area,
  path,
}: {
  area: Area;
  path: string;
}) {
  const entry = AREAS[area].nav.find((e) => e.href === path);
  if (!entry) notFound();
  const t = await getTranslations();
  return (
    <PageHeader
      title={t(entry.labelKey)}
      description={t("placeholder.description")}
    />
  );
}
