import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, contrastRatio, parseHexTokens } from "./contrast";
import { COLOR_TOKENS } from "./tokens";

const css = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);
// Only the :root block: the @theme block below it maps names, it does not define colours.
const tokens = parseHexTokens(css.slice(0, css.indexOf("@theme inline {")));

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    // #767676 on white is the well-known "just passes AA" grey (4.54:1).
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("does not depend on the argument order", () => {
    expect(contrastRatio("#1f6b4a", "#ffffff")).toBe(
      contrastRatio("#ffffff", "#1f6b4a"),
    );
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(() => contrastRatio("#fff", "#000000")).toThrow();
  });
});

describe("design tokens in globals.css", () => {
  it.each(CONTRAST_PAIRS)("$fg on $bg ≥ $min:1 ($use)", ({ fg, bg, min }) => {
    const fgHex = tokens[fg];
    const bgHex = tokens[bg];
    expect(fgHex, `--${fg} is not defined in globals.css`).toBeDefined();
    expect(bgHex, `--${bg} is not defined in globals.css`).toBeDefined();
    expect(contrastRatio(fgHex!, bgHex!)).toBeGreaterThanOrEqual(min);
  });

  it("tokens.ts lists exactly the colours of globals.css", () => {
    expect(
      Object.fromEntries(COLOR_TOKENS.map((t) => [t.name, t.hex])),
    ).toEqual(tokens);
  });

  it("keeps the brand green the brief started from", () => {
    expect(tokens.primary).toBe("#1f6b4a");
  });
});
