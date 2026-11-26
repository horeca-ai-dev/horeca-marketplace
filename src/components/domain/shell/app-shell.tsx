/**
 * The frame around every page of an area (/buyer, /supplier, /admin) — DESIGN.md → Layout.
 *
 *   header   wordmark · [buyer: navigation row] · who you act as · account menu
 *   sidebar  supplier and admin, from `lg`; the buyer has none (the catalogue's filter rail lives there)
 *   main     the page, max 1200 px
 *
 * Below `md` (buyer) / `lg` (supplier, admin) the navigation moves into a sheet opened from the header.
 *
 * A Server Component that reads nothing: no session, no database. Who may enter an area is decided
 * by the route guards (D5-A2) and, for every action, by the domain layer.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";
import { type Area, AREAS } from "./nav";
import { NavList } from "./nav-list";
import { OrgSlot } from "./org-slot";
import { UserMenu } from "./user-menu";

export async function AppShell({
  area,
  children,
}: {
  area: Area;
  children: ReactNode;
}) {
  const t = await getTranslations();
  const hasSidebar = area !== "buyer";
  const appName = t("app.name");

  return (
    <>
      <header className="border-b border-border bg-background">
        {/* Without a sidebar the header lines up with the centred page container below it. */}
        <div
          className={cn(
            "flex h-14 items-center gap-3 px-4 md:px-8",
            hasSidebar ? null : "mx-auto max-w-[1200px]",
          )}
        >
          <MobileNav
            area={area}
            className={hasSidebar ? "lg:hidden" : "md:hidden"}
          />
          <Link
            href={AREAS[area].home}
            aria-label={t("shell.home", { appName })}
            className="shrink-0 rounded-md text-base font-semibold text-foreground"
          >
            <span className="md:hidden">{t("app.shortName")}</span>
            <span className="hidden md:inline">{appName}</span>
          </Link>
          {hasSidebar ? null : (
            <nav
              aria-label={t("shell.mainNavigation")}
              className="ml-4 hidden md:block"
            >
              <NavList area={area} layout="row" />
            </nav>
          )}
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <OrgSlot area={area} />
            <UserMenu area={area} />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {hasSidebar ? (
          <nav
            aria-label={t("shell.mainNavigation")}
            className="hidden w-60 shrink-0 border-r border-border bg-surface p-2 lg:block"
          >
            <NavList area={area} layout="column" />
          </nav>
        ) : null}
        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
