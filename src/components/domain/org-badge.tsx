/**
 * OrgBadge (DESIGN.md → Components, "No organization-type colours"): the organization type as icon +
 * label, with the company name when known — "Kupac · Hotel Primorje", "Administrator platforme".
 *
 * Plain text in the foreground colour, not a tinted badge: an organization type is not a status. The
 * icon is decorative; the label carries the meaning. No "use client": Server and Client Components.
 */
import { Building2, ShieldCheck, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { orgType } from "@/server/db/schema";

export type OrgType = (typeof orgType.enumValues)[number];

const ICONS = {
  buyer: Building2,
  supplier: Truck,
  platform: ShieldCheck,
} as const satisfies Record<OrgType, unknown>;

export function OrgBadge({
  type,
  name,
  className,
}: {
  type: OrgType;
  /** The company name; omitted for the platform and wherever the name is not loaded. */
  name?: string;
  className?: string;
}) {
  const t = useTranslations("orgType");
  return (
    <span
      data-slot="org-badge"
      className={cn(
        "inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground",
        className,
      )}
    >
      <Icon icon={ICONS[type]} className="text-muted-foreground" />
      <span className="truncate">
        {t(type)}
        {name ? ` · ${name}` : null}
      </span>
    </span>
  );
}
