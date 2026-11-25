/** policy.can() stub (D2-B3): deny by default, foreign resources denied, platform exempt. */
import { describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { Forbidden } from "./errors";
import { assertCan, can } from "./policy";

const buyer: Actor = {
  userId: "u1",
  orgId: "org-a",
  orgType: "buyer",
  role: "member",
};
const platform: Actor = {
  userId: "u9",
  orgId: "org-p",
  orgType: "platform",
  role: "owner",
};

describe("policy.can", () => {
  it("allows g0.ping for any actor", () => {
    expect(can(buyer, "g0.ping")).toBe(true);
  });

  it("denies a resource of another organization", () => {
    expect(can(buyer, "g0.ping", { orgId: "org-b" })).toBe(false);
    expect(() => assertCan(buyer, "g0.ping", { orgId: "org-b" })).toThrow(
      Forbidden,
    );
  });

  it("allows the own organization's resource, and the platform across organizations", () => {
    expect(can(buyer, "g0.ping", { orgId: "org-a" })).toBe(true);
    expect(can(platform, "g0.ping", { orgId: "org-b" })).toBe(true);
  });
});
