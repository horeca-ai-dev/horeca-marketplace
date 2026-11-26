/**
 * The two candidate typefaces, for the /dev/style preview ONLY (downloaded from Google at build time).
 * The chosen one is committed as local files and loaded with next/font/local in the root layout in
 * D4-A1 (DESIGN.md → Typography); this file is then deleted together with the other candidate.
 *
 * Verified on 26.11.2026 against the served woff2 files: both have č ć š ž đ (latin-ext) and €
 * (latin). Schibsted needs `tabular-nums` (it has the `tnum` feature); Hanken's digits are all the
 * same width already.
 */
import { Hanken_Grotesk, Schibsted_Grotesk } from "next/font/google";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const CANDIDATES = {
  schibsted: {
    label: "Schibsted Grotesk",
    fontFamily: schibsted.style.fontFamily,
    note: "Digits are proportional by default; the tnum feature (tabular-nums) makes them equal width.",
  },
  hanken: {
    label: "Hanken Grotesk",
    fontFamily: hanken.style.fontFamily,
    note: "No tnum feature, but every digit already has the same width — columns align either way.",
  },
} as const;

export type CandidateKey = keyof typeof CANDIDATES;
