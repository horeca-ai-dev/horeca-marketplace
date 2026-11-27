/**
 * A buyer's delivery locations (D5-B4, issue #65; matrix: buyerLocation.list / .create / .update / .archive).
 *
 * Every function works on `actor.orgId`: the organization never comes from input (rule 3), and every query
 * filters by it explicitly (RLS is the second line). Locations are archived, never deleted — orders keep a
 * snapshot of the address anyway.
 *
 * The default location (at most one active per organization, `buyer_locations_one_default_uq`):
 *   - the first location of an organization becomes the default by itself
 *   - `makeDefault` switches the default in ONE transaction: the old one is turned off first, then the new one
 *     is turned on (the partial unique index would refuse two defaults even for an instant)
 *   - `makeDefault: false` on the current default does nothing: the default changes only by making ANOTHER
 *     location the default, so an organization with locations always has one
 *   - the default cannot be archived → Conflict DEFAULT_LOCATION_ARCHIVE ("set another default first"); this
 *     also means the only location of an organization can be edited but not archived
 *
 * The platform may call `listLocations` (matrix: read) but, with no target organization, it sees its own — none.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  archiveLocationSchema,
  createLocationSchema,
  listLocationsSchema,
  updateLocationSchema,
  type ArchiveLocationInput,
  type CreateLocationInput,
  type ListLocationsInput,
  type UpdateLocationInput,
} from "@/lib/schemas/company";
import { warnIfEmptyRead } from "@/server/db/rls-debug";
import { buyerLocations } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";
import type { Actor } from "./actor";
import { Conflict, NotFound } from "./errors";
import { assertCan } from "./policy";
import { parseInput } from "./validation";

const log = getLogger("buyer-locations");

export type LocationRecord = typeof buyerLocations.$inferSelect;

const ONE_DEFAULT = "buyer_locations_one_default_uq";

const ofOrganization = (actor: Actor) =>
  eq(buyerLocations.organizationId, actor.orgId);

/** The organization's own location; another organization's (or a missing one) is NotFound. Locked until commit. */
async function loadOwn(
  tx: Tx,
  actor: Actor,
  locationId: string,
): Promise<LocationRecord> {
  const [row] = await tx
    .select()
    .from(buyerLocations)
    .where(and(eq(buyerLocations.id, locationId), ofOrganization(actor)))
    .for("update");
  if (!row) throw new NotFound();
  return row;
}

/** Turns the current default off (if there is one); returns whether there was one. */
async function clearDefault(tx: Tx, actor: Actor): Promise<boolean> {
  const cleared = await tx
    .update(buyerLocations)
    .set({ isDefault: false })
    .where(
      and(
        ofOrganization(actor),
        eq(buyerLocations.isDefault, true),
        isNull(buyerLocations.archivedAt),
      ),
    )
    .returning({ id: buyerLocations.id });
  return cleared.length > 0;
}

function raceConflict(error: unknown): never {
  const cause = (
    error as { cause?: { code?: string; constraint?: string } } | null
  )?.cause;
  if (cause?.code === "23505" && cause.constraint === ONE_DEFAULT) {
    throw new Conflict(
      "The default location was changed at the same time. Please try again.",
    );
  }
  throw error;
}

/** The active locations (and the archived ones when asked), the default first. */
export async function listLocations(
  tx: Tx,
  actor: Actor,
  rawInput: ListLocationsInput = {},
): Promise<LocationRecord[]> {
  assertCan(actor, "buyerLocation.list");
  const input = parseInput(listLocationsSchema, rawInput);
  const rows = await tx
    .select()
    .from(buyerLocations)
    .where(
      and(
        ofOrganization(actor),
        input.includeArchived ? undefined : isNull(buyerLocations.archivedAt),
      ),
    )
    .orderBy(
      desc(buyerLocations.isDefault),
      asc(buyerLocations.label),
      asc(buyerLocations.createdAt),
    );
  return [...warnIfEmptyRead(log, actor, "buyerLocation.list", rows)];
}

export async function createLocation(
  tx: Tx,
  actor: Actor,
  rawInput: CreateLocationInput,
): Promise<LocationRecord> {
  assertCan(actor, "buyerLocation.create");
  const input = parseInput(createLocationSchema, rawInput);

  try {
    // The first location is the default; later ones only when asked. Turning the old default off comes first.
    const [existing] = await tx
      .select({ id: buyerLocations.id })
      .from(buyerLocations)
      .where(
        and(
          ofOrganization(actor),
          eq(buyerLocations.isDefault, true),
          isNull(buyerLocations.archivedAt),
        ),
      )
      .for("update");
    const isDefault = input.makeDefault || !existing;
    if (isDefault && existing) await clearDefault(tx, actor);

    // Every column named explicitly — never spread input into an insert (rule 13).
    const [created] = await tx
      .insert(buyerLocations)
      .values({
        organizationId: actor.orgId,
        label: input.label,
        addressLine: input.addressLine,
        city: input.city,
        postalCode: input.postalCode,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        isDefault,
      })
      .returning();
    return created!;
  } catch (error) {
    return raceConflict(error);
  }
}

export async function updateLocation(
  tx: Tx,
  actor: Actor,
  rawInput: UpdateLocationInput,
): Promise<LocationRecord> {
  assertCan(actor, "buyerLocation.update");
  const input = parseInput(updateLocationSchema, rawInput);
  const location = await loadOwn(tx, actor, input.locationId);
  if (location.archivedAt) {
    throw new Conflict("An archived location cannot be edited.");
  }

  try {
    const becomesDefault = input.makeDefault && !location.isDefault;
    if (becomesDefault) await clearDefault(tx, actor);
    const [updated] = await tx
      .update(buyerLocations)
      .set({
        label: input.label,
        addressLine: input.addressLine,
        city: input.city,
        postalCode: input.postalCode,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        // `makeDefault: false` never turns the default off (see the header).
        isDefault: location.isDefault || becomesDefault,
      })
      .where(and(eq(buyerLocations.id, location.id), ofOrganization(actor)))
      .returning();
    if (!updated) throw new NotFound();
    return updated;
  } catch (error) {
    return raceConflict(error);
  }
}

/** Archives a location (idempotent). The default cannot be archived. */
export async function archiveLocation(
  tx: Tx,
  actor: Actor,
  rawInput: ArchiveLocationInput,
): Promise<LocationRecord> {
  assertCan(actor, "buyerLocation.archive");
  const input = parseInput(archiveLocationSchema, rawInput);
  const location = await loadOwn(tx, actor, input.locationId);
  if (location.archivedAt) return location;
  if (location.isDefault) {
    throw new Conflict(
      "Set another default location first, then archive this one.",
      { reason: "DEFAULT_LOCATION_ARCHIVE" },
    );
  }
  const [archived] = await tx
    .update(buyerLocations)
    .set({ archivedAt: new Date() })
    .where(and(eq(buyerLocations.id, location.id), ofOrganization(actor)))
    .returning();
  if (!archived) throw new NotFound();
  return archived;
}
