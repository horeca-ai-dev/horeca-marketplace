import { describe, expect, it } from "vitest";
import { closeHref, openHref, pageHref, readSort, sortHref } from "./table-url";

const PATH = "/supplier/products";

describe("readSort", () => {
  it("is null without a sort", () => {
    expect(readSort("q=kafa")).toBeNull();
  });
  it("defaults to ascending and only accepts desc as the other direction", () => {
    expect(readSort("sort=name")).toEqual({ key: "name", dir: "asc" });
    expect(readSort("sort=name&dir=desc")).toEqual({
      key: "name",
      dir: "desc",
    });
    expect(readSort("sort=name&dir=DROP")).toEqual({ key: "name", dir: "asc" });
  });
});

describe("sortHref", () => {
  it("sorts a new column ascending and keeps the filters", () => {
    expect(sortHref(PATH, "q=kafa&status=active", "price")).toBe(
      `${PATH}?q=kafa&status=active&sort=price&dir=asc`,
    );
  });
  it("toggles the same column asc → desc → asc", () => {
    expect(sortHref(PATH, "sort=price&dir=asc", "price")).toBe(
      `${PATH}?sort=price&dir=desc`,
    );
    expect(sortHref(PATH, "sort=price&dir=desc", "price")).toBe(
      `${PATH}?sort=price&dir=asc`,
    );
  });
  it("goes back to page 1 and closes the open row", () => {
    expect(sortHref(PATH, "page=3&open=abc", "name")).toBe(
      `${PATH}?sort=name&dir=asc`,
    );
  });
});

describe("pageHref", () => {
  it("keeps sort and filters, drops page for page 1", () => {
    expect(pageHref(PATH, "q=kafa&sort=name&dir=asc&page=2", 1)).toBe(
      `${PATH}?q=kafa&sort=name&dir=asc`,
    );
    expect(pageHref(PATH, "q=kafa", 3)).toBe(`${PATH}?q=kafa&page=3`);
  });
  it("closes the open row (it may not be on the new page)", () => {
    expect(pageHref(PATH, "open=abc", 2)).toBe(`${PATH}?page=2`);
  });
});

describe("openHref / closeHref", () => {
  it("opens a row and keeps everything else", () => {
    expect(openHref(PATH, "page=2&sort=name&dir=asc", "r 1")).toBe(
      `${PATH}?page=2&sort=name&dir=asc&open=r+1`,
    );
  });
  it("closes it again, back to the bare path when nothing is left", () => {
    expect(closeHref(PATH, "page=2&open=abc")).toBe(`${PATH}?page=2`);
    expect(closeHref(PATH, "open=abc")).toBe(PATH);
  });
});
