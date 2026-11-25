/**
 * Better Auth's HTTP API (D2-B2) — one of the few allowed route handlers (CLAUDE.md rule 5).
 * Everything under /api/auth/* (sign-up, sign-in, sign-out, session, the allowed organization
 * endpoints) is handled by Better Auth with the lockdown configured in src/server/auth/auth.ts.
 * getAuth() runs per request, so `next build` does not need the environment variables.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler((request) =>
  getAuth().handler(request),
);
