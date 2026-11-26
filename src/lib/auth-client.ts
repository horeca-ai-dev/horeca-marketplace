/**
 * Better Auth's browser client (talks to /api/auth/* on the same origin). Client Components use it
 * for sign-out now and for sign-in / registration forms from D4-A3. It holds no configuration:
 * the base URL is the page's own origin.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
