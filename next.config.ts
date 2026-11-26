import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Loads src/i18n/request.ts (locale, time zone, messages) for every request.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // CLAUDE.md: Cache Components off — every page is dynamic.
  cacheComponents: false,
  // One image for staging and production; the Docker image runs .next/standalone/server.js.
  output: "standalone",
  experimental: {
    serverActions: {
      // Hosts (from the browser's Origin header) allowed to invoke Server Actions behind our proxies.
      allowedOrigins: [
        "horeca.bogdandelic.online",
        "staging.horeca.bogdandelic.online",
      ],
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
