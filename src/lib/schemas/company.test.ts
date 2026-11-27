import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  INVALID_IBAN_MESSAGE,
  archiveLocationSchema,
  createLocationSchema,
  ibanSchema,
  isValidIban,
  listLocationsSchema,
  maskIban,
  normalizeIban,
  updateBankDetailsSchema,
  updateLocationSchema,
  updateOrgProfileSchema,
} from "./company";

/** A Montenegrin IBAN with the correct check digits for any 18-digit BBAN (ISO 7064 mod 97-10). */
function makeIban(bban: string): string {
  // check = 98 − (BBAN + "ME00" as a number) mod 97; ME = 22 14.
  let remainder = 0;
  for (const d of `${bban}221400`)
    remainder = (remainder * 10 + Number(d)) % 97;
  return `ME${String(98 - remainder).padStart(2, "0")}${bban}`;
}

/** The example of the IBAN registry for Montenegro. */
const REGISTRY_EXAMPLE = "ME25505000012345678951";

describe("IBAN", () => {
  it("accepts the registry's Montenegrin example", () => {
    expect(isValidIban(REGISTRY_EXAMPLE)).toBe(true);
    expect(makeIban("505000012345678951")).toBe(REGISTRY_EXAMPLE);
  });

  it("normalizes what people paste: spaces, dashes and lower case", () => {
    expect(normalizeIban("me25 5050 0001 2345 6789 51")).toBe(REGISTRY_EXAMPLE);
    expect(ibanSchema.parse(" me25-5050-0001-2345-6789-51 ")).toBe(
      REGISTRY_EXAMPLE,
    );
  });

  it.each([
    ["wrong check digits", "ME26505000012345678951"],
    ["one digit changed", "ME25505000012345678952"],
    ["too short", "ME2550500001234567895"],
    ["too long", "ME255050000123456789511"],
    ["letters in the account number", "ME2550500001234567895A"],
    ["another country, valid IBAN", "DE89370400440532013000"],
    ["only the country", "ME"],
    ["empty", ""],
    ["the seed's placeholder IBAN", "ME25000000000000000002"],
  ])("rejects %s", (_label, value) => {
    expect(isValidIban(normalizeIban(value))).toBe(false);
    const result = ibanSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(INVALID_IBAN_MESSAGE);
  });

  it("every IBAN built with correct check digits is valid, and changing any one digit makes it invalid", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9]{18}$/),
        fc.integer({ min: 0, max: 21 }),
        fc.integer({ min: 1, max: 9 }),
        (bban, position, shift) => {
          const iban = makeIban(bban);
          expect(isValidIban(iban)).toBe(true);
          if (position < 2) return; // positions 0-1 are the letters "ME"
          const digit = Number(iban[position]);
          const broken =
            iban.slice(0, position) +
            String((digit + shift) % 10) +
            iban.slice(position + 1);
          expect(isValidIban(broken)).toBe(false); // mod 97 catches every single-digit error
        },
      ),
    );
  });

  it("is idempotent: parsing the parsed value changes nothing (the action and the domain both parse)", () => {
    const once = updateBankDetailsSchema.parse({
      iban: "me25 5050 0001 2345 6789 51",
    });
    expect(updateBankDetailsSchema.parse(once)).toEqual(once);
  });

  it("maskIban shows only the start and the end", () => {
    expect(maskIban(REGISTRY_EXAMPLE)).toBe("ME25…8951");
    expect(maskIban(REGISTRY_EXAMPLE)).not.toContain("5050");
    expect(maskIban("ME25")).toBe("…");
  });

  it("the bank-details schema takes an iban and nothing else", () => {
    expect(
      updateBankDetailsSchema.safeParse({
        iban: REGISTRY_EXAMPLE,
        organizationId: "o-other",
      }).success,
    ).toBe(false);
  });
});

const location = {
  label: "Hotel Budva",
  addressLine: "Obala 1",
  city: "Budva",
  postalCode: "85310",
} as const;

