/**
 * "Who you are acting as" in the header (DESIGN.md principle 7): OrgBadge with the organization type
 * of the area and the company name — "Kupac · Hotel Primorje". The platform shows its type only.
 *
 * The name comes from the area layout (requireArea → resolveSession), so the shell itself reads
 * nothing. The organization switcher is postponed by decision to D7-A3 — not because nobody has two
 * organizations (the seed's multi@demo.local is buyer + supplier), but because listing a user's
 * organizations needs new domain / RLS code first (B's listMyOrganizations).
 */
import { OrgBadge, type OrgType } from "@/components/domain/org-badge";
import type { Area } from "./nav";

const ORG_TYPE = {
  buyer: "buyer",
  supplier: "supplier",
  admin: "platform",
} as const satisfies Record<Area, OrgType>;

export function OrgSlot({ area, orgName }: { area: Area; orgName: string }) {
  return (
    <OrgBadge
      type={ORG_TYPE[area]}
      name={area === "admin" ? undefined : orgName}
    />
  );
}
