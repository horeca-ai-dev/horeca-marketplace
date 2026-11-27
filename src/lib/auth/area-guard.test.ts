import { describe, expect, it } from "vitest";
import type { OrgType } from "@/server/domain/actor";
import { guardArea } from "./area-guard";
import type { Area } from "./destination";

const AREAS: Area[] = ["/buyer", "/supplier", "/admin"];
const HOME: Record<OrgType, Area> = {
  buyer: "/buyer",
  supplier: "/supplier",
  platform: "/admin",
};

describe("guardArea", () => {
  it.each(AREAS)("sends an anonymous visitor of %s to /login", (area) => {
    expect(guardArea({ kind: "anonymous" }, area)).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it.each(AREAS)(
    "sends a user without an organization in %s to /complete-setup",
    (area) => {
      expect(guardArea({ kind: "no-organization" }, area)).toEqual({
        kind: "redirect",
        to: "/complete-setup",
      });
    },
  );

  // Every organization type against every area: allowed only in its own area, 404 everywhere else.
  const cases = (Object.keys(HOME) as OrgType[]).flatMap((orgType) =>
    AREAS.map((area) => ({ orgType, area, own: HOME[orgType] === area })),
  );

  it.each(cases)(
    "$orgType in $area → own area: $own",
    ({ orgType, area, own }) => {
      expect(guardArea({ kind: "actor", actor: { orgType } }, area)).toEqual(
        own ? { kind: "allow" } : { kind: "not-found" },
      );
    },
  );
});
