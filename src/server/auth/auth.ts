/**
 * Better Auth — locked down (D2-B2). Verified against better-auth 1.7.20.
 *
 * Better Auth owns users, passwords and sessions. Organizations are OURS: they are created only by
 * our registration transaction (src/server/auth/registration.ts), never by Better Auth's endpoints.
 *
 * Lockdown:
 *   - organization plugin with allowUserToCreateOrganization: false and deletion disabled
 *   - every /organization/* endpoint is refused except the read / switch endpoints in
 *     ORGANIZATION_ENDPOINTS_ALLOWED (an allowlist, so an endpoint added by a future version is
 *     refused too). Member invite / remove is stretch S7 and will go through our domain layer.
 *   - REGISTRATION_OPEN=false refuses sign-up over HTTP; server-side calls (seed) still work
 *   - trustedOrigins = both domains (+ APP_URL locally); the Origin check stays on in every
 *     environment, tests included
 *   - rate limiter: 5 sign-in attempts per minute per client IP; the client IP comes from X-Real-IP, which our Nginx sets from the real client
 *     address (it trusts X-Forwarded-For only from the friend's proxy) — never the raw
 *     X-Forwarded-For, whose first entry the client can forge
 *   - a new session starts in the user's organization (databaseHooks.session.create)
 *
 * Built on first use (getAuth()), not at import: `next build` and the Docker build run without any
 * environment variables, and reading BETTER_AUTH_URL at import would fail them.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { env } from "@/env.core";
import { appDb } from "@/server/db/client";
import { defaultOrganizationId } from "@/server/db/queries/membership";
import * as schema from "@/server/db/schema";

/** The only organization endpoints reachable at all: read your own organization, switch between your own. */
export const ORGANIZATION_ENDPOINTS_ALLOWED: readonly string[] = [
  "/organization/set-active", // membership is checked by Better Auth; our resolveActor re-checks it
  "/organization/get-full-organization",
  "/organization/list",
  "/organization/get-active-member",
  "/organization/get-active-member-role",
];

/** Builds the instance. App code calls getAuth(); only src/server/auth/cli.ts calls this directly. */
export function createAuth(options: { rateLimit?: boolean } = {}) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Better Auth's tables have no RLS; it connects with the app login (grants from migration 0001).
    database: drizzleAdapter(appDb(), { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    trustedOrigins: [
      "https://horeca.bogdandelic.online",
      "https://staging.horeca.bogdandelic.online",
      env.APP_URL,
    ],
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      // Explicit: Better Auth switches the Origin (CSRF) check off by itself when NODE_ENV=test.
      // Set to false so tests exercise exactly what runs on the server.
      disableOriginCheck: false,
    },
    // Built-in limiter, per client IP (from X-Real-IP above). On by default in production only
    // (tests switch it on through createAuth({ rateLimit: true })). Without a client IP Better Auth
    // falls back to ONE shared bucket for everybody — so Nginx must set X-Real-IP.
    rateLimit: {
      enabled: options.rateLimit,
      // The one explicit rule (APPLIED.md §9.7): 5 sign-in attempts per minute per IP. Other
      // sign-in / sign-up paths keep Better Auth's default 3 per 10 s.
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path.startsWith("/organization/") &&
          !ORGANIZATION_ENDPOINTS_ALLOWED.includes(ctx.path)
        ) {
          throw new APIError("NOT_FOUND");
        }
        // Only HTTP requests have ctx.request; server-side calls (seed, our registration) don't.
        if (
          ctx.path === "/sign-up/email" &&
          ctx.request &&
          !env.REGISTRATION_OPEN
        ) {
          throw new APIError("FORBIDDEN", {
            message: "Registration is closed.",
          });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const organizationId = await defaultOrganizationId(session.userId);
            return {
              data: { ...session, activeOrganizationId: organizationId },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
      }),
      nextCookies(), // must stay the last plugin
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const cache = globalThis as unknown as { __horecaAuth?: Auth };

/** The Better Auth instance (created on first call, then reused; survives dev hot reload). */
export function getAuth(): Auth {
  cache.__horecaAuth ??= createAuth();
  return cache.__horecaAuth;
}
