/**
 * The organization switcher's decision (D7-A3) — one pure function, so the rule is tested once and
 * the component (shell/org-switcher.tsx) only carries the answer out.
 *
 *   the organization already acted for → "same": nothing is sent
 *   Better Auth accepts the switch     → "switched": the caller LOADS that organization's area
 *   the switch fails (refused, or the request itself failed) → "refused"
 *
 * Why "refused" needs care: Better Auth 1.7.20 CLEARS the session's organization before it answers
 * 403 (tests/integration/org-switch.test.ts). The server then acts for the user's oldest usable
 * membership (loadActorForSession) — which need not be the organization this page still shows. So
 * after any failure we select the previously active organization again:
 *
 *   restored: true   the session is back on the organization the page shows; show the error
 *   restored: false  it is not — the caller must load "/" so the server renders the truth
 *
 * Only an organization from the server's own list (listMyOrganizations) is ever sent; an id that is
 * not in it is refused here, without a request (the session was not touched: restored is true).
 */
import type { OrgType } from "@/server/domain/actor";
import { type Area, areaFor } from "./destination";

/** The part of listMyOrganizations' answer this decision needs. */
export type SwitchableOrganization = {
  organizationId: string;
  type: OrgType;
  active: boolean;
};

export type SwitchOutcome =
  | { kind: "same" }
  | { kind: "switched"; to: Area }
  | { kind: "refused"; restored: boolean };

export async function switchOrganization({
  organizations,
  targetId,
  setActive,
}: {
  organizations: readonly SwitchableOrganization[];
  targetId: string;
  /** Asks Better Auth to switch; true when it accepted. May throw (network): counted as a failure. */
  setActive: (organizationId: string) => Promise<boolean>;
}): Promise<SwitchOutcome> {
  const target = organizations.find((o) => o.organizationId === targetId);
  if (!target) return { kind: "refused", restored: true };
  if (target.active) return { kind: "same" };

  const attempt = (organizationId: string) =>
    setActive(organizationId).catch(() => false);

  if (await attempt(target.organizationId)) {
    return { kind: "switched", to: areaFor(target.type) };
  }
  const previous = organizations.find((o) => o.active);
  return {
    kind: "refused",
    restored: previous ? await attempt(previous.organizationId) : false,
  };
}
