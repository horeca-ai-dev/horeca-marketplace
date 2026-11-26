/**
 * Authorization test harness (D4-B3) — tests only, never imported by app code.
 *
 * Two jobs:
 *   1. Policy level (policy-matrix.test.ts): read the named policies out of the permission-matrix
 *      document, so the expectations come from the document and not from the code under test.
 *   2. Service level (D8-B2, D14-B1): fixed actors of every kind, and `outcomeOf()`, which turns what a
 *      domain function did into one word ("allowed", "not_found", "forbidden", …) to compare against
 *      the matrix.
 */
import type { Actor, OrgType } from "../actor";
import { DomainError } from "../errors";
import type { Outcome, Resource, Rule, Scope } from "../policy";

// ── Actors ──────────────────────────────────────────────────────────────────────────────────────
/** The five kinds of actor in the matrix: buyer / supplier × owner / member, and the platform. */
export const ACTORS = {
  buyerOwner: actor("u-buyer-owner", "org-buyer", "buyer", "owner"),
  buyerMember: actor("u-buyer-member", "org-buyer", "buyer", "member"),
  supplierOwner: actor("u-supplier-owner", "org-supplier", "supplier", "owner"),
  supplierMember: actor(
    "u-supplier-member",
    "org-supplier",
    "supplier",
    "member",
  ),
  platform: actor("u-platform", "org-platform", "platform", "owner"),
} as const satisfies Record<string, Actor>;

/** Another organization of the same type — "a foreign org (same type)" of the matrix. */
export const FOREIGN_ORG_ID: Record<OrgType, string> = {
  buyer: "org-buyer-other",
  supplier: "org-supplier-other",
  platform: "org-platform-other",
};

function actor(
  userId: string,
  orgId: string,
  orgType: OrgType,
  role: Actor["role"],
): Actor {
  return { userId, orgId, orgType, role };
}

export type ResourceKind = "none" | "own" | "foreign";

/** A resource owned by the actor's organization, by another one of the same type, or no resource at all. */
export function resourceFor(a: Actor, kind: ResourceKind): Resource {
  if (kind === "none") return undefined;
  return { orgId: kind === "own" ? a.orgId : FOREIGN_ORG_ID[a.orgType] };
}

// ── The permission-matrix document ──────────────────────────────────────────────────────────────
export type MatrixRow = {
  /** `product.create` / `.update` expands to two names. */
  actions: string[];
  /** The "Allowed" cell as written, e.g. `B\*, S\*, P`. */
  allowed: string;
};

/**
 * The rows of "### Account & organization", "### Catalogue" and "### Orders & money" in section 2 of
 * the document (the stretch tables are left out until those features are built).
 */
export function parseMatrixRows(markdown: string): MatrixRow[] {
  const start = markdown.indexOf("## 2. Named policies");
  const end = markdown.indexOf("### Stretch", start);
  if (start === -1 || end === -1) {
    throw new Error(
      'permission-matrix.md: section "## 2. Named policies" up to "### Stretch" not found',
    );
  }
  const rows: MatrixRow[] = [];
  for (const line of markdown.slice(start, end).split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const first = cells[0] ?? "";
    if (first === "Action" || first.startsWith("-")) continue; // header and separator rows
    rows.push({ actions: expandActions(first), allowed: cells[1] ?? "" });
  }
  return rows;
}

/** "`cart.view` / `.addItem`" → cart.view, cart.addItem. A name without a dot (`searchProducts`) is an alias. */
function expandActions(cell: string): string[] {
  const names: string[] = [];
  let namespace = "";
  for (const [, token = ""] of cell.matchAll(/`([^`]+)`/g)) {
    if (token.startsWith(".")) {
      names.push(namespace + token);
    } else if (token.includes(".")) {
      namespace = token.slice(0, token.indexOf("."));
      names.push(token);
    }
  }
  return names;
}

/** `B\*, S\*, P` / `Bo, So, P` / `any member` → a Rule. Anything else throws, so a new notation is noticed. */
export function parseAllowed(cell: string): Rule {
  const text = cell.replaceAll("\\", "");
  if (text === "any member") {
    return { buyer: "any", supplier: "any", platform: "any" };
  }
  const orgTypes: Record<string, OrgType> = {
    B: "buyer",
    S: "supplier",
    P: "platform",
  };
  const scopes: Record<string, Scope> = { "*": "any", o: "owner" };
  const rule: Rule = {};
  for (const entry of text.split(",").map((part) => part.trim())) {
    // "B*" = every buyer member, "Bo" = buyer owner, a bare "P" = the platform (no owner/member split).
    const orgType = orgTypes[entry.slice(0, 1)];
    const scope = entry === "P" ? "any" : scopes[entry.slice(1)];
    if (orgType === undefined || scope === undefined) {
      throw new Error(
        `permission-matrix.md: cannot read Allowed entry "${entry}" in "${cell}"`,
      );
    }
    rule[orgType] = scope;
  }
  return rule;
}

/**
 * What the response rules of the document say, written out independently of `decide()`:
 * other area → not found · foreign resource → not found (platform may cross organizations) ·
 * member doing an owner action → forbidden.
 */
export function expectedOutcome(
  rule: Rule,
  a: Actor,
  kind: ResourceKind,
): Outcome {
  const scope = rule[a.orgType];
  if (scope === undefined) return "not_found";
  if (kind === "foreign" && a.orgType !== "platform") return "not_found";
  if (scope === "owner" && a.role === "member") return "forbidden";
  return "allow";
}

// ── Service level ───────────────────────────────────────────────────────────────────────────────
export type ServiceOutcome =
  | "allowed"
  | "unauthenticated"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "validation";

const BY_CODE = {
  UNAUTHENTICATED: "unauthenticated",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  VALIDATION: "validation",
} as const satisfies Record<DomainError["code"], ServiceOutcome>;

/**
 * Runs a domain call and says how it ended. Only DomainErrors are classified; any other error is a bug
 * and is rethrown, so it fails the test instead of passing as "denied".
 */
export async function outcomeOf(fn: () => unknown): Promise<ServiceOutcome> {
  try {
    await fn();
    return "allowed";
  } catch (error) {
    if (error instanceof DomainError) return BY_CODE[error.code];
    throw error;
  }
}
