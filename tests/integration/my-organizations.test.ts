/**
 * listMyOrganizations (issue #63) against a real, migrated Postgres with RLS on: every call goes through
 * withUserTx / withTx, so migration 0007 (`org_profiles_read_member`) is what makes a user's OTHER
 * organizations readable.
 *
 * The multi user belongs to a buyer, to an approved supplier, to a SECOND buyer and to a PENDING supplier —
 * the last two are invisible to everybody else, so they show up in the list only because of the new policy.
 *
 * Fixtures are committed as horeca_owner and removed in afterAll.
 */
import { randomBytes, randomInt } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTx } from "@/server/db/tx";
import type { Actor } from "@/server/domain/actor";
import { NotFound } from "@/server/domain/errors";
import { listMyOrganizations } from "@/server/domain/my-organizations";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });
const { orgProfiles, member } = schema;

const run = randomBytes(4).toString("hex");
const org = (name: string) => `t_mo_${name}_${run}`;
const user = (name: string) => `t_mu_${name}_${run}`;

const O = {
  buyer: org("buyer"),
  supplier: org("sup"),
  buyer2: org("buyer2"),
  pending: org("pending"),
  plain: org("plain"),
  tenantX: org("x"),
  noProfile: org("noprofile"),
  badRole: org("badrole"),
  platform: org("plat"),
  leaver: org("leaver"),
};
const U = {
  multi: user("multi"),
  plain: user("plain"),
  tenantX: user("x"),
  leaver: user("leaver"),
  platform: user("plat"),
};

const taxId = () => String(randomInt(10_000_000, 99_999_999));
const NAMES: Record<string, string> = {
  [O.buyer]: "Multi Trade (kupac) d.o.o.",
  [O.supplier]: "Multi Trade (dobavljač) d.o.o.",
  [O.buyer2]: "Drugi kupac d.o.o.",
  [O.pending]: "Dobavljač na čekanju d.o.o.",
  [O.plain]: "Obični kupac d.o.o.",
  [O.tenantX]: "Tuđa firma d.o.o.",
  [O.badRole]: "Firma sa nepoznatom ulogom d.o.o.",
  [O.platform]: "Platforma d.o.o.",
  [O.leaver]: "Firma koju korisnik napušta d.o.o.",
};
const TYPE: Record<string, "buyer" | "supplier" | "platform"> = {
  [O.buyer]: "buyer",
  [O.supplier]: "supplier",
  [O.buyer2]: "buyer",
  [O.pending]: "supplier",
  [O.plain]: "buyer",
  [O.tenantX]: "buyer",
  [O.badRole]: "buyer",
  [O.platform]: "platform",
  [O.leaver]: "buyer",
};

const actor = (
  userId: string,
  orgId: string,
  orgType: Actor["orgType"],
  role: Actor["role"] = "owner",
): Actor => ({ userId, orgId, orgType, role });

const list = (a: Actor) => withTx(a, (tx) => listMyOrganizations(tx, a));

let n = 0;
async function addMember(
  orgId: string,
  userId: string,
  role: string,
  minute: number,
) {
  n += 1;
  await owner.insert(member).values({
    id: `t_mm_${n}_${run}`,
    organizationId: orgId,
    userId,
    role,
    // Fixed, increasing times: the list must follow the order of the memberships.
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
  });
}

