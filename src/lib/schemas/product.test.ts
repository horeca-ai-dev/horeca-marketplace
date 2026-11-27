import { describe, expect, it } from "vitest";
import { productStatus, productUnit } from "@/server/db/schema";
import {
  PRODUCT_STATUSES,
  PRODUCT_UNITS,
  createProductSchema,
  listProductsSchema,
  setProductStatusSchema,
  updateProductSchema,
} from "./product";

const valid = {
  sku: "RF-150",
  categoryId: "22222222-2222-4222-8222-222222222222",
  name: "Podpultni frižider",
  unit: "piece",
  minOrderQty: 6,
  orderStep: 3,
  basePriceCents: 48900,
  vatRateBps: 2100,
} as const;

describe("shared enums match the database", () => {
  it("statuses and units", () => {
    expect([...PRODUCT_STATUSES]).toEqual(productStatus.enumValues);
    expect([...PRODUCT_UNITS]).toEqual(productUnit.enumValues);
  });
});

describe("createProductSchema", () => {
  it("accepts a minimal product and fills the optional fields with null / {}", () => {
    const r = createProductSchema.parse(valid);
    expect(r).toMatchObject({
      description: null,
      brand: null,
      gtin: null,
      mpn: null,
      attributes: {},
    });
  });

  it("rejects unknown keys — no mass assignment (status, supplier, id …)", () => {
    for (const extra of [
      { status: "active" },
      { supplierOrgId: "o-other" },
      { id: "33333333-3333-4333-8333-333333333333" },
    ]) {
      expect(
        createProductSchema.safeParse({ ...valid, ...extra }).success,
      ).toBe(false);
    }
  });

  it("trims text and turns empty optional text into null", () => {
    const r = createProductSchema.parse({
      ...valid,
      name: "  Frižider  ",
      brand: "   ",
      mpn: "",
    });
    expect(r).toMatchObject({ name: "Frižider", brand: null, mpn: null });
  });

  it.each(["", " ", "has space", "-leading", "a".repeat(65), "č-1"])(
    "rejects the SKU %j",
    (sku) => {
      expect(createProductSchema.safeParse({ ...valid, sku }).success).toBe(
        false,
      );
    },
  );

  it.each(["A1", "RF-150", "a.b_c/d-9", "x".repeat(64)])(
    "accepts the SKU %j",
    (sku) => {
      expect(createProductSchema.safeParse({ ...valid, sku }).success).toBe(
        true,
      );
    },
  );

  it.each([0, -5, 1.5, 100_000_001])(
    "rejects the price %s (integer cents > 0)",
    (basePriceCents) => {
      expect(
        createProductSchema.safeParse({ ...valid, basePriceCents }).success,
      ).toBe(false);
    },
  );

  it("the minimum quantity must be a multiple of the step (like the database CHECK)", () => {
    const r = createProductSchema.safeParse({
      ...valid,
      minOrderQty: 5,
      orderStep: 3,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["minOrderQty"]);
  });

  it.each(["12345670", "123456789012", "1234567890123", "12345678901234"])(
    "accepts the GTIN %s",
    (gtin) => {
      expect(createProductSchema.safeParse({ ...valid, gtin }).success).toBe(
        true,
      );
    },
  );

  it.each(["1234567", "123456789", "12345678a", "123456789012345"])(
    "rejects the GTIN %s",
    (gtin) => {
      expect(createProductSchema.safeParse({ ...valid, gtin }).success).toBe(
        false,
      );
    },
  );

  it("rejects an unknown unit and a category that is not a UUID", () => {
    expect(
      createProductSchema.safeParse({ ...valid, unit: "barrel" }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({ ...valid, categoryId: "refrigeration" })
        .success,
    ).toBe(false);
  });

  it("attribute values are plain strings, numbers or booleans", () => {
    expect(
      createProductSchema.safeParse({
        ...valid,
        attributes: { a: 1, b: "x", c: true },
      }).success,
    ).toBe(true);
    expect(
      createProductSchema.safeParse({ ...valid, attributes: { a: { x: 1 } } })
        .success,
    ).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("has no SKU: it never changes after creation", () => {
    const editable: Record<string, unknown> = { ...valid };
    delete editable.sku;
    expect(updateProductSchema.safeParse(editable).success).toBe(true);
    expect(updateProductSchema.safeParse(valid).success).toBe(false);
  });
});

describe("setProductStatusSchema / listProductsSchema", () => {
  it("accepts only the four events", () => {
    const productId = "33333333-3333-4333-8333-333333333333";
    for (const event of ["activate", "deactivate", "archive", "restore"]) {
      expect(
        setProductStatusSchema.safeParse({ productId, event }).success,
      ).toBe(true);
    }
    expect(
      setProductStatusSchema.safeParse({ productId, event: "delete" }).success,
    ).toBe(false);
  });

  it("list: defaults, limits and unknown keys", () => {
    expect(listProductsSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(listProductsSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listProductsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listProductsSchema.safeParse({ supplierOrgId: "x" }).success).toBe(
      false,
    );
  });
});
