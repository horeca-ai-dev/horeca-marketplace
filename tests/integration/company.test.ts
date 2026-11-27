/**
 * Company self-service (D5-B4, issue #65) against a real, migrated Postgres with RLS on: profile, buyer
 * locations and supplier bank details, every call through withTx(actor) — so the policies of migration 0005
 * are the second line behind policy.can.
 *
 * Fixtures are committed as horeca_owner and removed in afterAll. Users are real rows: the audit log has a
 * foreign key to `user`.
 */
import { randomBytes, randomInt } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTx, type Tx } from "@/server/db/tx";
import type { Actor } from "@/server/domain/actor";
import {
  getBankDetails,
  updateBankDetails,
} from "@/server/domain/bank-details";
import {
  archiveLocation,
  createLocation,
  listLocations,
  updateLocation,
} from "@/server/domain/buyer-locations";
import {
  Conflict,
  Forbidden,
  NotFound,
  Validation,
} from "@/server/domain/errors";
import { getOrgProfile, updateOrgProfile } from "@/server/domain/org-profile";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });
const { orgProfiles, supplierProfiles, buyerLocations, auditLog } = schema;

const run = randomBytes(4).toString("hex");
const buyerA = `t_cA_${run}`;
const buyerB = `t_cB_${run}`;
const supplierS = `t_cS_${run}`;
const platformP = `t_cP_${run}`;
const platformP2 = `t_cP2_${run}`; // another platform-type organization: owns a tax ID P may not take
const orgIds = [buyerA, buyerB, supplierS, platformP, platformP2];
const userIds = {
  buyerAOwner: `t_u_bao_${run}`,
  buyerAMember: `t_u_bam_${run}`,
  buyerBOwner: `t_u_bbo_${run}`,
  supOwner: `t_u_so_${run}`,
  supMember: `t_u_sm_${run}`,
  platform: `t_u_p_${run}`,
};

const actor = (
  userId: string,
  orgId: string,
  orgType: Actor["orgType"],
  role: Actor["role"],
): Actor => ({ userId, orgId, orgType, role });
const aOwner = actor(userIds.buyerAOwner, buyerA, "buyer", "owner");
const aMember = actor(userIds.buyerAMember, buyerA, "buyer", "member");
const bOwner = actor(userIds.buyerBOwner, buyerB, "buyer", "owner");
const sOwner = actor(userIds.supOwner, supplierS, "supplier", "owner");
const sMember = actor(userIds.supMember, supplierS, "supplier", "member");
const platform = actor(userIds.platform, platformP, "platform", "owner");

const as = <T>(a: Actor, fn: (tx: Tx) => Promise<T>) => withTx(a, fn);
const taxId = () => String(randomInt(10_000_000, 99_999_999));
const taxIds = new Map<string, string>();

const IBAN = "ME25505000012345678951";
const IBAN_PRETTY = "me25 5050 0001 2345 6789 51";

/** A valid Montenegrin IBAN for an 18-digit BBAN (mod 97-10). */
function makeIban(bban: string): string {
  let remainder = 0;
  for (const d of `${bban}221400`)
    remainder = (remainder * 10 + Number(d)) % 97;
  return `ME${String(98 - remainder).padStart(2, "0")}${bban}`;
}
const SECOND_IBAN = makeIban("510000000000000013");

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

const auditOf = (orgId: string, action?: string) =>
  owner
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityId, orgId),
        action ? eq(auditLog.action, action) : undefined,
      ),
    )
    .orderBy(auditLog.createdAt);

const company = (over: Record<string, unknown> = {}) => ({
  legalName: "Hotel A d.o.o.",
  taxId: taxIds.get(buyerA)!,
  addressLine: "Obala 1",
  city: "Budva",
  postalCode: "85310",
  contactEmail: "a@example.test",
  ...over,
});

const location = (label: string, over: Record<string, unknown> = {}) => ({
  label,
  addressLine: "Ulica 1",
  city: "Budva",
  postalCode: "85310",
  ...over,
});