beforeAll(async () => {
  const now = new Date();
  await owner.insert(schema.user).values(
    Object.values(U).map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })),
  );
  const allOrgs = Object.values(O);
  await owner
    .insert(schema.organization)
    .values(allOrgs.map((id) => ({ id, name: id, slug: id, createdAt: now })));
  await owner.insert(orgProfiles).values(
    allOrgs
      .filter((id) => id !== O.noProfile)
      .map((id) => ({
        organizationId: id,
        type: TYPE[id]!,
        // A pending supplier is a legacy state (decision 012), but the policy must still treat it like any
        // organization that is not visible to everybody.
        status: id === O.pending ? ("pending" as const) : ("approved" as const),
        legalName: NAMES[id]!,
        taxId: taxId(),
        addressLine: "Ulica 1",
        city: "Podgorica",
        postalCode: "81000",
        contactEmail: `${id}@example.test`,
      })),
  );

  // The multi user: oldest membership first.
  await addMember(O.buyer, U.multi, "owner", 1);
  await addMember(O.supplier, U.multi, "member", 2);
  await addMember(O.buyer2, U.multi, "owner", 3);
  await addMember(O.pending, U.multi, "owner", 4);
  // A user with one organization, another tenant, a user who leaves, the platform.
  await addMember(O.plain, U.plain, "owner", 1);
  await addMember(O.tenantX, U.tenantX, "owner", 1);
  await addMember(O.leaver, U.leaver, "owner", 1);
  await addMember(O.platform, U.platform, "owner", 1);
  // Two memberships that must NOT be offered: no profile yet, and a role we do not know.
  await addMember(O.noProfile, U.multi, "owner", 5);
  await addMember(O.badRole, U.multi, "admin", 6);
});

afterAll(async () => {
  const orgs = sql.join(
    Object.values(O).map((o) => sql`${o}`),
    sql`, `,
  );
  await owner.execute(
    sql`delete from member where organization_id in (${orgs})`,
  );
  await owner.execute(
    sql`delete from org_profiles where organization_id in (${orgs})`,
  );
  await owner.execute(sql`delete from organization where id in (${orgs})`);
  await owner
    .delete(schema.user)
    .where(inArray(schema.user.id, Object.values(U)));
  await ownerPool.end();
  await closeDb();
});

