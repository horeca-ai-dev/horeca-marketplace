/**
 * "Who you are acting as" in the header (DESIGN.md principle 7).
 *
 * D4-A1 shows only the organization TYPE of the area. The company name and the organization switcher
 * come with OrgBadge / OrgSwitcher (D4-A2, D5-A2) and replace this component in the same place —
 * the name needs a database read, which the shell does not do.
 */
import { Building2, ShieldCheck, Truck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";
import { type Area, AREAS } from "./nav";

const ICONS = {
  buyer: Building2,
  supplier: Truck,
  admin: ShieldCheck,
} as const;

export async function OrgSlot({ area }: { area: Area }) {
  const t = await getTranslations();
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
      <Icon icon={ICONS[area]} className="text-muted-foreground" />
      <span className="truncate">{t(AREAS[area].orgTypeKey)}</span>
      {/* SLOT (D4-A2 / D5-A2): " · {company name}" and the organization switcher go here. */}
    </p>
  );
}
