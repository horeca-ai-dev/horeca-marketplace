/**
 * Entry for the Better Auth CLI (`pnpm auth:generate`): the CLI needs an exported instance named
 * `auth` at import time. The app never imports this file — it uses getAuth() from ./auth.
 */
import { createAuth } from "./auth";

export const auth = createAuth();
