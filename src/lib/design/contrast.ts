/**
 * WCAG 2.x contrast for the design tokens (D4-A0, DESIGN.md → "Colour tokens").
 *
 * CONTRAST_PAIRS is the complete list of foreground / background combinations the design allows.
 * contrast.test.ts reads the hex values from src/app/globals.css and checks every pair against its
 * minimum; /dev/style prints the same ratios. A combination that is not listed here is not allowed.
 */

/** Relative luminance of a `#rrggbb` colour (WCAG 2.x definition). */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Contrast ratio between two `#rrggbb` colours: 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Reads every `--name: #rrggbb;` declaration from a stylesheet's text. */
export function parseHexTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    tokens[m[1]!] = m[2]!.toLowerCase();
  }
  return tokens;
}

/** 4.5 = text (WCAG AA, also our minimum for large text); 3 = borders of controls and the focus ring. */
export type ContrastPair = {
  fg: string;
  bg: string;
  min: 4.5 | 3;
  use: string;
};

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    fg: "foreground",
    bg: "background",
    min: 4.5,
    use: "Body text on the page",
  },
  { fg: "foreground", bg: "surface", min: 4.5, use: "Body text on panels" },
  { fg: "foreground", bg: "well", min: 4.5, use: "Text on the image well" },
  { fg: "foreground", bg: "selected", min: 4.5, use: "Text in a selected row" },
  {
    fg: "muted-foreground",
    bg: "background",
    min: 4.5,
    use: "Secondary text on the page",
  },
  {
    fg: "muted-foreground",
    bg: "surface",
    min: 4.5,
    use: "Secondary text on panels",
  },
  {
    fg: "muted-foreground",
    bg: "well",
    min: 4.5,
    use: "Secondary text on the well",
  },
  {
    fg: "muted-foreground",
    bg: "selected",
    min: 4.5,
    use: "Secondary text, selected row",
  },
  { fg: "primary", bg: "background", min: 4.5, use: "Link on the page" },
  { fg: "primary", bg: "surface", min: 4.5, use: "Link on panels" },
  { fg: "primary", bg: "selected", min: 4.5, use: "Link in a selected row" },
  {
    fg: "primary-foreground",
    bg: "primary",
    min: 4.5,
    use: "Primary button label",
  },
  {
    fg: "primary-foreground",
    bg: "primary-hover",
    min: 4.5,
    use: "Primary button, hover",
  },
  {
    fg: "primary-foreground",
    bg: "destructive",
    min: 4.5,
    use: "Destructive button label",
  },
  {
    fg: "primary-foreground",
    bg: "destructive-hover",
    min: 4.5,
    use: "Destructive button, hover",
  },
  {
    fg: "negative-text",
    bg: "background",
    min: 4.5,
    use: "Error text under a field",
  },
  { fg: "positive-text", bg: "positive-bg", min: 4.5, use: "Badge: positive" },
  {
    fg: "attention-text",
    bg: "attention-bg",
    min: 4.5,
    use: "Badge: attention",
  },
  { fg: "negative-text", bg: "negative-bg", min: 4.5, use: "Badge: negative" },
  { fg: "neutral-text", bg: "neutral-bg", min: 4.5, use: "Badge: neutral" },
  {
    fg: "progress-text",
    bg: "progress-bg",
    min: 4.5,
    use: "Badge: in progress",
  },
  { fg: "input", bg: "background", min: 3, use: "Input border on the page" },
  { fg: "input", bg: "surface", min: 3, use: "Input border on panels" },
  { fg: "ring", bg: "background", min: 3, use: "Focus ring on the page" },
  { fg: "ring", bg: "surface", min: 3, use: "Focus ring on panels" },
];
