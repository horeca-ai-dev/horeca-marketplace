/**
 * Placeholder so the "Zaboravili ste lozinku?" link on the login page leads somewhere. The real
 * forgot / reset password pages replace this file in D5-A2.
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function ForgotPasswordPage() {
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">{t("auth.forgotPassword.title")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("placeholder.description")}
      </p>
      <Link href="/login" className="text-sm text-primary underline">
        {t("auth.backToLogin")}
      </Link>
    </div>
  );
}