describe("listMyOrganizations", () => {
  it("lists every organization of the user with type and legal name, oldest membership first, active only on the one acted for", async () => {
    const asBuyer = await list(actor(U.multi, O.buyer, "buyer"));
    expect(asBuyer).toEqual([
      {
        organizationId: O.buyer,
        type: "buyer",
        legalName: NAMES[O.buyer],
        active: true,
      },
      {
        organizationId: O.supplier,
        type: "supplier",
        legalName: NAMES[O.supplier],
        active: false,
      },
      {
        organizationId: O.buyer2,
        type: "buyer",
        legalName: NAMES[O.buyer2],
        active: false,
      },
      {
        organizationId: O.pending,
        type: "supplier",
        legalName: NAMES[O.pending],
        active: false,
      },
    ]);
  });

  it("acting as the supplier flips `active` and keeps the same order and the same set", async () => {
    const asSupplier = await list(
      actor(U.multi, O.supplier, "supplier", "member"),
    );
    expect(asSupplier.map((o) => [o.organizationId, o.active])).toEqual([
      [O.buyer, false],
      [O.supplier, true],
      [O.buyer2, false],
      [O.pending, false],
    ]);
  });

  it("the organizations nobody else can see (a second buyer, a pending supplier) are listed — that is the new policy at work", async () => {
    // Read directly, as the multi user acting for the buyer: the profile of the second buyer is readable …
    const visible = await withTx(actor(U.multi, O.buyer, "buyer"), (tx) =>
      tx
        .select({ id: orgProfiles.organizationId })
        .from(orgProfiles)
        .where(inArray(orgProfiles.organizationId, [O.buyer2, O.pending])),
    );
    expect(visible.map((r) => r.id).sort()).toEqual(
      [O.buyer2, O.pending].sort(),
    );
    // … while the plain buyer, a member of neither, cannot read either profile.
    const hidden = await withTx(actor(U.plain, O.plain, "buyer"), (tx) =>
      tx
        .select({ id: orgProfiles.organizationId })
        .from(orgProfiles)
        .where(inArray(orgProfiles.organizationId, [O.buyer2, O.pending])),
    );
    expect(hidden).toEqual([]);
  });

  it("a user with one organization gets exactly that one", async () => {
    expect(await list(actor(U.plain, O.plain, "buyer"))).toEqual([
      {
        organizationId: O.plain,
        type: "buyer",
        legalName: NAMES[O.plain],
        active: true,
      },
    ]);
  });

  it("another tenant's organization never appears — in either direction", async () => {
    const multi = (await list(actor(U.multi, O.buyer, "buyer"))).map(
      (o) => o.organizationId,
    );
    const tenantX = (await list(actor(U.tenantX, O.tenantX, "buyer"))).map(
      (o) => o.organizationId,
    );
    const plain = (await list(actor(U.plain, O.plain, "buyer"))).map(
      (o) => o.organizationId,
    );
    expect(multi).not.toContain(O.tenantX);
    expect(multi).not.toContain(O.plain);
    expect(tenantX).toEqual([O.tenantX]);
    expect(plain).not.toContain(O.buyer);
  });

  it("the list belongs to the actor's USER: the same organization acted for by another user gives another answer", async () => {
    // plain is not a member of the multi user's buyer, so claiming that organization does not list its siblings.
    const forged = await withTx(actor(U.plain, O.buyer, "buyer"), (tx) =>
      listMyOrganizations(tx, actor(U.plain, O.buyer, "buyer")),
    );
    // Only the user's own membership is ever returned (here: none matches a visible profile with that user id,
    // except the plain buyer, which is listed as NOT active).
    expect(forged).toEqual([
      {
        organizationId: O.plain,
        type: "buyer",
        legalName: NAMES[O.plain],
        active: false,
      },
    ]);
  });

  it("leaves out a membership whose organization has no profile yet, and one with a role we do not know", async () => {
    const ids = (await list(actor(U.multi, O.buyer, "buyer"))).map(
      (o) => o.organizationId,
    );
    expect(ids).not.toContain(O.noProfile);
    expect(ids).not.toContain(O.badRole);
  });

  it("a removed membership disappears from the list at once", async () => {
    await addMember(O.buyer2, U.leaver, "member", 2);
    const before = await list(actor(U.leaver, O.leaver, "buyer"));
    expect(before.map((o) => o.organizationId)).toEqual([O.leaver, O.buyer2]);

    await owner
      .delete(member)
      .where(
        and(eq(member.userId, U.leaver), eq(member.organizationId, O.buyer2)),
      );
    const after = await list(actor(U.leaver, O.leaver, "buyer"));
    expect(after.map((o) => o.organizationId)).toEqual([O.leaver]);
    // … and the organization it left is no longer readable either (RLS, not only this query).
    const raw = await withTx(actor(U.leaver, O.leaver, "buyer"), (tx) =>
      tx
        .select({ id: orgProfiles.organizationId })
        .from(orgProfiles)
        .where(eq(orgProfiles.organizationId, O.buyer2)),
    );
    expect(raw).toEqual([]);
  });

  it("works for the platform user as well (its own organization, type platform) and for plain members", async () => {
    expect(await list(actor(U.platform, O.platform, "platform"))).toEqual([
      {
        organizationId: O.platform,
        type: "platform",
        legalName: NAMES[O.platform],
        active: true,
      },
    ]);
    // role `member` of the supplier lists the same as an owner would (checked above); nobody is refused.
    await expect(
      list(actor(U.multi, O.supplier, "supplier", "member")),
    ).resolves.toHaveLength(4);
  });

  it("being a member of another organization lets you read it but never change it", async () => {
    const changed = await withTx(actor(U.multi, O.buyer, "buyer"), (tx) =>
      tx
        .update(orgProfiles)
        .set({ legalName: "HACKED" })
        .where(eq(orgProfiles.organizationId, O.buyer2))
        .returning({ id: orgProfiles.organizationId }),
    );
    expect(changed).toEqual([]);
    const [row] = await owner
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, O.buyer2));
    expect(row!.legalName).toBe(NAMES[O.buyer2]);
  });

  it("is not a NotFound: the action is allowed for every organization type", async () => {
    for (const a of [
      actor(U.multi, O.buyer, "buyer"),
      actor(U.plain, O.plain, "buyer"),
      actor(U.platform, O.platform, "platform"),
    ]) {
      await expect(list(a)).resolves.not.toThrow(NotFound);
    }
  });
});
