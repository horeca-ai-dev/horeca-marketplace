/**
 * The colour tokens as data, for /dev/style (swatches and ratios need the hex values on the server).
 * src/app/globals.css stays the source of truth: contrast.test.ts fails when this list and the
 * :root block there differ in any name or value.
 */
export type ColorToken = { name: string; hex: string; use: string };

export const COLOR_TOKENS: readonly ColorToken[] = [
  { name: "background", hex: "#ffffff", use: "Page" },
  { name: "surface", hex: "#f4f7f5", use: "Panels, sidebars, table header" },
  { name: "well", hex: "#eaefec", use: "Behind every product photo" },
  { name: "selected", hex: "#eef5f1", use: "Selected row / option" },
  { name: "border", hex: "#d3dbd6", use: "1 px separators" },
  { name: "input", hex: "#7c8a82", use: "Borders of controls" },
  { name: "foreground", hex: "#16201b", use: "Text" },
  { name: "muted-foreground", hex: "#55625b", use: "Secondary text" },
  { name: "primary", hex: "#1f6b4a", use: "Primary button, links, active" },
  { name: "primary-hover", hex: "#18573c", use: "Primary button, hover" },
  { name: "primary-foreground", hex: "#ffffff", use: "Label on solid fills" },
  { name: "ring", hex: "#1f6b4a", use: "Focus ring" },
  { name: "destructive", hex: "#b3261e", use: "Destructive button" },
  { name: "destructive-hover", hex: "#951f18", use: "Destructive, hover" },
  { name: "positive-bg", hex: "#e2f1e9", use: "Badge tint: positive" },
  { name: "positive-text", hex: "#17593d", use: "Badge text: positive" },
  { name: "attention-bg", hex: "#fbefd3", use: "Badge tint: attention" },
  { name: "attention-text", hex: "#734c00", use: "Badge text: attention" },
  { name: "negative-bg", hex: "#fbe5e2", use: "Badge tint: negative" },
  {
    name: "negative-text",
    hex: "#9e241c",
    use: "Badge text: negative, errors",
  },
  { name: "neutral-bg", hex: "#eaefec", use: "Badge tint: neutral" },
  { name: "neutral-text", hex: "#3f4b45", use: "Badge text: neutral" },
  { name: "progress-bg", hex: "#e3ecf1", use: "Badge tint: in progress" },
  { name: "progress-text", hex: "#2f4f63", use: "Badge text: in progress" },
];

/** Hex value of a token; throws on an unknown name (a typo must not render as "undefined"). */
export function tokenHex(name: string): string {
  const token = COLOR_TOKENS.find((t) => t.name === name);
  if (!token) throw new Error(`Unknown colour token: ${name}`);
  return token.hex;
}
