/**
 * Authorization — `policy.can(actor, action, resource)` (D2-B3 stub, CLAUDE.md rule 6).
 *
 * The real rules come from docs/decisions-9-11/permission-matrix.md: every named policy there becomes an
 * `Action` here, with one branch in `can()` and its rows in the authorization test matrix.
 *
 * Deny by default: an action that is not listed, or a branch that does not explicitly return true,
 * means "no". Add actions only together with their tests.
 */
import type { Actor } from "./actor";
import { Forbidden } from "./errors";

export type Action =
  /** G0 check: any logged-in actor may ping. Delete together with the throwaway page. */
  "g0.ping";

/** The resource an action is about, when it has one (e.g. `{ orgId: product.supplierOrgId }`). */
export type Resource = { orgId?: string } | undefined;

export function can(
  actor: Actor,
  action: Action,
  resource?: Resource,
): boolean {
  // Another organization's resource is never allowed for a non-platform actor. (By the time policy
  // runs, RLS-scoped loading has normally turned it into a NotFound already — this is the backstop.)
  if (
    resource?.orgId !== undefined &&
    resource.orgId !== actor.orgId &&
    actor.orgType !== "platform"
  ) {
    return false;
  }
  switch (action) {
    case "g0.ping":
      return Boolean(actor.userId && actor.orgId);
    default: {
      // Compile error here = a new Action without a branch.
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/**
 * Throws Forbidden when `can()` says no. Use it AFTER the resource was loaded through RLS-scoped
 * queries: another organization's resource is already a NotFound by then (404 before 403).
 */
export function assertCan(
  actor: Actor,
  action: Action,
  resource?: Resource,
): void {
  if (!can(actor, action, resource)) throw new Forbidden();
}

export const policy = { can, assertCan };
