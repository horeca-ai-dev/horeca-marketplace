/**
 * Font files imported by the bundled entries (src/pdf-probe.ts): scripts/build-entries.mjs gives
 * esbuild the `base64` loader for .woff2, so the import is the file's content as a base64 string and
 * the font travels inside dist/*.mjs (the Docker image does not contain src/app/fonts/).
 *
 * Only for code that esbuild bundles. Next.js code loads fonts through next/font/local (src/app/fonts.ts).
 */
declare module "*.woff2" {
  const base64: string;
  export default base64;
}
