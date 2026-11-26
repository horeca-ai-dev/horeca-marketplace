/**
 * The one typeface: Schibsted Grotesk (SIL Open Font License — src/app/fonts/OFL.txt), loaded from
 * the files committed in src/app/fonts/. Nothing is downloaded at build time (DESIGN.md → Typography).
 *
 * The family is split into two files the way Google Fonts serves it: `latin` (a–z, digits, €) and
 * `latin-ext` (č ć š ž đ …). Each @font-face carries its `unicode-range`, so the browser picks the
 * file per character. next/font/local produces one family per call; globals.css joins the two
 * variables into --font-app (latin-ext first: the metric-adjusted Arial fallback that comes with the
 * latin family must stay last in the list).
 *
 * Source of the files and ranges: @fontsource-variable/schibsted-grotesk 5.3.0 (variable, wght 400–900).
 */
import localFont from "next/font/local";

export const fontLatin = localFont({
  src: "./fonts/schibsted-grotesk-latin-wght-normal.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-app-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});

export const fontLatinExt = localFont({
  src: "./fonts/schibsted-grotesk-latin-ext-wght-normal.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-app-latin-ext",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});
