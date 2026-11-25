import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Architecture rules from CLAUDE.md ("Architecture rules" 1 and 14).
const NEXT_PUBLIC_MESSAGE =
  "NEXT_PUBLIC_* variables are forbidden: they are frozen at build time and we ship one image for staging and production. Pass the value from a Server Component (CLAUDE.md rule 14).";

const nextPublicBans = [
  {
    selector: "Identifier[name=/^NEXT_PUBLIC_/]",
    message: NEXT_PUBLIC_MESSAGE,
  },
  {
    selector: "Literal[value=/^NEXT_PUBLIC_/]",
    message: NEXT_PUBLIC_MESSAGE,
  },
  {
    selector: "TemplateElement[value.raw=/^NEXT_PUBLIC_/]",
    message: NEXT_PUBLIC_MESSAGE,
  },
];

const PROCESS_ENV_MESSAGE =
  "Read configuration only through src/env.ts (CLAUDE.md rule 14).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // process.env and NEXT_PUBLIC_* are forbidden everywhere…
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // This file has to spell the banned prefix out to define the rule.
    ignores: ["eslint.config.mjs"],
    rules: {
      "no-restricted-properties": [
        "error",
        // Also catches `const { env } = process` and `process["env"]`.
        { object: "process", property: "env", message: PROCESS_ENV_MESSAGE },
      ],
      "no-restricted-syntax": ["error", ...nextPublicBans],
    },
  },
  // …except src/env.core.ts, the single place that reads process.env (NEXT_PUBLIC_ stays banned there too).
  {
    files: ["src/env.core.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },

  // Next.js-only code reads configuration through src/env.ts (`server-only`), never env.core directly,
  // so a Client Component that imports configuration fails the build.
  {
    files: ["src/app/**", "src/components/**", "src/instrumentation.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/env.core", "**/env.core"],
              message:
                "Import configuration from @/env (server-only) in Next.js code.",
            },
          ],
        },
      ],
    },
  },

  // The domain layer is framework-free (CLAUDE.md rule 1).
  {
    files: ["src/server/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next",
              message: "src/server/domain must not import Next.js.",
            },
            {
              name: "react",
              message: "src/server/domain must not import React.",
            },
            {
              name: "react-dom",
              message: "src/server/domain must not import React.",
            },
          ],
          patterns: [
            {
              group: ["next/*", "react/*", "react-dom/*"],
              message: "src/server/domain must not import Next.js or React.",
            },
            {
              group: ["@/app", "@/app/*", "**/app", "**/app/*"],
              message: "src/server/domain must not import from src/app.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Bundled worker / migrate entries (pnpm build:entries):
    "dist/**",
    "next-env.d.ts",
    // Planning documents and drafts (not part of the app):
    "docs/**",
  ]),
]);

export default eslintConfig;
