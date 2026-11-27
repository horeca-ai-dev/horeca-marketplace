import { describe, expect, it } from "vitest";
import {
  IMAGE_WIDTHS,
  MAX_KEY_LENGTH,
  assertValidKey,
  assertValidPrefix,
  invoiceKey,
  productImageKey,
  productImagePrefix,
  productOriginalKey,
  type ImageWidth,
} from "./keys";

const ID = "5f0c1a52-9d0e-4f43-8b1c-2a6f7e3d9c10";

describe("key builders (decision 013 convention)", () => {
  it("products/<image id>/original and the three WebP sizes", () => {
    expect(productOriginalKey(ID)).toBe(`products/${ID}/original`);
    expect(IMAGE_WIDTHS.map((w) => productImageKey(ID, w))).toEqual([
      `products/${ID}/320.webp`,
      `products/${ID}/640.webp`,
      `products/${ID}/1280.webp`,
    ]);
    expect(productImagePrefix(ID)).toBe(`products/${ID}/`);
  });

  it("invoices/<order id>.pdf", () => {
    expect(invoiceKey(ID)).toBe(`invoices/${ID}.pdf`);
  });

  it("lower-cases the UUID, so one image has one key whatever the caller sent", () => {
    expect(productOriginalKey(ID.toUpperCase())).toBe(productOriginalKey(ID));
  });

  it.each([
    "",
    "not-a-uuid",
    `${ID}/../x`,
    `${ID}x`,
    "../etc/passwd",
    `${ID} `,
  ])("refuses the id %j", (id) => {
    expect(() => productOriginalKey(id)).toThrow("Invalid storage key.");
    expect(() => invoiceKey(id)).toThrow("Invalid storage key.");
  });

  it("refuses a width we do not render", () => {
    expect(() => productImageKey(ID, 500 as ImageWidth)).toThrow(
      "Invalid storage key.",
    );
  });
});

describe("assertValidKey", () => {
  it.each([
    "a",
    "products/x/original",
    "invoices/a.b-c_d.pdf",
    "tests/ab12/obj-1.bin",
    "a".repeat(MAX_KEY_LENGTH),
  ])("accepts %j", (key) => {
    expect(assertValidKey(key)).toBe(key);
  });

  it.each([
    "",
    "/leading",
    "trailing/",
    "double//slash",
    "a/../b",
    "..",
    "a/./b",
    ".hidden",
    "a/.hidden",
    "with space",
    "tab\tchar",
    "line\nbreak",
    "back\\slash",
    "percent%20",
    "question?x=1",
    "hash#x",
    "č",
    "a".repeat(MAX_KEY_LENGTH + 1),
  ])("refuses %j", (key) => {
    expect(() => assertValidKey(key)).toThrow("Invalid storage key.");
  });

  it("refuses a value that is not a string", () => {
    expect(() => assertValidKey(undefined as unknown as string)).toThrow();
    expect(() => assertValidKey(42 as unknown as string)).toThrow();
  });
});

describe("assertValidPrefix (list)", () => {
  it("accepts a prefix with or without a trailing slash", () => {
    expect(assertValidPrefix("products/")).toBe("products/");
    expect(assertValidPrefix("products/abc")).toBe("products/abc");
  });

  it("refuses an empty prefix: a bug must not be able to list the whole bucket", () => {
    expect(() => assertValidPrefix("")).toThrow("Invalid storage key.");
    expect(() => assertValidPrefix("/")).toThrow("Invalid storage key.");
  });

  it("refuses the same bad characters as a key", () => {
    expect(() => assertValidPrefix("../")).toThrow("Invalid storage key.");
    expect(() => assertValidPrefix("a b/")).toThrow("Invalid storage key.");
  });
});