beforeAll(async () => {
  const now = new Date();
  await owner.insert(schema.user).values(
    Object.values(userIds).map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })),
  );
  await owner
    .insert(schema.organization)
    .values(orgIds.map((id) => ({ id, name: id, slug: id, createdAt: now })));
  for (const id of orgIds) taxIds.set(id, taxId());
  await owner.insert(orgProfiles).values(
    orgIds.map((id) => ({
      organizationId: id,
      type: id.startsWith("t_cP")
        ? ("platform" as const)
        : id === supplierS
          ? ("supplier" as const)
          : ("buyer" as const),
      status: "approved" as const,
      legalName: `Firma ${id}`,
      taxId: taxIds.get(id)!,
      addressLine: "Ulica 1",
      city: "Podgorica",
      postalCode: "81000",
      contactEmail: `${id}@example.test`,
    })),
  );
  await owner.insert(supplierProfiles).values({ organizationId: supplierS });
});

afterAll(async () => {
  const ids = sql.join(
    orgIds.map((o) => sql`${o}`),
    sql`, `,
  );
  await owner.execute(sql`delete from audit_log where entity_id in (${ids})`);
  await owner.execute(
    sql`delete from buyer_locations where organization_id in (${ids})`,
  );
  await owner.execute(
    sql`delete from supplier_profiles where organization_id in (${ids})`,
  );
  await owner.execute(
    sql`delete from org_profiles where organization_id in (${ids})`,
  );
  await owner.execute(sql`delete from organization where id in (${ids})`);
  await owner
    .delete(schema.user)
    .where(inArray(schema.user.id, Object.values(userIds)));
  await ownerPool.end();
  await closeDb();
});

// ───────────────────────── organization profile ─────────────────────────

