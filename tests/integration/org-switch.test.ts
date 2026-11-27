/**
 * Switching the active organization (issue #63, point 4): there is no Server Action for it — the switcher
 * (D7-A3) calls Better Auth's `/organization/set-active`, which is allowlisted in auth.ts. This test pins what
 * the switcher relies on, against Better Auth 1.7.20 and a real database:
 *
 *   - a new session starts in the user's OLDEST membership (the same order `listMyOrganizations` uses)
 *   - set-active to an organization the user belongs to works, and `loadActor` then yields that organization's
 *     actor (type and role) — what `resolveActor` does on the next request
 *   - set-active to an organization the user does NOT belong to — another tenant's, or one that does not exist —
 *     is refused with 403 and `loadActor` says "not a member"; Better Auth also CLEARS the session's active
 *     organization on such a refusal (fail closed), which the switcher has to handle
 */
import { randomInt } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env.core";
import type { RegistrationInput } from "@/lib/schemas/registration";
import { getAuth } from "@/server/auth/auth";
import { registerCompany } from "@/server/auth/registration";
import { closeDb } from "@/server/db/client";
import { loadActor } from "@/server/db/queries/actor";
import * as schema from "@/server/db/schema";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });

const run = Date.now().toString(36);
const PASSWORD = "Test-password-123";
const ORIGIN = "http://localhost:3000";
const taxId = () => String(randomInt(10_000_000, 100_000_000));

let n = 0;
function input(): RegistrationInput {
  n += 1;
  const email = `switch-${run}-${n}@example.test`;
  return {
    account: { name: "Switch Test", email, password: PASSWORD },
    company: {
      legalName: `Switch buyer ${n} d.o.o.`,
      taxId: taxId(),
      addressLine: "Njegoševa 1",
      city: "Podgorica",
      postalCode: "81000",
      contactEmail: email,
    },
  };
}

const http = (path: string, body: unknown, cookie?: string) =>
  getAuth().handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");
const activeOrganization = async (cookie: string) =>
  (await getAuth().api.getSession({ headers: new Headers({ cookie }) }))
    ?.session.activeOrganizationId ?? null;

const extraOrgs: string[] = [];

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  if (extraOrgs.length > 0) {
    await owner
      .delete(schema.member)
      .where(inArray(schema.member.organizationId, extraOrgs));
    await owner
      .delete(schema.supplierProfiles)
      .where(inArray(schema.supplierProfiles.organizationId, extraOrgs));
    await owner
      .delete(schema.orgProfiles)
      .where(inArray(schema.orgProfiles.organizationId, extraOrgs));
    await owner
      .delete(schema.organization)
      .where(inArray(schema.organization.id, extraOrgs));
  }
  await ownerPool.end();
  await closeDb();
});

/** A user with a buyer (registered) and a supplier (added by hand, a later membership), plus a stranger's buyer. */
async function scenario() {
  vi.stubEnv("REGISTRATION_OPEN", "true");
  const mine = input();
  const me = await registerCompany(mine);
  const stranger = await registerCompany(input());

  const supplierOrg = `t_sw_sup_${run}_${n}`;
  extraOrgs.push(supplierOrg);
  await owner.insert(schema.organization).values({
    id: supplierOrg,
    name: supplierOrg,
    slug: supplierOrg,
    createdAt: new Date(),
  });
  await owner.insert(schema.orgProfiles).values({
    organizationId: supplierOrg,
    type: "supplier",
    status: "approved",
    legalName: "Switch supplier d.o.o.",
    taxId: taxId(),
    addressLine: "Ulica 1",
    city: "Bar",
    postalCode: "85000",
    contactEmail: "s@example.test",
  });
  await owner.insert(schema.member).values({
    id: `t_sw_m_${run}_${n}`,
    organizationId: supplierOrg,
    userId: me.userId,
    role: "member",
    // Later than the registration's own membership: the buyer stays the oldest.
    createdAt: new Date(Date.now() + 60_000),
  });

  const login = await http("/sign-in/email", {
    email: mine.account.email,
    password: PASSWORD,
  });
  expect(login.status).toBe(200);
  return {
    userId: me.userId,
    buyerOrg: me.organizationId,
    supplierOrg,
    strangerOrg: stranger.organizationId,
    cookie: cookieOf(login),
  };
}

