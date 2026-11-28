/**
 * Two facts read straight from a PDF's bytes, without a PDF library (D5-A4 probe):
 * how many pages it has and which fonts are embedded in it.
 *
 * This works for the PDFs Chromium writes (its object dictionaries are plain text; only the streams
 * are compressed). It is NOT a general PDF parser — a file that packs its objects into compressed
 * object streams would give 0 pages and no fonts.
 *
 * A font counts as embedded in two ways:
 *   - "file"   its font descriptor carries the font program (/FontFile, /FontFile2, /FontFile3);
 *   - "type3"  a Type 3 font refers to the descriptor: every glyph is drawn by a small PDF procedure
 *              stored in the file. Chromium does this for VARIABLE fonts (ours is one) — measured on
 *              28.11.2026: Schibsted Grotesk arrives as Type 3 subsets, text stays selectable.
 * A descriptor with neither is only a reference to a font the viewer must have ("none").
 */

export type PdfFont = { name: string; embedding: "file" | "type3" | "none" };

// latin1 maps every byte to one character, so nothing is lost or re-interpreted.
const asText = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** Page objects: "/Type /Page", but not "/Type /Pages" (the page tree). */
export function countPdfPages(pdf: Uint8Array): number {
  return asText(pdf).match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
}

/**
 * The fonts of the file, by font descriptor, without the six-letter subset prefix
 * ("ABCDEF+Name" → "Name"). One entry per name and embedding, sorted by name.
 */
export function pdfFonts(pdf: Uint8Array): PdfFont[] {
  const descriptors = new Map<string, { name: string; hasFile: boolean }>();
  const usedByType3 = new Set<string>();

  // One indirect object per chunk: "12 0 obj << … >> endobj".
  for (const chunk of asText(pdf).split("endobj")) {
    const id = /(\d+)\s+\d+\s+obj\b/.exec(chunk)?.[1];
    if (id === undefined) continue;
    if (/\/Type\s*\/FontDescriptor/.test(chunk)) {
      const name = /\/FontName\s*\/([^\s/<>[\]()]+)/.exec(chunk)?.[1];
      if (name)
        descriptors.set(id, {
          name: name.replace(/^[A-Z]{6}\+/, ""),
          hasFile: /\/FontFile[23]?\s/.test(chunk),
        });
    } else if (/\/Subtype\s*\/Type3/.test(chunk)) {
      const descriptor = /\/FontDescriptor\s+(\d+)\s+\d+\s+R/.exec(chunk)?.[1];
      if (descriptor !== undefined) usedByType3.add(descriptor);
    }
  }

  const fonts = new Map<string, PdfFont>();
  for (const [id, { name, hasFile }] of descriptors) {
    const embedding = hasFile ? "file" : usedByType3.has(id) ? "type3" : "none";
    fonts.set(`${name}|${embedding}`, { name, embedding });
  }
  return [...fonts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "Schibsted Grotesk" matches "SchibstedGrotesk-Regular": letters and digits only, any case. */
export function hasEmbeddedFont(pdf: Uint8Array, family: string): boolean {
  const normalise = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = normalise(family);
  return pdfFonts(pdf).some(
    (font) =>
      font.embedding !== "none" && normalise(font.name).includes(wanted),
  );
}
