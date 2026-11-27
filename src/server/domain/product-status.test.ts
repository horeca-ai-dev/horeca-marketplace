import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENTS,
  PRODUCT_STATUSES,
  type ProductEvent,
  type ProductStatusValue,
} from "@/lib/schemas/product";
import { Conflict } from "./errors";
import { transitionProduct } from "./product-status";

/** Every legal change, written out; everything else must be refused. */
const LEGAL: [ProductStatusValue, ProductEvent, ProductStatusValue][] = [
  ["draft", "activate", "active"],
  ["draft", "archive", "archived"],
  ["active", "deactivate", "draft"],
  ["active", "archive", "archived"],
  ["archived", "restore", "draft"],
];

describe("transitionProduct", () => {
  it.each(LEGAL)("%s --%s--> %s", (from, event, to) => {
    expect(transitionProduct(from, event)).toBe(to);
  });

  const illegal = PRODUCT_STATUSES.flatMap((from) =>
    PRODUCT_EVENTS.filter(
      (event) => !LEGAL.some(([f, e]) => f === from && e === event),
    ).map((event) => [from, event] as const),
  );

  it("covers every combination (3 statuses × 4 events = 5 legal + 7 illegal)", () => {
    expect(LEGAL.length + illegal.length).toBe(
      PRODUCT_STATUSES.length * PRODUCT_EVENTS.length,
    );
    expect(illegal).toHaveLength(7);
  });

  it.each(illegal)("%s --%s--> is a Conflict (409)", (from, event) => {
    expect(() => transitionProduct(from, event)).toThrow(Conflict);
  });

  it("never restores straight to active", () => {
    expect(transitionProduct("archived", "restore")).toBe("draft");
    expect(() => transitionProduct("archived", "activate")).toThrow(Conflict);
  });

  it("says in plain words what was refused", () => {
    expect(() => transitionProduct("archived", "archive")).toThrow(
      "A archived product cannot be archived.",
    );
  });
});
