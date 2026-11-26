/**
 * Authorization — `policy.can(actor, action, resource)` (D4-B3, CLAUDE.md rule 6).
 *
 * The permission matrix as code. `PERMISSIONS` is one row per named policy of
 * docs/decisions-9-11/permission-matrix.md §2: which organization types may do it, and whether every
 * member of such an organization or only its owner. `policy-matrix.test.ts` parses that document and
 * checks every row against `decide()`, so the table and the document cannot drift apart unnoticed.
 *
 * What lives here: organization type, role, and "is the resource ours". What does NOT: the status
 * preconditions of the matrix ("sub-order must be `confirmed`", "supplier not suspended") and field-level
 * rules ("tax ID: platform only") — those are the domain services' job and end in `Conflict` / `Forbidden`.
 *
 * Deny by default: an action that is not in the table, or an organization type that is not listed on its
 * row, means "no". Add an action only together with its row in the permission matrix.
 */
import type { Actor, OrgType } from "./actor";
import { Forbidden, NotFound } from "./errors";

/** `owner` = only the organization's owner; `any` = every member (owner included). */
export type Scope = "owner" | "any";
/** Which organization types may do the action, and with which role. A missing type means "never". */
export type Rule = Partial<Record<OrgType, Scope>>;

const everyone: Rule = { buyer: "any", supplier: "any", platform: "any" };
const buyerSide: Rule = { buyer: "any" };
const supplierSide: Rule = { supplier: "any" };
const platformOnly: Rule = { platform: "any" };

export const PERMISSIONS = {
  /** G0 check: any logged-in actor may ping. Not in the matrix — delete together with the throwaway page. */
  "g0.ping": everyone,

  // ── Account & organization
  "org.switchActive": everyone,
  "orgProfile.view": everyone,
  "orgProfile.update": { buyer: "owner", supplier: "owner", platform: "any" },
  "supplierProfile.viewBankDetails": { supplier: "owner", platform: "any" },
  "supplierProfile.updateBankDetails": { supplier: "owner" },
  "supplier.suspend": platformOnly,
  "supplier.reinstate": platformOnly,
  "supplier.setCommissionOverride": platformOnly,
  "buyerLocation.list": { buyer: "any", platform: "any" },
  "buyerLocation.create": buyerSide,
  "buyerLocation.update": buyerSide,
  "buyerLocation.archive": buyerSide,

  // ── Catalogue
  "catalogue.search": everyone,
  "product.view": everyone,
  "product.list": supplierSide,
  "product.create": supplierSide,
  "product.update": supplierSide,
  "product.setStatus": supplierSide,
  "product.moderate": platformOnly,
  "productImage.upload": supplierSide,
  "productImage.delete": supplierSide,
  "productImage.reorder": supplierSide,
  "csvImport.upload": supplierSide,
  "csvImport.confirm": supplierSide,
  "csvImport.cancel": supplierSide,
  "csvImport.view": { supplier: "any", platform: "any" },
  "category.create": platformOnly,
  "category.update": platformOnly,
  "category.deactivate": platformOnly,
  "attribute.create": platformOnly,
  "attribute.update": platformOnly,
  "attribute.deactivate": platformOnly,

  // ── Orders & money
  "cart.view": buyerSide,
  "cart.addItem": buyerSide,
  "cart.updateItem": buyerSide,
  "cart.removeItem": buyerSide,
  "checkout.placeOrder": buyerSide,
  "order.list": { buyer: "any", platform: "any" },
  "order.view": { buyer: "any", platform: "any" },
  "subOrder.list": everyone,
  "subOrder.view": everyone,
  "subOrder.confirm": supplierSide,
  "subOrder.ship": supplierSide,
  "subOrder.deliver": supplierSide,
  "subOrder.cancel": everyone,
  "invoice.download": { buyer: "any", platform: "any" },
  "ledger.view": { supplier: "owner", platform: "any" },
  "ledger.recordPayout": platformOnly,
  "ledger.recordAdjustment": platformOnly,
  "commission.report": platformOnly,
  "settings.update": platformOnly,
  "auditLog.view": platformOnly,
  "jobs.view": platformOnly,
  "jobs.retry": platformOnly,
} as const satisfies Record<string, Rule>;

export type Action = keyof typeof PERMISSIONS;

/**
 * The resource an action is about, when it has one. `orgId` = the one organization that owns it
 * (`product.supplierOrgId`); `orgIds` = every organization that may see it (a sub-order belongs to its
 * buyer and its supplier). A resource that lists no organization the actor belongs to is foreign.
 */
export type Resource =
  { orgId?: string; orgIds?: readonly string[] } | undefined;

/** The three possible answers; they map onto the response rules of the matrix (permission-matrix.md). */
export type Outcome = "allow" | "not_found" | "forbidden";

function owners(resource: Resource): readonly string[] | undefined {
  if (resource?.orgId === undefined && resource?.orgIds === undefined) {
    return undefined;
  }
  return [
    ...(resource?.orgId !== undefined ? [resource.orgId] : []),
    ...(resource?.orgIds ?? []),
  ];
}

/**
 * The decision, in the order the response rules need:
 *   1. the action is not for this organization type at all ("another area")  → not_found
 *   2. the resource belongs to another organization (platform excepted)       → not_found
 *   3. our own organization, but a member doing an owner's action             → forbidden
 * 404 comes before 403 so a foreign resource never reveals which role could have touched it.
 */
export function decide(
  actor: Actor,
  action: Action,
  resource?: Resource,
): Outcome {
  // An action that is not in the table (a cast, a typo) is denied; hasOwn keeps "constructor" etc. out.
  if (!Object.hasOwn(PERMISSIONS, action)) return "forbidden";
  const scope = (PERMISSIONS[action] as Rule)[actor.orgType];
  if (scope === undefined) return "not_found";

  const owned = owners(resource);
  if (
    owned !== undefined &&
    !owned.includes(actor.orgId) &&
    actor.orgType !== "platform"
  ) {
    return "not_found";
  }

  if (scope === "owner" && actor.role !== "owner") return "forbidden";
  return "allow";
}

export function can(
  actor: Actor,
  action: Action,
  resource?: Resource,
): boolean {
  return decide(actor, action, resource) === "allow";
}

/**
 * Throws when `decide()` says no: NotFound for another area or another organization's resource,
 * Forbidden for a role that may not. Use it AFTER the resource was loaded through RLS-scoped queries —
 * normally a foreign resource is a NotFound before it ever gets here; this is the backstop.
 */
export function assertCan(
  actor: Actor,
  action: Action,
  resource?: Resource,
): void {
  const outcome = decide(actor, action, resource);
  if (outcome === "not_found") throw new NotFound();
  if (outcome === "forbidden") throw new Forbidden();
}

export const policy = { can, assertCan, decide };
