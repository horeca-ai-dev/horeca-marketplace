/**
 * proxy.ts (Next.js 16's name for middleware) — D5-A2.
 *
 * One cheap, optimistic check: a request into an area WITHOUT a Better Auth session cookie is sent
 * to /login before any rendering. The cookie is not validated here (no database, no Better Auth
 * instance) — a present but expired or forged cookie passes, and the area layout's requireArea()
 * makes the real decision. Nothing else may rely on this file (CLAUDE.md rule 6).
 *
 * getSessionCookie() also finds the `__Secure-` prefixed cookie used over HTTPS.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/buyer/:path*", "/supplier/:path*", "/admin/:path*"],
};
