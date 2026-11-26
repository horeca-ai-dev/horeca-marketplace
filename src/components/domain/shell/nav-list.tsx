"use client";

/**
 * The links of one area. A Client Component only because the current page comes from usePathname();
 * the active link gets aria-current="page" (screen readers) plus a tint, green text and semibold
 * (sighted users — not colour alone).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { type Area, AREAS, isActive } from "./nav";

const LINK =
  "flex h-(--control-h) items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-well aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-primary";

type NavListProps = {
  area: Area;
  /** `row`: the buyer's header row (no icons). `column`: sidebar and mobile sheet. */
  layout: "row" | "column";
  /** Called after a link is followed — the mobile sheet closes itself with it. */
  onNavigate?: () => void;
};

export function NavList({ area, layout, onNavigate }: NavListProps) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <ul
      className={cn(
        "flex gap-1",
        layout === "row" ? "items-center" : "flex-col",
      )}
    >
      {AREAS[area].nav.map((entry) => (
        <li key={entry.href}>
          <Link
            href={entry.href}
            aria-current={
              isActive(area, entry.href, pathname) ? "page" : undefined
            }
            onClick={onNavigate}
            className={LINK}
          >
            {layout === "column" ? <Icon icon={entry.icon} /> : null}
            {t(entry.labelKey)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
