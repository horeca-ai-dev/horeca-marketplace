import { describe, expect, it } from "vitest";
import { ORG_TYPES } from "@/server/domain/actor";
import { areaFor, destinationFor } from "./destination";

describe("destinationFor", () => {
  it("sends each organization type to its own area", () => {
    expect(destinationFor({ kind: "actor", actor: { orgType: "buyer" } })).toBe(
      "/buyer",
    );
    expect(
      destinationFor({ kind: "actor", actor: { orgType: "supplier" } }),
    ).toBe("/supplier");
    expect(
      destinationFor({ kind: "actor", actor: { orgType: "platform" } }),
    ).toBe("/admin");
  });

  it("sends a user without an organization to company setup", () => {
    expect(destinationFor({ kind: "no-organization" })).toBe("/complete-setup");
  });

  it("sends an anonymous visitor to the login page", () => {
    expect(destinationFor({ kind: "anonymous" })).toBe("/login");
  });

  it("knows an area for every organization type that exists", () => {
    for (const orgType of ORG_TYPES) {
      expect(areaFor(orgType)).toMatch(/^\/(buyer|supplier|admin)$/);
    }
  });
});