describe("set-active (Better Auth) as the organization switcher uses it", () => {
  it("a new session starts in the oldest membership", async () => {
    const s = await scenario();
    expect(await activeOrganization(s.cookie)).toBe(s.buyerOrg);
  });

  it("switching to another organization of the user works, and loadActor then gives that organization's actor", async () => {
    const s = await scenario();
    const res = await http(
      "/organization/set-active",
      { organizationId: s.supplierOrg },
      s.cookie,
    );
    expect(res.status).toBe(200);
    expect(await activeOrganization(s.cookie)).toBe(s.supplierOrg);

    // What resolveActor does on the next request: re-check the membership and read type and role.
    const loaded = await loadActor(s.userId, s.supplierOrg);
    expect(loaded?.actor).toEqual({
      userId: s.userId,
      orgId: s.supplierOrg,
      orgType: "supplier",
      role: "member",
    });
    expect(loaded?.orgName).toBe("Switch supplier d.o.o.");

    // … and back.
    expect(
      (
        await http(
          "/organization/set-active",
          { organizationId: s.buyerOrg },
          s.cookie,
        )
      ).status,
    ).toBe(200);
    expect(await activeOrganization(s.cookie)).toBe(s.buyerOrg);
    expect((await loadActor(s.userId, s.buyerOrg))?.actor.orgType).toBe(
      "buyer",
    );
  });

  it("an organization the user does NOT belong to is refused with 403 — and Better Auth CLEARS the session's active organization (fail closed)", async () => {
    const s = await scenario();
    const res = await http(
      "/organization/set-active",
      { organizationId: s.strangerOrg },
      s.cookie,
    );
    expect(res.status).toBe(403);
    // Better Auth 1.7.20 first clears the active organization, then throws (organization/routes/crud-org.mjs):
    // the session does NOT keep the old organization. The switcher (D7-A3) must handle "no active organization"
    // after any failed switch — see the PR description.
    expect(await activeOrganization(s.cookie)).toBeNull();
    // The next request's re-check agrees: this user is not a member of the other tenant's organization.
    expect(await loadActor(s.userId, s.strangerOrg)).toBeNull();
    // The user did not lose anything: a valid switch puts the session back on one of their own organizations.
    expect(
      (
        await http(
          "/organization/set-active",
          { organizationId: s.buyerOrg },
          s.cookie,
        )
      ).status,
    ).toBe(200);
    expect(await activeOrganization(s.cookie)).toBe(s.buyerOrg);
  });

  it("an organization that does not exist is refused the same way (403, active organization cleared)", async () => {
    const s = await scenario();
    const res = await http(
      "/organization/set-active",
      { organizationId: "does-not-exist-anywhere" },
      s.cookie,
    );
    expect(res.status).toBe(403);
    expect(await activeOrganization(s.cookie)).toBeNull();
  });

  it("without a session nothing can be switched", async () => {
    const s = await scenario();
    const res = await http("/organization/set-active", {
      organizationId: s.supplierOrg,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("a membership removed after the switch fails the next request's check, even though the session still names the organization", async () => {
    const s = await scenario();
    expect(
      (
        await http(
          "/organization/set-active",
          { organizationId: s.supplierOrg },
          s.cookie,
        )
      ).status,
    ).toBe(200);
    await owner
      .delete(schema.member)
      .where(eq(schema.member.organizationId, s.supplierOrg));
    // The session cookie still claims the supplier …
    expect(await activeOrganization(s.cookie)).toBe(s.supplierOrg);
    // … but resolveActor's check (loadActor) no longer lets the user act for it.
    expect(await loadActor(s.userId, s.supplierOrg)).toBeNull();
  });
});
