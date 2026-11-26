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
    saveCompanyDraft(storage, company);
    expect(loadCompanyDraft(storage)).toEqual(company);
  });

  it("never stores anything but the company fields", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, {
      ...company,
      // What a careless caller might pass along:
      name: "Ana Anić",
      email: "ana@hotel.example",
      password: "long-enough-1",
      account: { password: "long-enough-1" },
    });
    const stored = storage.items.get(COMPANY_DRAFT_KEY) ?? "";
    expect(Object.keys(JSON.parse(stored) as object).sort()).toEqual(
      Object.keys(company).sort(),
    );
    expect(stored).not.toContain("long-enough-1");
    expect(stored).not.toContain("ana@hotel.example");
  });

  it("skips values that are not text", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, { ...company, contactPhone: undefined });
    expect(loadCompanyDraft(storage)).toEqual({ ...company, contactPhone: "" });
  });

  it("does nothing without a storage, and survives one that throws", () => {
    expect(() => saveCompanyDraft(null, company)).not.toThrow();
    expect(() => saveCompanyDraft(brokenStorage, company)).not.toThrow();
  });
});

describe("loadCompanyDraft", () => {
  it("is null when nothing was saved", () => {
    expect(loadCompanyDraft(memoryStorage())).toBeNull();
    expect(loadCompanyDraft(null)).toBeNull();
    expect(loadCompanyDraft(brokenStorage)).toBeNull();
  });

  it("returns the values the shared schema produces (trimmed)", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, { ...company, city: "  Budva " });
    expect(loadCompanyDraft(storage)?.city).toBe("Budva");
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an object", JSON.stringify("text")],
    ["a field fails the schema", JSON.stringify({ ...company, taxId: "12" })],
    ["a field is missing", JSON.stringify({ ...company, city: undefined })],
    ["an unknown key", JSON.stringify({ ...company, password: "secret-123" })],
  ])("ignores and removes a draft when %s", (_case, raw) => {
    const storage = memoryStorage();
    storage.items.set(COMPANY_DRAFT_KEY, raw);
    expect(loadCompanyDraft(storage)).toBeNull();
    expect(storage.items.has(COMPANY_DRAFT_KEY)).toBe(false);
  });
});

describe("clearCompanyDraft", () => {
  it("removes the draft", () => {
    const storage = memoryStorage();
    saveCompanyDraft(storage, company);
    clearCompanyDraft(storage);
    expect(storage.items.size).toBe(0);
    expect(loadCompanyDraft(storage)).toBeNull();
  });

  it("does nothing without a storage, and survives one that throws", () => {
    expect(() => clearCompanyDraft(null)).not.toThrow();
    expect(() => clearCompanyDraft(brokenStorage)).not.toThrow();
  });
});
