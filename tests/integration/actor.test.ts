/**
 * loadActor() — the membership re-check of CLAUDE.md rule 3 — against a real database (D2-B3).
 * The buyer comes from the real registration (D2-B2). Registration is buyer-only (decision 012), so the
 * supplier is inserted directly here, in the platform's RLS context, the way the admin flow (D5-B1) will create it.
 *
 * loadActorForSession() (D7-A3) — what resolveSession calls: the claimed organization when usable, otherwise
 * the user's oldest usable membership; null only for a user with no usable membership.
 */
import { generateId } from "@better-auth/core/utils/id";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { registerCompany } from "@/server/auth/registration";
import { closeDb } from "@/server/db/client";
import { loadActor, loadActorForSession } from "@/server/db/queries/actor";
import {
  member,
  organization,
  orgProfiles,
  supplierProfiles,
} from "@/server/db/schema";
import { setRlsContext, withUserTx } from "@/server/db/tx";

const run = Date.now().toString(36);
const PASSWORD = "Test-password-123";
const taxId = () => String(randomInt(10_000_000, 100_000_000));
const address = {
  addressLine: "Njegoševa 1",
  city: "Podgorica",
  postalCode: "81000",
};

async function registerBuyer(label: string) {
  const email = `actor-${label}-${run}@example.test`;
  return registerCompany({
    account: { name: "Test Buyer", email, password: PASSWORD },
    company: {
      legalName: `Actor ${label} d.o.o.`,
      taxId: taxId(),
      contactEmail: email,
      ...address,
    },
  });
}

/** Test stand-in for the admin's "create supplier" (D5-B1): user via Better Auth, rows directly. */
async function createSupplier(label: string) {
  const email = `actor-${label}-${run}@example.test`;
  const { user } = await getAuth().api.signUpEmail({
    body: { name: "Test Supplier", email, password: PASSWORD },
  });
  const organizationId = generateId();
  await withUserTx(user.id, async (tx) => {
    const now = new Date();
    await tx.insert(organization).values({
      id: organizationId,
      name: `Actor ${label} d.o.o.`,
      slug: `org-${organizationId.toLowerCase()}`,
      createdAt: now,
    });
    await tx.insert(member).values({
      id: generateId(),
      organizationId,
      userId: user.id,
      role: "owner",
      createdAt: now,
    });
    // RLS (D4-B2): only the platform inserts supplier profiles, so act as the admin does in D5-B1.
    await setRlsContext(tx, {
      userId: user.id,
      orgId: `platform-${run}`,
      orgType: "platform",
      role: "owner",
    });
    await tx.insert(orgProfiles).values({
      organizationId,
      type: "supplier",
      status: "approved",
      legalName: `Actor ${label} d.o.o.`,
      taxId: taxId(),
      contactEmail: email,
      ...address,
    });
    await tx.insert(supplierProfiles).values({ organizationId });
  });
  return { userId: user.id, organizationId };
}

let buyer: Awaited<ReturnType<typeof registerBuyer>>;
let supplier: Awaited<ReturnType<typeof createSupplier>>;

beforeAll(async () => {
  vi.stubEnv("REGISTRATION_OPEN", "true");
  buyer = await registerBuyer("buyer");
  supplier = await createSupplier("supplier");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await closeDb();
});

describe("loadActor", () => {
  it("builds the actor for a real member (buyer owner), with the company name", async () => {
    expect(await loadActor(buyer.userId, buyer.organizationId)).toEqual({
      actor: {
        userId: buyer.userId,
        orgId: buyer.organizationId,
        orgType: "buyer",
        role: "owner",
      },
      orgName: "Actor buyer d.o.o.",
    });
  });

  it("reads the organization type from org_profiles (supplier)", async () => {
    expect(
      await loadActor(supplier.userId, supplier.organizationId),
    ).toMatchObject({ actor: { orgType: "supplier" } });
  });

  it("returns null for an organization the user is not a member of", async () => {
    expect(await loadActor(buyer.userId, supplier.organizationId)).toBeNull();
  });

  it("returns null as soon as the membership is removed (a session cookie alone is not enough)", async () => {
    await withUserTx(supplier.userId, (tx) =>
      tx
        .delete(member)
        .where(
          and(
            eq(member.userId, supplier.userId),
            eq(member.organizationId, supplier.organizationId),
          ),
        ),
    );
    expect(
      await loadActor(supplier.userId, supplier.organizationId),
    ).toBeNull();
  });
});

