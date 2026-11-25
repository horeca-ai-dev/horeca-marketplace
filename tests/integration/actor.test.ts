/**
 * loadActor() — the membership re-check of CLAUDE.md rule 3 — against a real database (D2-B3).
 * The buyer comes from the real registration (D2-B2). Registration is buyer-only (decision 012), so the
 * supplier is inserted directly here, the way the admin flow (D5-B1) will create it.
 */
import { generateId } from "@better-auth/core/utils/id";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { registerCompany } from "@/server/auth/registration";
import { closeDb } from "@/server/db/client";
import { loadActor } from "@/server/db/queries/actor";
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
    await setRlsContext(tx, {
      userId: user.id,
      orgId: organizationId,
      orgType: "supplier",
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
  it("builds the actor for a real member (buyer owner)", async () => {
    expect(await loadActor(buyer.userId, buyer.organizationId)).toEqual({
      userId: buyer.userId,
      orgId: buyer.organizationId,
      orgType: "buyer",
      role: "owner",
    });
  });

  it("reads the organization type from org_profiles (supplier)", async () => {
    expect(
      await loadActor(supplier.userId, supplier.organizationId),
    ).toMatchObject({ orgType: "supplier" });
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
