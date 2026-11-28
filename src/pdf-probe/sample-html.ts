/**
 * The sample page of the PDF probe (D5-A4): one A4 pro-forma look-alike that exercises what the real
 * invoice (D13-A1) depends on — our typeface embedded from the local files, č ć š ž đ, tabular
 * right-aligned amounts in the "1.234,56 €" format, and the DESIGN.md colours.
 *
 * Pure: fonts come in as base64 strings, the result is one self-contained HTML document (no URL
 * other than `data:`), so it renders with the network blocked.
 *
 * The wording is hard-coded here on purpose (like the /dev/style specimen): this is a throwaway
 * probe, not UI. The real template takes its text from the next-intl catalogues.
 * The amounts are fixed display values in cents — nothing is calculated (CLAUDE.md rule 7).
 */
import { formatMoney } from "@/lib/format";

/** The two subset files of Schibsted Grotesk (src/app/fonts/), base64-encoded woff2. */
export type ProbeFonts = { latin: string; latinExt: string };

/** The line the task asks for; the probe checks nothing about it — a human looks at the PDF. */
export const DIACRITICS_SAMPLE = "č ć š ž đ Č Ć Š Ž Đ";

// The same ranges as src/app/fonts.ts (source: @fontsource-variable/schibsted-grotesk 5.3.0).
const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT_RANGE =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** The family name in the page's CSS. The name inside the PDF comes from the font file itself. */
export const PROBE_FONT_FAMILY = "Schibsted Grotesk";

// DESIGN.md → Colour tokens.
const COLOR = {
  background: "#FFFFFF",
  surface: "#F4F7F5",
  border: "#D3DBD6",
  foreground: "#16201B",
  muted: "#55625B",
  primary: "#1F6B4A",
  attentionBg: "#FBEFD3",
  attentionText: "#734C00",
} as const;

