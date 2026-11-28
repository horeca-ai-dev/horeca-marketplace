/**
 * "Who you are acting as" in the header (DESIGN.md principle 7): OrgBadge with the organization type
 * of the area and the company name — "Kupac · Hotel Primorje". The platform shows its type only.
 *
 * A user with two or more organizations gets the same badge as the trigger of the organization
 * switcher (D7-A3); with one organization there is nothing to switch and no menu.
 *
 * Name and list come from the area layout (requireShell → resolveSession, listMyOrganizations), so
 * the shell itself reads nothing.
 */
import { OrgBadge, type OrgType } from "@/components/domain/org-badge";
import type { MyOrganization } from "@/server/domain/my-organizations";
import type { Area } from "./nav";
import { OrgSwitcher } from "./org-switcher";

const ORG_TYPE = {
  buyer: "buyer",
  supplier: "supplier",
  admin: "platform",
} as const satisfies Record<Area, OrgType>;

export function OrgSlot({
  area,
  orgName,
  organizations,
}: {
  area: Area;
  orgName: string;
  organizations: MyOrganization[];
}) {
  if (organizations.length >= 2) {
    return <OrgSwitcher organizations={organizations} />;
  }
  return (
    <OrgBadge
      type={ORG_TYPE[area]}
      name={area === "admin" ? undefined : orgName}
    />
  );
}
