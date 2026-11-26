/**
 * The permission matrix, checked row by row (D4-B3).
 *
 * The expectations are read out of docs/decisions-9-11/permission-matrix.md §2 — not from policy.ts —
 * so editing only one of the two (a new row, a changed "Allowed" cell, a new action in the code) fails
 * here. For every action × the five kinds of actor × (no resource / own / foreign resource) the answer of
 * `decide()` must be the one the response rules of the document give.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS, decide, type Action } from "./policy";
import {
  ACTORS,
  expectedOutcome,
  parseAllowed,
  parseMatrixRows,
  resourceFor,
  type ResourceKind,
} from "./testing/authz-harness";

const document = readFileSync(
  new URL("../../../docs/decisions-9-11/permission-matrix.md", import.meta.url),
  "utf8",
);
const rows = parseMatrixRows(document);
const documented = new Map(
  rows.flatMap((row) => row.actions.map((name) => [name, row.allowed])),
);

/** Rows of the document that are deliberately NOT in `PERMISSIONS`, each with the reason. */
const NOT_IN_CODE: Record<string, string> = {
  "org.register":
    "no organization exists yet at registration — the auth layer's job (registration.ts), not policy.can",
  "supplier.approve":
    "decision 012: the admin creates suppliers as `approved`; the approval queue is gone",
  "supplier.reject": "decision 012: the approval queue is gone",
  "supplier.reapply": "decision 012: re-apply after rejection is gone",
};

/** In `PERMISSIONS` but not in the document. */
const NOT_IN_DOCUMENT = ["g0.ping"];

const KINDS: ResourceKind[] = ["none", "own", "foreign"];
const checked = [...documented].filter(([name]) => !(name in NOT_IN_CODE));

describe("permission matrix: document ↔ code", () => {
  it("finds the policies of the document (the parser did not silently read nothing)", () => {
    expect(documented.size).toBeGreaterThan(40);
  });

  it("every documented policy is in PERMISSIONS, unless listed in NOT_IN_CODE with a reason", () => {
    const missing = [...documented.keys()].filter(
      (name) => !(name in NOT_IN_CODE) && !Object.hasOwn(PERMISSIONS, name),
    );
    expect(missing).toEqual([]);
  });

  it("every action in PERMISSIONS is documented, unless listed in NOT_IN_DOCUMENT", () => {
    const undocumented = Object.keys(PERMISSIONS).filter(
      (name) => !documented.has(name) && !NOT_IN_DOCUMENT.includes(name),
    );
    expect(undocumented).toEqual([]);
  });

  it("the exceptions are real: NOT_IN_CODE rows still exist in the document and are absent from the code", () => {
    for (const name of Object.keys(NOT_IN_CODE)) {
      expect(documented.has(name), `${name} is no longer in the document`).toBe(
        true,
      );
      expect(Object.hasOwn(PERMISSIONS, name), `${name} is in the code`).toBe(
        false,
      );
    }
  });
});

describe("permission matrix: every action × actor × resource", () => {
  it.each(checked)("%s", (name, allowedCell) => {
    const rule = parseAllowed(allowedCell);
    // The table row itself says what the document says…
    expect(PERMISSIONS[name as Action]).toEqual(rule);
    // …and the decision is the document's response rule for each actor and resource.
    for (const [who, actor] of Object.entries(ACTORS)) {
      for (const kind of KINDS) {
        expect(
          decide(actor, name as Action, resourceFor(actor, kind)),
          `${name} as ${who} on a ${kind} resource`,
        ).toBe(expectedOutcome(rule, actor, kind));
      }
    }
  });
});
