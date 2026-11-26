/**
 * policy.can / decide / assertCan: the behaviour around the table. The table itself, row by row against
 * the permission-matrix document, is policy-matrix.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { Forbidden, NotFound } from "./errors";
import { assertCan, can, decide, type Action } from "./policy";
import { ACTORS, FOREIGN_ORG_ID, outcomeOf } from "./testing/authz-harness";

const { buyerOwner, buyerMember, supplierOwner, supplierMember, platform } =
  ACTORS;

describe("decide", () => {
  it("answers not_found when the action belongs to another area (a buyer shipping a sub-order)", () => {
    expect(decide(buyerOwner, "subOrder.ship")).toBe("not_found");
    expect(decide(supplierOwner, "checkout.placeOrder")).toBe("not_found");
  });

  it("answers forbidden for a member doing an owner's action in their own organization", () => {
    expect(decide(supplierMember, "ledger.view")).toBe("forbidden");
    expect(decide(supplierOwner, "ledger.view")).toBe("allow");
    expect(decide(buyerMember, "orgProfile.update")).toBe("forbidden");
  });

  it("answers not_found, not forbidden, for a foreign resource — even to a member who also lacks the role", () => {
    // 404 before 403: the foreign resource must not reveal which role could have touched it.
    expect(
      decide(supplierMember, "ledger.view", {
        orgId: FOREIGN_ORG_ID.supplier,
      }),
    ).toBe("not_found");
  });

  it("lets the platform act across organizations, but only where the matrix gives it the action", () => {
    expect(
      decide(platform, "subOrder.view", { orgId: FOREIGN_ORG_ID.buyer }),
    ).toBe("allow");
    expect(
      decide(platform, "subOrder.ship", { orgId: FOREIGN_ORG_ID.supplier }),
    ).toBe("not_found");
  });

  it("handles a resource with two owners (a sub-order: its buyer and its supplier)", () => {
    const subOrder = {
      orgIds: [buyerOwner.orgId, supplierOwner.orgId],
    };
    expect(decide(buyerMember, "subOrder.view", subOrder)).toBe("allow");
    expect(decide(supplierMember, "subOrder.view", subOrder)).toBe("allow");
    const foreign = { orgIds: [FOREIGN_ORG_ID.buyer, FOREIGN_ORG_ID.supplier] };
    expect(decide(buyerMember, "subOrder.view", foreign)).toBe("not_found");
    expect(decide(supplierMember, "subOrder.view", foreign)).toBe("not_found");
  });

  it("treats a resource that lists no owner as foreign, not as 'no resource'", () => {
    expect(decide(buyerOwner, "subOrder.view", { orgIds: [] })).toBe(
      "not_found",
    );
  });

  it("denies an action that is not in the table, including inherited object keys", () => {
    for (const name of ["no.such.action", "constructor", "toString"]) {
      expect(decide(platform, name as Action)).toBe("forbidden");
    }
  });
});

describe("can / assertCan", () => {
  it("can() is true only for 'allow'", () => {
    expect(can(buyerOwner, "cart.view")).toBe(true);
    expect(can(buyerOwner, "subOrder.ship")).toBe(false);
    expect(can(supplierMember, "ledger.view")).toBe(false);
  });

  it("assertCan throws NotFound for another area and for a foreign resource", () => {
    expect(() => assertCan(buyerOwner, "subOrder.ship")).toThrow(NotFound);
    expect(() =>
      assertCan(buyerOwner, "cart.view", { orgId: FOREIGN_ORG_ID.buyer }),
    ).toThrow(NotFound);
  });

  it("assertCan throws Forbidden for a role that may not, and nothing when allowed", () => {
    expect(() => assertCan(supplierMember, "ledger.view")).toThrow(Forbidden);
    expect(() => assertCan(supplierOwner, "ledger.view")).not.toThrow();
  });

  it("allows g0.ping for any actor, and not for a foreign resource", () => {
    const anyActor: Actor = buyerMember;
    expect(can(anyActor, "g0.ping")).toBe(true);
    expect(can(anyActor, "g0.ping", { orgId: anyActor.orgId })).toBe(true);
    expect(can(anyActor, "g0.ping", { orgId: "somebody-else" })).toBe(false);
  });
});

describe("outcomeOf (the service-level harness)", () => {
  it("names how a domain call ended, and does not swallow real bugs", async () => {
    await expect(outcomeOf(() => undefined)).resolves.toBe("allowed");
    await expect(
      outcomeOf(() => assertCan(buyerOwner, "subOrder.ship")),
    ).resolves.toBe("not_found");
    await expect(
      outcomeOf(() => assertCan(supplierMember, "ledger.view")),
    ).resolves.toBe("forbidden");
    await expect(
      outcomeOf(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });
});
