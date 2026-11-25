/**
 * The seed against a real, migrated database (D3-B1): what it creates, that every demo user can really
 * sign in with the seed password, that a second run changes nothing, that it works with registration
 * closed, and that production refuses a missing password before touching anything.
 */
import { randomBytes } from "node:crypto";
import { count, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@/env.core";
import { getAuth } from "@/server/auth/auth";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { DEMO_ORGS, demoUsers } from "@/server/db/seed/demo-data";
import { ensureDemoUser } from "@/server/db/seed/demo";
import { runSeed } from "@/server/db/seed/run";

const {
  user,
  session,
  organization,
  member,
  orgProfiles,
  supplierProfiles,
  buyerLocations,
} = schema;

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });

const PASSWORD = "Seed-test-pw-1!";
const ORIGIN = "http://localhost:3000";

const demoUserCount = async () =>
  (
    await owner
      .select({ n: count() })
      .from(user)
      .where(like(user.email, "%@demo.local"))
  )[0]!.n;

const orgBySlug = async (key: string) => {
  const [row] = await owner
    .select()
    .from(organization)
    .where(eq(organization.slug, `demo-${key}`));
  return row!;
};

let first: Awaited<ReturnType<typeof runSeed>>;

beforeAll(async () => {
  first = await runSeed({ appEnv: "local", password: PASSWORD });
});

afterAll(async () => {
  await ownerPool.end();
  await closeDb();
});

describe("first run on an empty database", () => {
  it("creates 7 users and 8 organizations", () => {
    expect(first.usersCreated).toBe(demoUsers().length);
    expect(first.usersCreated).toBe(7);
    expect(first.organizationsCreated).toBe(DEMO_ORGS.length);
    expect(first.organizationsCreated).toBe(8);
  });

  it("leaves no live session behind (sign-up opens one, the seed removes it)", async () => {
    const rows = await owner
      .select({ n: count() })
      .from(session)
      .innerJoin(user, eq(user.id, session.userId))
      .where(like(user.email, "%@demo.local"));
    expect(rows[0]!.n).toBe(0);
  });

  it("makes one platform organization, five buyers/suppliers as listed, all approved", async () => {
    const rows = await owner
      .select({
        type: orgProfiles.type,
        status: orgProfiles.status,
        n: count(),
      })
      .from(orgProfiles)
      .innerJoin(organization, eq(organization.id, orgProfiles.organizationId))
      .where(like(organization.slug, "demo-%"))
      .groupBy(orgProfiles.type, orgProfiles.status);
    expect(rows).toEqual(
      expect.arrayContaining([
        { type: "platform", status: "approved", n: 1 },
        { type: "supplier", status: "approved", n: 4 }, // A, B, C + the multi-user's supplier
        { type: "buyer", status: "approved", n: 3 }, // hotel, café + the multi-user's buyer
      ]),
    );
    expect(rows).toHaveLength(3);
  });

  it("gives supplier C a 650 bps commission override and A / B the platform default", async () => {
    const override = async (key: string) => {
      const org = await orgBySlug(key);
      const [row] = await owner
        .select({ bps: supplierProfiles.commissionOverrideBps })
        .from(supplierProfiles)
        .where(eq(supplierProfiles.organizationId, org.id));
      return row!.bps;
    };
    expect(await override("supplier-a")).toBeNull();
    expect(await override("supplier-b")).toBeNull();
    expect(await override("supplier-c")).toBe(650);
  });

  it("gives every buyer exactly one default delivery location", async () => {
    for (const key of ["buyer-hotel", "buyer-cafe", "multi-buyer"]) {
      const org = await orgBySlug(key);
      const rows = await owner
        .select({ isDefault: buyerLocations.isDefault })
        .from(buyerLocations)
        .where(eq(buyerLocations.organizationId, org.id));
      expect(rows, key).toEqual([{ isDefault: true }]);
    }
  });

  it("puts the multi-organization user into a buyer and a supplier of the same company", async () => {
    const [u] = await owner
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "multi@demo.local"));
    const rows = await owner
      .select({
        role: member.role,
        type: orgProfiles.type,
        taxId: orgProfiles.taxId,
      })
      .from(member)
      .innerJoin(
        orgProfiles,
        eq(orgProfiles.organizationId, member.organizationId),
      )
      .where(eq(member.userId, u!.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type).sort()).toEqual(["buyer", "supplier"]);
    expect(new Set(rows.map((r) => r.taxId)).size).toBe(1);
    expect(rows.every((r) => r.role === "owner")).toBe(true);
  });
});

describe("demo accounts", () => {
  it("every demo user signs in with the seed password, into the right organization", async () => {
    for (const org of DEMO_ORGS) {
      // The multi user's first membership is the buyer, so a new session starts there.
      if (org.key === "multi-supplier") continue;
      const res = await getAuth().api.signInEmail({
        body: { email: org.owner.email, password: PASSWORD },
      });
      const [row] = await owner
        .select({ active: session.activeOrganizationId })
        .from(session)
        .where(eq(session.token, res.token));
      expect(row!.active, org.owner.email).toBe((await orgBySlug(org.key)).id);
    }
  });

  it("rejects a wrong password (so the sign-in test above proves the password)", async () => {
    await expect(
      getAuth().api.signInEmail({
        body: { email: "admin@demo.local", password: "not-the-password-1" },
      }),
    ).rejects.toThrow();
  });
});

describe("running the seed again", () => {
  it("adds nothing, and never resets a password", async () => {
    const before = [
      await demoUserCount(),
      (await owner.select({ n: count() }).from(organization))[0]!.n,
    ];
    const second = await runSeed({
      appEnv: "local",
      password: "Another-pw-123!",
    });
    expect(second).toMatchObject({
      categoriesInserted: 0,
      attributesInserted: 0,
      usersCreated: 0,
      organizationsCreated: 0,
    });
    const after = [
      await demoUserCount(),
      (await owner.select({ n: count() }).from(organization))[0]!.n,
    ];
    expect(after).toEqual(before);
    // The first password still works — the second run did not touch existing users.
    await getAuth().api.signInEmail({
      body: { email: "buyer-hotel@demo.local", password: PASSWORD },
    });
  });
});

describe("closed registration", () => {
  it("still lets the seed create a user, while the HTTP sign-up stays refused", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "false");
    try {
      const email = `seed-${randomBytes(4).toString("hex")}@example.test`;
      const created = await ensureDemoUser(
        owner,
        { email, name: "Closed Registration" },
        PASSWORD,
      );
      expect(created.created).toBe(true);

      const res = await getAuth().handler(
        new Request(`${ORIGIN}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN },
          body: JSON.stringify({
            name: "Nope",
            email: `nope-${email}`,
            password: PASSWORD,
          }),
        }),
      );
      expect(res.status).toBe(403);

      await owner.delete(user).where(eq(user.email, email));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("production", () => {
  it.each([
    ["no password", undefined, /not set/],
    ["the README password", "Demo-1234!", /README/],
  ])(
    "refuses to seed with %s — and creates nothing",
    async (_name, password, message) => {
      const before = await owner.execute(sql`select count(*) as n from "user"`);
      await expect(runSeed({ appEnv: "production", password })).rejects.toThrow(
        message,
      );
      const after = await owner.execute(sql`select count(*) as n from "user"`);
      expect(after.rows).toEqual(before.rows);
    },
  );
});
