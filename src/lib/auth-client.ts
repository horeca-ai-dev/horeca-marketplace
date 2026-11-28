/**
 * Better Auth's browser client (talks to /api/auth/* on the same origin). Client Components use it
 * for sign-out now and for sign-in / registration forms from D4-A3. It holds no configuration:
 * the base URL is the page's own origin.
 *
 * organizationClient() only adds the typed `authClient.organization.*` calls; the organization
 * switcher uses `setActive` (D7-A3). What the server answers is decided by the allowlist in
 * src/server/auth/auth.ts (ORGANIZATION_ENDPOINTS_ALLOWED) — every other organization call is a 404.
 */
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
