/**
 * Where a user belongs after login or registration (D4-A3) — one pure function, so the rule is
 * tested once and every page uses the same answer.
 *
 *   buyer → /buyer · supplier → /supplier · platform → /admin
 *   logged in without an organization → /complete-setup
 *   not logged in → /login
 *
 * The state always comes from resolveSession() on the server; the browser never decides the area.
 */
import type { OrgType } from "@/server/domain/actor";

export type Area = "/buyer" | "/supplier" | "/admin";
export type Destination = Area | "/complete-setup" | "/login";

/** The part of resolveSession()'s answer this decision needs. */
export type SessionSummary =
  | { kind: "anonymous" }
  | { kind: "no-organization" }
  | { kind: "actor"; actor: { orgType: OrgType } };

const AREA_BY_ORG_TYPE: Record<OrgType, Area> = {
  buyer: "/buyer",
  supplier: "/supplier",
  platform: "/admin",
};

export function areaFor(orgType: OrgType): Area {
  return AREA_BY_ORG_TYPE[orgType];
}

export function destinationFor(state: SessionSummary): Destination {
  if (state.kind === "anonymous") return "/login";
  if (state.kind === "no-organization") return "/complete-setup";
  return areaFor(state.actor.orgType);
}
