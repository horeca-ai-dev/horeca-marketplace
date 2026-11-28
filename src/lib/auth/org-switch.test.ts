import { describe, expect, it, vi } from "vitest";
import { type SwitchableOrganization, switchOrganization } from "./org-switch";

const BUYER = "org-buyer";
const SUPPLIER = "org-supplier";
const PLATFORM = "org-platform";

/** Acting for the supplier — NOT the oldest membership, the case where a refusal matters most. */
const organizations: SwitchableOrganization[] = [
  { organizationId: BUYER, type: "buyer", active: false },
  { organizationId: SUPPLIER, type: "supplier", active: true },
  { organizationId: PLATFORM, type: "platform", active: false },
];

/** A fake Better Auth: accepts exactly the listed organizations; records every call. */
function gateway(accepted: string[]) {
  return vi.fn(async (organizationId: string) =>
    accepted.includes(organizationId),
  );
}

describe("switchOrganization", () => {
  it("success: one request, then the chosen organization's area", async () => {
    const setActive = gateway([BUYER, SUPPLIER, PLATFORM]);
    expect(
      await switchOrganization({ organizations, targetId: BUYER, setActive }),
    ).toEqual({ kind: "switched", to: "/buyer" });
    expect(setActive.mock.calls).toEqual([[BUYER]]);
  });

  it("the area follows the chosen organization's type", async () => {
    const setActive = gateway([PLATFORM]);
    expect(
      await switchOrganization({
        organizations,
        targetId: PLATFORM,
        setActive,
      }),
    ).toEqual({ kind: "switched", to: "/admin" });
  });

  it("same organization: nothing is sent", async () => {
    const setActive = gateway([BUYER, SUPPLIER, PLATFORM]);
    expect(
      await switchOrganization({
        organizations,
        targetId: SUPPLIER,
        setActive,
      }),
    ).toEqual({ kind: "same" });
    expect(setActive).not.toHaveBeenCalled();
  });

  it("refusal: the previously active organization is selected again", async () => {
    const setActive = gateway([SUPPLIER]); // the buyer membership is gone
    expect(
      await switchOrganization({ organizations, targetId: BUYER, setActive }),
    ).toEqual({ kind: "refused", restored: true });
    expect(setActive.mock.calls).toEqual([[BUYER], [SUPPLIER]]);
  });

  it("refusal and the restore fails too: restored is false (the caller reloads)", async () => {
    const setActive = gateway([]);
    expect(
      await switchOrganization({ organizations, targetId: BUYER, setActive }),
    ).toEqual({ kind: "refused", restored: false });
    expect(setActive.mock.calls).toEqual([[BUYER], [SUPPLIER]]);
  });

  it("a request that throws (network) counts as a refusal, and is restored the same way", async () => {
    const setActive = vi
      .fn<(organizationId: string) => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(true);
    expect(
      await switchOrganization({ organizations, targetId: BUYER, setActive }),
    ).toEqual({ kind: "refused", restored: true });

    const offline = vi
      .fn<(organizationId: string) => Promise<boolean>>()
      .mockRejectedValue(new Error("offline"));
    expect(
      await switchOrganization({
        organizations,
        targetId: BUYER,
        setActive: offline,
      }),
    ).toEqual({ kind: "refused", restored: false });
  });

  it("an organization that is not in the user's list is never sent", async () => {
    const setActive = gateway([BUYER, SUPPLIER, PLATFORM]);
    expect(
      await switchOrganization({
        organizations,
        targetId: "somebody-elses-organization",
        setActive,
      }),
    ).toEqual({ kind: "refused", restored: true });
    expect(setActive).not.toHaveBeenCalled();
  });

  it("a refusal with no active organization in the list cannot be restored", async () => {
    const setActive = gateway([]);
    expect(
      await switchOrganization({
        organizations: organizations.map((o) => ({ ...o, active: false })),
        targetId: BUYER,
        setActive,
      }),
    ).toEqual({ kind: "refused", restored: false });
    expect(setActive.mock.calls).toEqual([[BUYER]]);
  });
});