describe("loadActorForSession", () => {
  /** Adds `userId` to an existing organization, `minutes` after (or before, when negative) now. */
  async function addMembership(
    userId: string,
    organizationId: string,
    minutes: number,
  ) {
    await withUserTx(userId, (tx) =>
      tx.insert(member).values({
        id: generateId(),
        organizationId,
        userId,
        role: "member",
        createdAt: new Date(Date.now() + minutes * 60_000),
      }),
    );
  }
  const removeMembership = (userId: string, organizationId: string) =>
    withUserTx(userId, (tx) =>
      tx
        .delete(member)
        .where(
          and(
            eq(member.userId, userId),
            eq(member.organizationId, organizationId),
          ),
        ),
    );

  /** A user with a buyer (registered: the oldest membership) and a later membership in a supplier. */
  async function multiUser(label: string) {
    const own = await registerBuyer(`${label}-buyer`);
    const second = await createSupplier(`${label}-supplier`);
    await addMembership(own.userId, second.organizationId, 1);
    return {
      userId: own.userId,
      buyerOrg: own.organizationId,
      supplierOrg: second.organizationId,
    };
  }

  it("keeps the claimed organization when the user is a member of it (no fallback)", async () => {
    const m = await multiUser("claimed");
    expect(await loadActorForSession(m.userId, m.supplierOrg)).toMatchObject({
      actor: { orgId: m.supplierOrg, orgType: "supplier", role: "member" },
    });
  });

  it("no claimed organization, but memberships → the oldest membership", async () => {
    const m = await multiUser("null");
    expect(await loadActorForSession(m.userId, null)).toMatchObject({
      actor: { orgId: m.buyerOrg, orgType: "buyer", role: "owner" },
    });
  });

  it("a claimed organization the user does not belong to → the oldest membership, never the claimed one", async () => {
    const m = await multiUser("foreign");
    for (const claimed of [buyer.organizationId, "does-not-exist-anywhere"]) {
      expect(await loadActorForSession(m.userId, claimed)).toMatchObject({
        actor: { userId: m.userId, orgId: m.buyerOrg },
      });
    }
  });

  it("a membership removed while the session still names it → the oldest remaining membership", async () => {
    const m = await multiUser("removed");
    await removeMembership(m.userId, m.supplierOrg);
    expect(await loadActorForSession(m.userId, m.supplierOrg)).toMatchObject({
      actor: { orgId: m.buyerOrg, orgType: "buyer" },
    });
  });

  it("skips an older membership that is not usable (organization without a profile)", async () => {
    const m = await multiUser("skip");
    const noProfile = generateId();
    await withUserTx(m.userId, (tx) =>
      tx.insert(organization).values({
        id: noProfile,
        name: "No profile",
        slug: `org-${noProfile.toLowerCase()}`,
        createdAt: new Date(),
      }),
    );
    await addMembership(m.userId, noProfile, -60); // older than the buyer
    expect(await loadActorForSession(m.userId, null)).toMatchObject({
      actor: { orgId: m.buyerOrg },
    });
    // … and claiming it does not help either.
    expect(await loadActorForSession(m.userId, noProfile)).toMatchObject({
      actor: { orgId: m.buyerOrg },
    });
  });

  it("a user without any membership has no organization, whatever the session claims", async () => {
    const { user } = await getAuth().api.signUpEmail({
      body: {
        name: "No Company",
        email: `actor-nocompany-${run}@example.test`,
        password: PASSWORD,
      },
    });
    expect(await loadActorForSession(user.id, null)).toBeNull();
    expect(await loadActorForSession(user.id, buyer.organizationId)).toBeNull();
  });

  it("a user whose only membership was removed has no organization", async () => {
    const only = await registerBuyer("only");
    await removeMembership(only.userId, only.organizationId);
    expect(
      await loadActorForSession(only.userId, only.organizationId),
    ).toBeNull();
    expect(await loadActorForSession(only.userId, null)).toBeNull();
  });
});
