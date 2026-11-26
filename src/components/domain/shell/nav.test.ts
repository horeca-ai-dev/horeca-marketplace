import { describe, expect, it } from "vitest";
import messages from "../../../../messages/sr-Latn-ME.json";
import { type Area, AREAS, isActive } from "./nav";

const areas = Object.keys(AREAS) as Area[];

/** "nav.buyer.orders" → the text in the catalogue, or undefined. */
function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe("navigation entries", () => {
  it.each(areas)("%s: every entry has a text in the catalogue", (area) => {
    for (const entry of AREAS[area].nav) {
      expect(lookup(entry.labelKey), entry.labelKey).toEqual(
        expect.any(String),
      );
    }
    expect(lookup(AREAS[area].orgTypeKey)).toEqual(expect.any(String));
  });

  it.each(areas)("%s: starts with the home page, stays in its area", (area) => {
    const { home, nav } = AREAS[area];
    expect(nav[0]?.href).toBe(home);
    for (const entry of nav.slice(1)) {
      expect(entry.href.startsWith(`${home}/`), entry.href).toBe(true);
    }
    expect(new Set(nav.map((e) => e.href)).size).toBe(nav.length);
  });

  it("the catalogue has no navigation text without an entry", () => {
    const used = new Set(
      areas.flatMap((area) => AREAS[area].nav.map((e) => e.labelKey as string)),
    );
    const inCatalogue = Object.entries(messages.nav).flatMap(([area, labels]) =>
      Object.keys(labels).map((key) => `nav.${area}.${key}`),
    );
    expect(inCatalogue.filter((key) => !used.has(key))).toEqual([]);
  });
});

describe("isActive", () => {
  it("marks the home entry only on the home page itself", () => {
    expect(isActive("buyer", "/buyer", "/buyer")).toBe(true);
    expect(isActive("buyer", "/buyer", "/buyer/orders")).toBe(false);
  });

  it("keeps an entry active on the pages below it", () => {
    expect(isActive("buyer", "/buyer/orders", "/buyer/orders")).toBe(true);
    expect(isActive("buyer", "/buyer/orders", "/buyer/orders/123")).toBe(true);
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(isActive("admin", "/admin/orders", "/admin/orders-export")).toBe(
      false,
    );
  });
});