describe("location schemas", () => {
  it("a minimal location: optional contact fields become null, makeDefault is false", () => {
    expect(createLocationSchema.parse(location)).toEqual({
      ...location,
      contactName: null,
      contactPhone: null,
      makeDefault: false,
    });
  });

  it("trims text and turns empty contact fields into null", () => {
    const r = createLocationSchema.parse({
      ...location,
      label: "  Hotel Budva ",
      contactName: "   ",
      contactPhone: "",
    });
    expect(r).toMatchObject({
      label: "Hotel Budva",
      contactName: null,
      contactPhone: null,
    });
  });

  it.each([
    ["label empty", { label: "  " }],
    ["postal code not 5 digits", { postalCode: "8531" }],
    ["postal code with letters", { postalCode: "85a10" }],
    ["address too short", { addressLine: "x" }],
    ["makeDefault not a boolean", { makeDefault: "yes" }],
  ])("rejects: %s", (_label, over) => {
    expect(
      createLocationSchema.safeParse({ ...location, ...over }).success,
    ).toBe(false);
  });

  it("rejects fields we did not name: no organization, no archive flag, no id on create", () => {
    for (const extra of [
      { organizationId: "o-other" },
      { archivedAt: "2026-01-01" },
      { isDefault: true },
      { id: "33333333-3333-4333-8333-333333333333" },
    ]) {
      expect(
        createLocationSchema.safeParse({ ...location, ...extra }).success,
      ).toBe(false);
    }
  });

  it("update and archive need a UUID location id", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(
      updateLocationSchema.safeParse({ ...location, locationId: id }).success,
    ).toBe(true);
    expect(
      updateLocationSchema.safeParse({ ...location, locationId: "x" }).success,
    ).toBe(false);
    expect(updateLocationSchema.safeParse(location).success).toBe(false);
    expect(archiveLocationSchema.safeParse({ locationId: id }).success).toBe(
      true,
    );
    expect(
      archiveLocationSchema.safeParse({ locationId: id, makeDefault: true })
        .success,
    ).toBe(false);
  });

  it("list: archived ones are left out unless asked", () => {
    expect(listLocationsSchema.parse({})).toEqual({ includeArchived: false });
    expect(listLocationsSchema.parse({ includeArchived: true })).toEqual({
      includeArchived: true,
    });
    expect(listLocationsSchema.safeParse({ organizationId: "x" }).success).toBe(
      false,
    );
  });

  it("is idempotent: parsing the parsed value changes nothing", () => {
    const once = createLocationSchema.parse({
      ...location,
      contactName: " Ana ",
    });
    expect(createLocationSchema.parse(once)).toEqual(once);
  });
});

describe("updateOrgProfileSchema (the registration company schema, reused)", () => {
  const company = {
    legalName: "Hotel Main d.o.o.",
    taxId: "03000001",
    addressLine: "Obala 1",
    city: "Budva",
    postalCode: "85310",
    contactEmail: "info@hotel.example",
  };

  it("accepts a company and is idempotent", () => {
    const once = updateOrgProfileSchema.parse(company);
    expect(updateOrgProfileSchema.parse(once)).toEqual(once);
  });

  it("refuses the fields an edit must never carry: type, status, organization", () => {
    for (const extra of [
      { type: "supplier" },
      { status: "approved" },
      { organizationId: "o-x" },
    ]) {
      expect(
        updateOrgProfileSchema.safeParse({ ...company, ...extra }).success,
      ).toBe(false);
    }
  });

  it("keeps the PIB rule: 8 or 13 digits", () => {
    expect(
      updateOrgProfileSchema.safeParse({ ...company, taxId: "1234567" })
        .success,
    ).toBe(false);
    expect(
      updateOrgProfileSchema.safeParse({ ...company, taxId: "1234567890123" })
        .success,
    ).toBe(true);
  });
});
