/**
 * PDF probe (D5-A4) — `node dist/pdf-probe.mjs [output.pdf]`, run by hand inside the worker container
 * (README → "PDF probe"). Not a service and not a job: a one-off check that the image can render our
 * invoice PDFs before D13 depends on it.
 *
 * It launches the image's Chromium (Playwright's headless shell, PLAYWRIGHT_BROWSERS_PATH), renders
 * the one-page sample from src/pdf-probe/sample-html.ts with OUR font embedded, writes the PDF and
 * prints ONE JSON line: size, page count, embedded fonts, duration and peak memory.
 * Exit code 0 only when the PDF has exactly one page and our font is embedded in it.
 *
 * It reads no configuration and touches neither the database nor storage. It only bundles: the
 * fonts are imported as base64 by esbuild (scripts/build-entries.mjs), so `tsx src/pdf-probe.ts`
 * does not work — run `pnpm build:entries && node dist/pdf-probe.mjs`.
 */
import { writeFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import latinExt from "@/app/fonts/schibsted-grotesk-latin-ext-wght-normal.woff2";
import latin from "@/app/fonts/schibsted-grotesk-latin-wght-normal.woff2";
import { startMemorySampler } from "@/pdf-probe/memory";
import { countPdfPages, hasEmbeddedFont, pdfFonts } from "@/pdf-probe/pdf-info";
import { buildSampleHtml, PROBE_FONT_FAMILY } from "@/pdf-probe/sample-html";

const DEFAULT_OUTPUT = "/tmp/horeca-pdf-probe.pdf";
const LAUNCH_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 15_000;

// The one JSON line goes to stdout directly: the logger would wrap it in its own fields.
const print = (result: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify(result)}\n`);

async function main() {
  const output = process.argv[2] ?? DEFAULT_OUTPUT;
  const startedAt = performance.now();
  const sampler = startMemorySampler();
  let browser: Browser | undefined;
  let blockedRequests = 0;

  try {
    browser = await chromium.launch({
      headless: true,
      timeout: LAUNCH_TIMEOUT_MS,
      // Chromium's sandbox needs user namespaces (or a setuid helper), which the unprivileged `node`
      // user does not get under Docker's default seccomp profile — with it on, Chromium refuses to
      // start. Turning it off is acceptable HERE because the page is not web content: it is HTML we
      // build ourselves, and every network request is blocked below, so nothing foreign ever
      // reaches the renderer. Do not reuse this launch for pages that load anything from outside.
      chromiumSandbox: false,
      args: [
        // Docker gives /dev/shm 64 MB; Chromium would crash on a large page. Use /tmp instead.
        "--disable-dev-shm-usage",
        // No GPU in the container; skips the GPU process (less memory).
        "--disable-gpu",
      ],
    });
    const launchMs = performance.now() - startedAt;
    const chromiumVersion = browser.version();

    const context = await browser.newContext({ offline: true });
    // Second lock on the network: abort whatever the page asks for. `data:` URLs (our fonts) are
    // not requests and never reach this handler. The count is reported and should stay 0.
    await context.route("**/*", (route) => {
      blockedRequests += 1;
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    await page.setContent(buildSampleHtml({ latin, latinExt }), {
      waitUntil: "load",
    });
    // Rendering before the fonts are decoded would print the fallback face.
    const fontFacesLoaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((face) => face.status === "loaded")
        .length;
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await browser.close();
    browser = undefined;
    await writeFile(output, pdf);

    const pages = countPdfPages(pdf);
    const fontEmbedded = hasEmbeddedFont(pdf, PROBE_FONT_FAMILY);
    print({
      ok: pages === 1 && fontEmbedded,
      path: output,
      sizeBytes: pdf.byteLength,
      pages,
      fontEmbedded,
      fonts: pdfFonts(pdf),
      fontFacesLoaded,
      blockedRequests,
      launchMs: Math.round(launchMs),
      durationMs: Math.round(performance.now() - startedAt),
      memory: sampler.stop(),
      chromiumVersion,
    });
    if (pages !== 1 || !fontEmbedded) process.exitCode = 1;
  } catch (err: unknown) {
    print({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - startedAt),
      memory: sampler.stop(),
    });
    process.exitCode = 1;
  } finally {
    // Never leave a Chromium behind in the worker container.
    await browser?.close().catch(() => undefined);
  }
}

void main();