describe("getOrgProfile / updateOrgProfile", () => {
  it("owner and member of an organization read its profile; nothing internal is returned", async () => {
    for (const a of [aOwner, aMember]) {
      const profile = await as(a, (tx) => getOrgProfile(tx, a));
      expect(profile).toMatchObject({
        organizationId: buyerA,
        type: "buyer",
        status: "approved",
        taxId: taxIds.get(buyerA),
      });
      expect(profile).not.toHaveProperty("rejectionReason");
      expect(profile).not.toHaveProperty("statusChangedBy");
    }
  });

  it("each organization reads its OWN profile: another buyer never sees this one", async () => {
    const profile = await as(bOwner, (tx) => getOrgProfile(tx, bOwner));
    expect(profile.organizationId).toBe(buyerB);
  });

  it("the owner updates the company data; the audit log records only what changed", async () => {
    const before = await as(aOwner, (tx) => getOrgProfile(tx, aOwner));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await as(aOwner, (tx) =>
      updateOrgProfile(
        tx,
        aOwner,
        company({
          legalName: "Hotel A Novi d.o.o.",
          city: "Kotor",
          vatNumber: "02123456",
        }),
      ),
    );
    expect(updated).toMatchObject({
      legalName: "Hotel A Novi d.o.o.",
      city: "Kotor",
      vatNumber: "02123456",
      type: "buyer",
      status: "approved",
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );

    const [entry] = await auditOf(buyerA, "orgProfile.update");
    expect(entry).toMatchObject({
      actorUserId: userIds.buyerAOwner,
      actorOrgId: buyerA,
      actorOrgType: "buyer",
      entityType: "organization",
      before: {
        legalName: `Firma ${buyerA}`,
        city: "Podgorica",
        vatNumber: null,
      },
      after: {
        legalName: "Hotel A Novi d.o.o.",
        city: "Kotor",
        vatNumber: "02123456",
      },
    });
    // Fields that did not change are not in the entry.
    expect(Object.keys(entry!.after as object).sort()).toEqual(
      [
        "addressLine",
        "city",
        "contactEmail",
        "legalName",
        "postalCode",
        "vatNumber",
      ].sort(),
    );
  });

  it("saving the same values changes nothing and writes no audit entry", async () => {
    const current = await as(aOwner, (tx) => getOrgProfile(tx, aOwner));
    const entriesBefore = (await auditOf(buyerA, "orgProfile.update")).length;
    await as(aOwner, (tx) =>
      updateOrgProfile(
        tx,
        aOwner,
        company({
          legalName: current.legalName,
          addressLine: current.addressLine,
          city: current.city,
          postalCode: current.postalCode,
          contactEmail: current.contactEmail,
          vatNumber: current.vatNumber ?? undefined,
        }),
      ),
    );
    expect((await auditOf(buyerA, "orgProfile.update")).length).toBe(
      entriesBefore,
    );
  });

  it("a MEMBER may not edit (403, the data is theirs to see but not to change)", async () => {
    expect(
      await failure(
        as(aMember, (tx) =>
          updateOrgProfile(tx, aMember, company({ city: "Bar" })),
        ),
      ),
    ).toBeInstanceOf(Forbidden);
    expect(
      await failure(
        as(sMember, (tx) => updateOrgProfile(tx, sMember, company())),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it("only the platform changes a tax ID: the owner gets Forbidden and nothing changes", async () => {
    const error = await failure(
      as(aOwner, (tx) =>
        updateOrgProfile(tx, aOwner, company({ taxId: taxId() })),
      ),
    );
    expect(error).toBeInstanceOf(Forbidden);
    const [row] = await owner
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, buyerA));
    expect(row!.taxId).toBe(taxIds.get(buyerA));
  });

  it("the platform changes the tax ID of its own organization (audited); a tax ID in use → Conflict TAX_ID_TAKEN", async () => {
    const base = {
      legalName: `Firma ${platformP}`,
      addressLine: "Ulica 1",
      city: "Podgorica",
      postalCode: "81000",
      contactEmail: `${platformP}@example.test`,
    };
    const taken = await failure(
      as(platform, (tx) =>
        updateOrgProfile(tx, platform, {
          ...base,
          taxId: taxIds.get(platformP2)!,
        }),
      ),
    );
    expect(taken).toBeInstanceOf(Conflict);
    expect((taken as Conflict).reason).toBe("TAX_ID_TAKEN");

    const fresh = taxId();
    const updated = await as(platform, (tx) =>
      updateOrgProfile(tx, platform, { ...base, taxId: fresh }),
    );
    expect(updated.taxId).toBe(fresh);
    const [entry] = await auditOf(platformP, "orgProfile.update");
    expect(entry).toMatchObject({
      actorOrgType: "platform",
      before: { taxId: taxIds.get(platformP) },
      after: { taxId: fresh },
    });
  });

  it("rejects fields an edit must not carry (type, status, organization) and bad values — nothing is saved", async () => {
    for (const extra of [
      { type: "supplier" },
      { status: "suspended" },
      { organizationId: buyerB },
    ]) {
      const error = await failure(
        as(aOwner, (tx) =>
          updateOrgProfile(tx, aOwner, { ...company(), ...extra } as never),
        ),
      );
      expect(error).toBeInstanceOf(Validation);
    }
    expect(
      await failure(
        as(aOwner, (tx) =>
          updateOrgProfile(tx, aOwner, company({ postalCode: "123" })),
        ),
      ),
    ).toBeInstanceOf(Validation);
    const [row] = await owner
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, buyerA));
    expect(row!.type).toBe("buyer");
    expect(row!.status).toBe("approved");
  });

  it("the audit log cannot be read by the actor who wrote it (RLS: platform only)", async () => {
    const visible = await as(aOwner, (tx) =>
      tx.select({ n: count() }).from(auditLog),
    );
    expect(visible[0]!.n).toBe(0);
  });
});

// ───────────────────────── buyer locations ─────────────────────────

describe("buyer locations", () => {
  const defaultsOf = async (orgId: string) =>
    (
      await owner
        .select({ label: buyerLocations.label })
        .from(buyerLocations)
        .where(
          and(
            eq(buyerLocations.organizationId, orgId),
            eq(buyerLocations.isDefault, true),
            sql`${buyerLocations.archivedAt} IS NULL`,
          ),
        )
    ).map((r) => r.label);

  it("the first location is the default by itself; a later one is not unless asked", async () => {
    const first = await as(aOwner, (tx) =>
      createLocation(tx, aOwner, location("Hotel")),
    );
    expect(first).toMatchObject({
      organizationId: buyerA,
      isDefault: true,
      country: "ME",
    });
    const second = await as(aMember, (tx) =>
      createLocation(tx, aMember, location("Restoran")),
    );
    expect(second.isDefault).toBe(false); // a MEMBER may create too (matrix: B*)
    expect(await defaultsOf(buyerA)).toEqual(["Hotel"]);
  });

  it("makeDefault on create swaps the default in one transaction", async () => {
    await as(aOwner, (tx) =>
      createLocation(tx, aOwner, location("Skladište", { makeDefault: true })),
    );
    expect(await defaultsOf(buyerA)).toEqual(["Skladište"]);
  });

  it("makeDefault on update swaps it too; makeDefault false on the default leaves it the default", async () => {
    const all = await as(aOwner, (tx) => listLocations(tx, aOwner));
    const hotel = all.find((l) => l.label === "Hotel")!;

    await as(aOwner, (tx) =>
      updateLocation(tx, aOwner, {
        ...location("Hotel", { city: "Kotor" }),
        locationId: hotel.id,
        makeDefault: true,
      }),
    );
    expect(await defaultsOf(buyerA)).toEqual(["Hotel"]);

    const unchanged = await as(aOwner, (tx) =>
      updateLocation(tx, aOwner, {
        ...location("Hotel"),
        locationId: hotel.id,
        makeDefault: false,
      }),
    );
    expect(unchanged.isDefault).toBe(true);
    expect(await defaultsOf(buyerA)).toEqual(["Hotel"]);
  });

  it("list: the default first, then by label; archived ones only when asked", async () => {
    const list = await as(aOwner, (tx) => listLocations(tx, aOwner));
    expect(list[0]!.label).toBe("Hotel");
    expect(list.map((l) => l.label)).toEqual([
      "Hotel",
      "Restoran",
      "Skladište",
    ]);
  });

  it("the default cannot be archived: Conflict DEFAULT_LOCATION_ARCHIVE; after another becomes the default it can", async () => {
    const [hotel, restoran] = await as(aOwner, async (tx) => {
      const all = await listLocations(tx, aOwner);
      return [
        all.find((l) => l.label === "Hotel")!,
        all.find((l) => l.label === "Restoran")!,
      ] as const;
    });
    const error = await failure(
      as(aOwner, (tx) => archiveLocation(tx, aOwner, { locationId: hotel.id })),
    );
    expect(error).toBeInstanceOf(Conflict);
    expect((error as Conflict).reason).toBe("DEFAULT_LOCATION_ARCHIVE");

    await as(aOwner, (tx) =>
      updateLocation(tx, aOwner, {
        ...location("Restoran"),
        locationId: restoran.id,
        makeDefault: true,
      }),
    );
    const archived = await as(aOwner, (tx) =>
      archiveLocation(tx, aOwner, { locationId: hotel.id }),
    );
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await defaultsOf(buyerA)).toEqual(["Restoran"]);

    // Idempotent: archiving again changes nothing and is not an error.
    const again = await as(aOwner, (tx) =>
      archiveLocation(tx, aOwner, { locationId: hotel.id }),
    );
    expect(again.archivedAt?.getTime()).toBe(archived.archivedAt?.getTime());
  });

  it("archived locations disappear from the list unless asked for; they cannot be edited, and nothing is deleted", async () => {
    const active = await as(aOwner, (tx) => listLocations(tx, aOwner));
    expect(active.map((l) => l.label)).not.toContain("Hotel");
    const all = await as(aOwner, (tx) =>
      listLocations(tx, aOwner, { includeArchived: true }),
    );
    const hotel = all.find((l) => l.label === "Hotel")!;
    expect(hotel.archivedAt).not.toBeNull();
    expect(
      await failure(
        as(aOwner, (tx) =>
          updateLocation(tx, aOwner, {
            ...location("Hotel"),
            locationId: hotel.id,
            makeDefault: false,
          }),
        ),
      ),
    ).toBeInstanceOf(Conflict);
  });

  it("another buyer's locations are invisible: update and archive say NotFound, the list is its own", async () => {
    const [own] = await as(aOwner, (tx) => listLocations(tx, aOwner));
    for (const attempt of [
      (tx: Tx) =>
        updateLocation(tx, bOwner, {
          ...location("HACK"),
          locationId: own!.id,
          makeDefault: true,
        }),
      (tx: Tx) => archiveLocation(tx, bOwner, { locationId: own!.id }),
    ]) {
      expect(await failure(as(bOwner, attempt))).toBeInstanceOf(NotFound);
    }
    expect(await as(bOwner, (tx) => listLocations(tx, bOwner))).toEqual([]);
    const [still] = await owner
      .select()
      .from(buyerLocations)
      .where(eq(buyerLocations.id, own!.id));
    expect(still!.label).not.toBe("HACK");
  });

  it("organizations stay separate: each has its own default", async () => {
    await as(bOwner, (tx) => createLocation(tx, bOwner, location("B-Hotel")));
    expect(await defaultsOf(buyerB)).toEqual(["B-Hotel"]);
    expect(await defaultsOf(buyerA)).toEqual(["Restoran"]);
  });

  it("a supplier cannot use buyer locations (NotFound: another area); the platform sees none and cannot create", async () => {
    expect(
      await failure(as(sOwner, (tx) => listLocations(tx, sOwner))),
    ).toBeInstanceOf(NotFound);
    expect(
      await failure(
        as(sOwner, (tx) => createLocation(tx, sOwner, location("X"))),
      ),
    ).toBeInstanceOf(NotFound);
    expect(await as(platform, (tx) => listLocations(tx, platform))).toEqual([]);
    expect(
      await failure(
        as(platform, (tx) => createLocation(tx, platform, location("X"))),
      ),
    ).toBeInstanceOf(NotFound);
  });

  it("the organization cannot be named in the input (mass assignment)", async () => {
    const error = await failure(
      as(aOwner, (tx) =>
        createLocation(tx, aOwner, {
          ...location("Sneaky"),
          organizationId: buyerB,
        } as never),
      ),
    );
    expect(error).toBeInstanceOf(Validation);
    expect(
      await owner
        .select()
        .from(buyerLocations)
        .where(eq(buyerLocations.label, "Sneaky")),
    ).toHaveLength(0);
  });

  it("two simultaneous 'make default' creations leave exactly one default (no 500, no two defaults)", async () => {
    const results = await Promise.allSettled([
      as(bOwner, (tx) =>
        createLocation(tx, bOwner, location("Race-1", { makeDefault: true })),
      ),
      as(bOwner, (tx) =>
        createLocation(tx, bOwner, location("Race-2", { makeDefault: true })),
      ),
      as(bOwner, (tx) =>
        createLocation(tx, bOwner, location("Race-3", { makeDefault: true })),
      ),
    ]);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(Conflict);
    }
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await defaultsOf(buyerB)).toHaveLength(1);
  });
});

