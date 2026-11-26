/**
 * Login form input (D4-A3). Checked in the browser only for instant feedback — Better Auth validates
 * and verifies the credentials itself. The password has no minimum here: a too-short password is
 * simply a wrong password, and the form must not hint at the rule.
 */
import { z } from "zod";

export const loginSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
