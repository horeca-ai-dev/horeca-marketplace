import { describe, expect, it } from "vitest";
import {
  COMPANY_DRAFT_KEY,
  clearCompanyDraft,
  loadCompanyDraft,
  saveCompanyDraft,
  type DraftStorage,
} from "./company-draft";

function memoryStorage(): DraftStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** A storage that refuses everything (blocked site data, full quota). */
const brokenStorage: DraftStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const USER = "user-ana";
const OTHER_USER = "user-marko";

const company = {
  legalName: "Hotel Budva d.o.o.",
  taxId: "02345678",
  addressLine: "Jadranski put 1",
  city: "Budva",
  postalCode: "85310",
  contactEmail: "nabavka@hotel.example",
  contactPhone: "",
};

describe("saveCompanyDraft", () => {
  it("stores the company fields and loads them back", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, company);
    expect(loadCompanyDraft(storage, USER)).toEqual(company);
  });

  it("never stores anything but the company fields", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, {
      ...company,
      // What a careless caller might pass along:
      name: "Ana Anić",
      email: "ana@hotel.example",
      password: "long-enough-1",
      account: { password: "long-enough-1" },
    });
    const stored = storage.items.get(COMPANY_DRAFT_KEY) ?? "";
    expect(JSON.parse(stored)).toEqual({ userId: USER, company });
    expect(stored).not.toContain("long-enough-1");
    expect(stored).not.toContain("ana@hotel.example");
  });

  it("skips values that are not text", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, { ...company, contactPhone: undefined });
    expect(loadCompanyDraft(storage, USER)).toEqual({
      ...company,
      contactPhone: "",
    });
  });

  it("does nothing without a storage, and survives one that throws", () => {
    expect(() => saveCompanyDraft(null, USER, company)).not.toThrow();
    expect(() => saveCompanyDraft(brokenStorage, USER, company)).not.toThrow();
  });
});

describe("loadCompanyDraft", () => {
  it("is null when nothing was saved", () => {
    expect(loadCompanyDraft(memoryStorage(), USER)).toBeNull();
    expect(loadCompanyDraft(null, USER)).toBeNull();
    expect(loadCompanyDraft(brokenStorage, USER)).toBeNull();
  });

  it("returns the values the shared schema produces (trimmed)", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, { ...company, city: "  Budva " });
    expect(loadCompanyDraft(storage, USER)?.city).toBe("Budva");
  });

  const stored = (company: object, userId: unknown = USER) =>
    JSON.stringify({ userId, company });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", JSON.stringify("text")],
    ["a field fails the schema", stored({ ...company, taxId: "12" })],
    ["a field is missing", stored({ ...company, city: undefined })],
    ["an unknown company key", stored({ ...company, password: "secret-123" })],
    [
      "an unknown top-level key",
      JSON.stringify({ userId: USER, company, x: 1 }),
    ],
    ["no owner", JSON.stringify({ company })],
    ["an empty owner", stored(company, "")],
    ["the old format without an owner", JSON.stringify(company)],
  ])("ignores and removes a draft when %s", (_case, raw) => {
    const storage = memoryStorage();
    storage.items.set(COMPANY_DRAFT_KEY, raw);
    expect(loadCompanyDraft(storage, USER)).toBeNull();
    expect(storage.items.has(COMPANY_DRAFT_KEY)).toBe(false);
  });
});

describe("loadCompanyDraft — whose draft it is", () => {
  it("does not pre-fill another user's draft, and deletes it", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, company);

    expect(loadCompanyDraft(storage, OTHER_USER)).toBeNull();
    expect(storage.items.has(COMPANY_DRAFT_KEY)).toBe(false);
    // Deleted for good: the owner does not get it back either.
    expect(loadCompanyDraft(storage, USER)).toBeNull();
  });

  it("keeps the draft for its owner until it is cleared", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, company);

    expect(loadCompanyDraft(storage, USER)).toEqual(company);
    expect(loadCompanyDraft(storage, USER)).toEqual(company);
  });

  it("a newer draft replaces an older one from another user", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, OTHER_USER, { ...company, city: "Bar" });
    saveCompanyDraft(storage, USER, company);

    expect(loadCompanyDraft(storage, USER)).toEqual(company);
  });
});

describe("clearCompanyDraft", () => {
  it("removes the draft", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, USER, company);
    clearCompanyDraft(storage);
    expect(storage.items.size).toBe(0);
    expect(loadCompanyDraft(storage, USER)).toBeNull();
  });

  it("does nothing without a storage, and survives one that throws", () => {
    expect(() => clearCompanyDraft(null)).not.toThrow();
    expect(() => clearCompanyDraft(brokenStorage)).not.toThrow();
  });
});