// ───────────────────────── supplier bank details ─────────────────────────

describe("supplier bank details", () => {
  it("a supplier with no IBAN yet shows null", async () => {
    expect(
      (await as(sOwner, (tx) => getBankDetails(tx, sOwner))).iban,
    ).toBeNull();
  });

  it("the owner sets the IBAN (a pasted, spaced, lower-case one is stored normalized); the audit entry is masked", async () => {
    const saved = await as(sOwner, (tx) =>
      updateBankDetails(tx, sOwner, { iban: IBAN_PRETTY }),
    );
    expect(saved.iban).toBe(IBAN);
    expect((await as(sOwner, (tx) => getBankDetails(tx, sOwner))).iban).toBe(
      IBAN,
    );

    const [entry] = await auditOf(
      supplierS,
      "supplierProfile.updateBankDetails",
    );
    expect(entry).toMatchObject({
      actorUserId: userIds.supOwner,
      actorOrgType: "supplier",
      before: { iban: null },
      after: { iban: "ME25…8951" },
    });
    // The whole account number is nowhere in the log.
    expect(JSON.stringify(entry)).not.toContain(IBAN);
    expect(JSON.stringify(entry)).not.toContain("5050");
  });

  it("saving the same IBAN again writes no new audit entry; a different one does, masked on both sides", async () => {
    const n = () =>
      auditOf(supplierS, "supplierProfile.updateBankDetails").then(
        (r) => r.length,
      );
    const before = await n();
    await as(sOwner, (tx) => updateBankDetails(tx, sOwner, { iban: IBAN }));
    expect(await n()).toBe(before);

    await as(sOwner, (tx) =>
      updateBankDetails(tx, sOwner, { iban: SECOND_IBAN }),
    );
    const entries = await auditOf(
      supplierS,
      "supplierProfile.updateBankDetails",
    );
    expect(entries).toHaveLength(before + 1);
    expect(entries.at(-1)).toMatchObject({
      before: { iban: "ME25…8951" },
      after: { iban: `${SECOND_IBAN.slice(0, 4)}…${SECOND_IBAN.slice(-4)}` },
    });
  });

  it("an invalid IBAN is a validation error on the field `iban`, and nothing changes", async () => {
    const stored = (await as(sOwner, (tx) => getBankDetails(tx, sOwner))).iban;
    const error = await failure(
      as(sOwner, (tx) =>
        updateBankDetails(tx, sOwner, { iban: "ME26505000012345678951" }),
      ),
    );
    expect(error).toBeInstanceOf(Validation);
    expect(Object.keys((error as Validation).fieldErrors)).toEqual(["iban"]);
    expect((await as(sOwner, (tx) => getBankDetails(tx, sOwner))).iban).toBe(
      stored,
    );
  });

  it("a MEMBER can neither see nor change the bank details (403)", async () => {
    expect(
      await failure(as(sMember, (tx) => getBankDetails(tx, sMember))),
    ).toBeInstanceOf(Forbidden);
    expect(
      await failure(
        as(sMember, (tx) => updateBankDetails(tx, sMember, { iban: IBAN })),
      ),
    ).toBeInstanceOf(Forbidden);
  });

  it("a buyer and the platform have no part in it (NotFound)", async () => {
    for (const a of [aOwner, platform]) {
      expect(
        await failure(as(a, (tx) => getBankDetails(tx, a))),
      ).toBeInstanceOf(NotFound);
      expect(
        await failure(as(a, (tx) => updateBankDetails(tx, a, { iban: IBAN }))),
      ).toBeInstanceOf(NotFound);
    }
  });

  it("RLS says the same without any domain code: a member's raw read of supplier_profiles returns no rows", async () => {
    const rows = await as(sMember, (tx) => tx.select().from(supplierProfiles));
    expect(rows).toHaveLength(0);
    const ownerRows = await as(sOwner, (tx) =>
      tx.select().from(supplierProfiles),
    );
    expect(ownerRows).toHaveLength(1);
  });

  it("the organization cannot be named in the input", async () => {
    const error = await failure(
      as(sOwner, (tx) =>
        updateBankDetails(tx, sOwner, {
          iban: IBAN,
          organizationId: buyerA,
        } as never),
      ),
    );
    expect(error).toBeInstanceOf(Validation);
  });
});
