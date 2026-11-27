/**
 * Who may enter an area (/buyer, /supplier, /admin) — D5-A2. One pure function, so the rule is
 * tested once; the layouts carry it out through requireArea() (src/server/auth/guard.ts).
 *
 *   not logged in                     → /login
 *   logged in without an organization → /complete-setup
 *   organization of another type      → 404 (CLAUDE.md rule 6: a wrong area answers 404, not 403)
 *   organization of the area's type   → allow
 *
 * This only decides which shell a user sees. Every page and action still authorizes through
 * resolveActor() and the domain policy.
 */
import { type Area, areaFor, type SessionSummary } from "./destination";

export type GuardDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: "/login" | "/complete-setup" }
  | { kind: "not-found" };

export function guardArea(state: SessionSummary, area: Area): GuardDecision {
  if (state.kind === "anonymous") return { kind: "redirect", to: "/login" };
  if (state.kind === "no-organization") {
    return { kind: "redirect", to: "/complete-setup" };
  }
  return areaFor(state.actor.orgType) === area
    ? { kind: "allow" }
    : { kind: "not-found" };
}
