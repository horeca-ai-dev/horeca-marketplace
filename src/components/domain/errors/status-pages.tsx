/**
 * Not-found and forbidden pages (D4-A2). Both are calm and offer one way on: the home of the area
 * the user is in (or "/" outside an area, which sends them to their own area).
 *
 *   NotFoundPage  — every not-found.tsx; reached through notFound() (loadPage maps NotFound to it).
 *                   Another organization's resource is also "not found" — never "forbidden"
 *                   (CLAUDE.md rule 6: do not reveal that it exists).
 *   ForbiddenPage — rendered IN PLACE by a page whose loadPage() returned { ok: false }: the user's
 *                   own organization's resource, but their role may not do this.
 *
 * No "use client" and not async: usable from Server Components and from not-found.tsx alike.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AREAS, type Area } from "@/components/domain/shell/nav";
import { Button } from "@/components/ui/button";
import { ErrorPage } from "./error-page";

function homeOf(area?: Area): string {
  return area ? AREAS[area].home : "/";
}

function HomeAction({ href }: { href: string }) {
  const t = useTranslations("errors.actions");
  return (
    <Button asChild variant="primary">
      <Link href={href}>{t("home")}</Link>
    </Button>
  );
}

export function NotFoundPage({ area }: { area?: Area }) {
  const t = useTranslations();
  return (
    <ErrorPage
      title={t("errors.notFound.title")}
      message={t("errors.notFound.message")}
      action={<HomeAction href={homeOf(area)} />}
      standalone={!area}
      appName={t("app.name")}
    />
  );
}

export function ForbiddenPage({ area }: { area: Area }) {
  const t = useTranslations("errors.forbidden");
  return (
    <ErrorPage
      title={t("title")}
      message={t("message")}
      action={<HomeAction href={homeOf(area)} />}
    />
  );
}
