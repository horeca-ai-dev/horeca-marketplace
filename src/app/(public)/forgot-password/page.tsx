/**
 * /forgot-password (D5-A2): e-mail → Better Auth's reset request. The answer never says whether an
 * account exists (see ForgotPasswordForm). Open to everybody, logged in or not.
 *
 * The e-mail itself is sent by Better Auth's `sendResetPassword` hook, wired in D6-B3 — until then
 * the request answers 400 RESET_PASSWORD_DISABLED and the form shows the generic error.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <div className="flex flex-col gap-8">
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-primary underline">
        {t("backToLogin")}
      </Link>
    </div>
  );
}
