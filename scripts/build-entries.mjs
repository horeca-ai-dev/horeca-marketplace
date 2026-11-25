/**
 * Bundles the non-Next.js entry points for the Docker image (D2-A4):
 *
 *   src/worker.ts  → dist/worker.mjs   (node dist/worker.mjs)
 *   src/migrate.ts → dist/migrate.mjs  (node dist/migrate.mjs)
 *   src/seed.ts    → dist/seed.mjs     (node dist/seed.mjs — one-shot demo data; production needs SEED_DEMO_PASSWORD)
 *
 * Only OUR code is bundled (the `@/…` imports resolve through tsconfig paths). Every npm package stays
 * external and is loaded at runtime from the image's production node_modules — pg-boss, sharp,
 * Playwright and the Drizzle migrator ship native binaries or read their own files, so bundling them
 * would break them. Next.js's standalone tracing does not cover these entries, which is why the image
 * carries a full production node_modules next to the standalone web server.
 *
 * ESM output (.mjs): our code is ESM and pg-boss is ESM-only.
 */
import { build } from "esbuild";

await build({
  entryPoints: {
    worker: "src/worker.ts",
    migrate: "src/migrate.ts",
    seed: "src/seed.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node26",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