type Line = {
  name: string;
  sku: string;
  quantity: string;
  unitNetCents: number;
  vatPercent: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

const LINES: Line[] = [
  {
    name: "Maslinovo ulje, ekstra djevičansko 5 l",
    sku: "ULJ-0005",
    quantity: "4 kom",
    unitNetCents: 30864,
    vatPercent: 21,
    netCents: 123456,
    vatCents: 25926,
    grossCents: 149382,
  },
  {
    name: "Brašno pšenično T-500, džak 25 kg",
    sku: "BRA-0500",
    quantity: "10 kom",
    unitNetCents: 1450,
    vatPercent: 7,
    netCents: 14500,
    vatCents: 1015,
    grossCents: 15515,
  },
  {
    name: "Šećer kristal, vreća 50 kg",
    sku: "ŠEĆ-0050",
    quantity: "2 kom",
    unitNetCents: 4200,
    vatPercent: 21,
    netCents: 8400,
    vatCents: 1764,
    grossCents: 10164,
  },
  {
    name: "Sok od šljive i đumbira 1 l",
    sku: "SOK-0101",
    quantity: "24 kom",
    unitNetCents: 185,
    vatPercent: 21,
    netCents: 4440,
    vatCents: 932,
    grossCents: 5372,
  },
];

const VAT_SUMMARY = [
  { vatPercent: 21, baseCents: 136296, vatCents: 28622 },
  { vatPercent: 7, baseCents: 14500, vatCents: 1015 },
];

const TOTAL = { netCents: 150796, vatCents: 29637, grossCents: 180433 };

const money = (cents: number) => formatMoney(BigInt(cents));

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fontFace(base64: string, unicodeRange: string): string {
  return `@font-face {
  font-family: "${PROBE_FONT_FAMILY}";
  font-style: normal;
  font-weight: 400 900;
  src: url("data:font/woff2;base64,${base64}") format("woff2");
  unicode-range: ${unicodeRange};
}`;
}

export function buildSampleHtml(fonts: ProbeFonts): string {
  const lineRows = LINES.map(
    (line) => `<tr>
  <td>${escapeHtml(line.name)}<br><span class="muted">${escapeHtml(line.sku)}</span></td>
  <td class="num">${escapeHtml(line.quantity)}</td>
  <td class="num">${money(line.unitNetCents)}</td>
  <td class="num">${line.vatPercent} %</td>
  <td class="num">${money(line.netCents)}</td>
  <td class="num">${money(line.vatCents)}</td>
  <td class="num">${money(line.grossCents)}</td>
</tr>`,
  ).join("\n");

  const vatRows = VAT_SUMMARY.map(
    (row) => `<tr>
  <td>PDV ${row.vatPercent} %</td>
  <td class="num">${money(row.baseCents)}</td>
  <td class="num">${money(row.vatCents)}</td>
</tr>`,
  ).join("\n");

  return `<!doctype html>
<html lang="sr-Latn-ME">
<head>
<meta charset="utf-8">
<title>Profaktura PF-2026-000001 (test)</title>
<style>
${fontFace(fonts.latin, LATIN_RANGE)}
${fontFace(fonts.latinExt, LATIN_EXT_RANGE)}
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "${PROBE_FONT_FAMILY}";
  font-size: 10pt;
  line-height: 1.45;
  color: ${COLOR.foreground};
  background: ${COLOR.background};
}
h1 { font-size: 20pt; font-weight: 700; margin: 0; color: ${COLOR.primary}; }
h2 { font-size: 11pt; font-weight: 600; margin: 18pt 0 6pt; }
p { margin: 0; }
.muted { color: ${COLOR.muted}; font-size: 8.5pt; }
.head { display: flex; justify-content: space-between; align-items: flex-start; }
.notice {
  display: inline-block; margin-top: 6pt; padding: 3pt 8pt; border-radius: 4pt;
  background: ${COLOR.attentionBg}; color: ${COLOR.attentionText}; font-weight: 600; font-size: 9pt;
}
.parties { display: flex; gap: 24pt; margin-top: 18pt; }
.parties > div { flex: 1; padding: 10pt; background: ${COLOR.surface}; border: 1px solid ${COLOR.border}; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th {
  text-align: left; font-weight: 500; font-size: 9pt; padding: 6pt 8pt;
  background: ${COLOR.surface}; border-bottom: 1px solid ${COLOR.border};
}
td { padding: 6pt 8pt; border-bottom: 1px solid ${COLOR.border}; vertical-align: top; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.summary { display: flex; justify-content: flex-end; margin-top: 12pt; }
.summary table { width: 62%; }
.total td { font-weight: 700; font-size: 12pt; border-bottom: 2px solid ${COLOR.primary}; }
.specimen { margin-top: 20pt; padding: 10pt; border: 1px solid ${COLOR.border}; }
.specimen .big { font-size: 22pt; font-weight: 600; letter-spacing: 0.02em; }
.weights span { margin-right: 12pt; }
</style>
</head>
<body>
<div class="head">
  <div>
    <h1>PROFAKTURA</h1>
    <p class="notice">PRO-FORMA — nije fiskalni račun</p>
  </div>
  <div style="text-align: right">
    <p><strong>PF-2026-000001</strong></p>
    <p class="muted">Datum izdavanja: 28.11.2026</p>
    <p class="muted">Rok plaćanja: 06.12.2026</p>
  </div>
</div>

<div class="parties">
  <div>
    <p class="muted">Izdavalac</p>
    <p><strong>HoReCa Tržnica d.o.o.</strong></p>
    <p>Ulica slobode 12, 81000 Podgorica</p>
    <p class="muted">PIB: 00000000 · Žiro račun: 000-0000000000000-00</p>
  </div>
  <div>
    <p class="muted">Kupac</p>
    <p><strong>Restoran „Žuta kuća" d.o.o.</strong></p>
    <p>Njegoševa 5, 85310 Budva</p>
    <p class="muted">PIB: 00000000</p>
  </div>
</div>

<h2>Dobavljač: Đurđević Čačak Šped d.o.o.</h2>
<table>
  <thead>
    <tr>
      <th>Proizvod</th>
      <th class="num">Količina</th>
      <th class="num">Cijena (neto)</th>
      <th class="num">PDV</th>
      <th class="num">Neto</th>
      <th class="num">Iznos PDV-a</th>
      <th class="num">Ukupno</th>
    </tr>
  </thead>
  <tbody>
${lineRows}
  </tbody>
</table>

<div class="summary">
  <table>
    <thead>
      <tr><th>Stopa</th><th class="num">Osnovica</th><th class="num">PDV</th></tr>
    </thead>
    <tbody>
${vatRows}
      <tr><td>Ukupno neto</td><td class="num"></td><td class="num">${money(TOTAL.netCents)}</td></tr>
      <tr><td>Ukupno PDV</td><td class="num"></td><td class="num">${money(TOTAL.vatCents)}</td></tr>
      <tr class="total"><td>Za plaćanje</td><td class="num"></td><td class="num">${money(TOTAL.grossCents)}</td></tr>
    </tbody>
  </table>
</div>

<div class="specimen">
  <p class="muted">Provjera slova i težina fonta (${PROBE_FONT_FAMILY})</p>
  <p class="big">${DIACRITICS_SAMPLE}</p>
  <p class="weights">
    <span style="font-weight: 400">400 čćšžđ 1.234,56 €</span>
    <span style="font-weight: 500">500 čćšžđ 1.234,56 €</span>
    <span style="font-weight: 600">600 čćšžđ 1.234,56 €</span>
    <span style="font-weight: 700">700 čćšžđ 1.234,56 €</span>
  </p>
</div>
</body>
</html>`;
}
