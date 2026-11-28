import { describe, expect, it } from "vitest";
import { countPdfPages, hasEmbeddedFont, pdfFonts } from "./pdf-info";

const pdf = (...objects: string[]) =>
  Buffer.from(
    `%PDF-1.4\n${objects.map((body, i) => `${i + 1} 0 obj\n${body}\nendobj`).join("\n")}\n%%EOF`,
    "latin1",
  );

const PAGES = "<</Type /Pages /Kids [2 0 R] /Count 1>>";
const PAGE = "<</Type /Page /Parent 1 0 R>>";

describe("countPdfPages", () => {
  it("counts page objects, not the page tree", () => {
    expect(countPdfPages(pdf(PAGES, PAGE))).toBe(1);
    expect(countPdfPages(pdf(PAGES, PAGE, "<</Type/Page>>"))).toBe(2);
  });

  it("is 0 for something that is not a PDF", () => {
    expect(countPdfPages(Buffer.from("hello"))).toBe(0);
  });
});

describe("pdfFonts", () => {
  it("finds a font whose program is in the file and strips the subset prefix", () => {
    const file = pdf(
      "<</Type /FontDescriptor\n/FontName /ABCDEF+SchibstedGrotesk-Regular\n/FontFile2 9 0 R >>",
    );
    expect(pdfFonts(file)).toEqual([
      { name: "SchibstedGrotesk-Regular", embedding: "file" },
    ]);
    expect(hasEmbeddedFont(file, "Schibsted Grotesk")).toBe(true);
  });

  it("counts a Type 3 font as embedded (what Chromium writes for a variable font)", () => {
    const file = pdf(
      "<</Type /FontDescriptor\n/FontName /AAAAAA+SchibstedGrotesk-Regular\n/Flags 4>>",
      "<</Type /Font\n/Subtype /Type3\n/CharProcs <</g0 5 0 R>>\n/FontDescriptor 1 0 R>>",
      "<</Type /FontDescriptor\n/FontName /BAAAAA+SchibstedGrotesk-Regular\n/Flags 4>>",
      "<</Type /Font\n/Subtype /Type3\n/FontDescriptor 3 0 R>>",
    );
    expect(pdfFonts(file)).toEqual([
      { name: "SchibstedGrotesk-Regular", embedding: "type3" },
    ]);
    expect(hasEmbeddedFont(file, "Schibsted Grotesk")).toBe(true);
  });

  it("does not count a descriptor without a font program", () => {
    const file = pdf(
      "<</Type /FontDescriptor /FontName /SchibstedGrotesk-Regular /Flags 4>>",
    );
    expect(pdfFonts(file)).toEqual([
      { name: "SchibstedGrotesk-Regular", embedding: "none" },
    ]);
    expect(hasEmbeddedFont(file, "Schibsted Grotesk")).toBe(false);
  });

  it("reports the fallback face when ours was not used", () => {
    const file = pdf(
      "<</Type /FontDescriptor /FontName /ABCDEF+DejaVuSans /FontFile2 9 0 R >>",
    );
    expect(hasEmbeddedFont(file, "Schibsted Grotesk")).toBe(false);
    expect(pdfFonts(file)[0]?.name).toBe("DejaVuSans");
  });
});
