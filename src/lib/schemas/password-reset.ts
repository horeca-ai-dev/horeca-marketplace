/**
 * Forgot / reset password input (D5-A2). Checked in the browser for instant feedback; Better Auth
 * validates again on the server (e-mail format, password length 8–128 — its defaults, the same as
 * registration's rule in ./registration.ts).
 */
import { z } from "zod";

export const forgotPasswordSchema = z.strictObject({
  email: z.email().max(254),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .strictObject({
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(1),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "mismatch",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
