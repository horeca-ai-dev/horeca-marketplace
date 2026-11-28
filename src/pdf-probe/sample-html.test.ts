import { describe, expect, it } from "vitest";
import { buildSampleHtml, DIACRITICS_SAMPLE } from "./sample-html";

const html = buildSampleHtml({ latin: "TEFUSU4=", latinExt: "RVhU" });

describe("buildSampleHtml", () => {
  it("contains the diacritics line and the money format", () => {
    expect(html).toContain(DIACRITICS_SAMPLE);
    expect(html).toMatch(/1\.234,56\s€/);
  });

  it("embeds both font files as data URLs, each with its unicode-range", () => {
    expect(html).toContain("data:font/woff2;base64,TEFUSU4=");
    expect(html).toContain("data:font/woff2;base64,RVhU");
    expect(html.match(/@font-face/g)).toHaveLength(2);
    expect(html.match(/unicode-range:/g)).toHaveLength(2);
  });

  it("is self-contained: no URL that would need the network or the disk", () => {
    expect(html).not.toMatch(/https?:|file:|\/\//);
    expect(html.match(/url\(/g)).toHaveLength(2);
    expect(html).not.toMatch(/<(script|link|img|iframe)\b/);
  });

  it("uses the DESIGN.md colours and tabular, right-aligned amounts", () => {
    expect(html).toContain("#1F6B4A");
    expect(html).toContain("#16201B");
    expect(html).toContain("font-variant-numeric: tabular-nums");
    expect(html).toContain("size: A4");
  });
});
