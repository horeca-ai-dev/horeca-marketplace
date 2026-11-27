/**
 * /reset-password (D5-A2) — where the e-mail link lands after Better Auth checked the token:
 *
 *   ?token=…               → new password form
 *   ?error=INVALID_TOKEN   → expired / used / unknown link, with a way to request a new one
 *   neither                → treated as an invalid link
 *
 * The token is only passed on to Better Auth (POST /api/auth/reset-password), which checks it again.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const t = await getTranslations("auth");

  if (typeof token !== "string" || token === "" || error !== undefined) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl">{t("resetPassword.invalidLinkTitle")}</h1>
        <p className="text-sm">{t("resetPassword.invalidLink")}</p>
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline"
        >
          {t("resetPassword.requestNewLink")}
        </Link>
        <Link href="/login" className="text-sm text-primary underline">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">{t("resetPassword.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("resetPassword.description")}
        </p>
      </div>
      <ResetPasswordForm token={token} />
      <Link href="/login" className="text-sm text-primary underline">
        {t("backToLogin")}
      </Link>
    </div>
  );
}
