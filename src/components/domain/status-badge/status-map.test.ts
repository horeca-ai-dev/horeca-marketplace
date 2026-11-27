/**
 * StatusBadge's map must cover every status value exactly (DESIGN.md → Badges): a new enum value
 * without a badge fails here instead of rendering a raw key on a screen.
 */
import { describe, expect, it } from "vitest";
import messages from "../../../../messages/sr-Latn-ME.json";
import {
  orgStatus,
  orderPaymentStatus,
  orderStatus,
  productStatus,
  purchaseMode,
  subOrderStatus,
  supplierSubmission,
} from "@/server/db/schema";
import {
  CARD_PAYMENT_STATUSES,
  CONTRACT_STATUSES,
  STATUS_MAP,
  STOCK_STATUSES,
  TONES,
  type StatusEntity,
} from "./status-map";

/** Source of truth per entity: the schema enum where the table exists, else the typed union (TODO in status-map.ts). */
const SOURCES: Record<StatusEntity, readonly string[]> = {
  subOrder: subOrderStatus.enumValues,
  order: orderStatus.enumValues,
  orderPayment: orderPaymentStatus.enumValues,
  cardPayment: CARD_PAYMENT_STATUSES,
  contract: CONTRACT_STATUSES,
  purchaseMode: purchaseMode.enumValues,
  submission: supplierSubmission.enumValues,
  product: productStatus.enumValues,
  supplier: orgStatus.enumValues,
  stock: STOCK_STATUSES,
};

const catalogue = messages.status as Record<string, Record<string, string>>;

describe("STATUS_MAP", () => {
  it("has an entry for every entity", () => {
    expect(Object.keys(STATUS_MAP).sort()).toEqual(Object.keys(SOURCES).sort());
  });

  for (const [entity, values] of Object.entries(SOURCES)) {
    const map = STATUS_MAP[entity as StatusEntity] as Record<
      string,
      { tone: string } | { hidden: true }
    >;

    it(`${entity}: maps exactly the values of its source`, () => {
      expect(Object.keys(map).sort()).toEqual([...values].sort());
    });

    it(`${entity}: every shown value has a known tone and a catalogue text`, () => {
      for (const value of values) {
        const entry = map[value];
        if ("hidden" in entry) continue;
        expect(TONES).toContain(entry.tone);
        expect(catalogue[entity]?.[value], `status.${entity}.${value}`).toEqual(
          expect.any(String),
        );
      }
    });
  }
});
