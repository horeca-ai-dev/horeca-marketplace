/**
 * /login (D4-A3). Somebody who is already logged in does not see the form: the server sends them
 * where they belong (their organization's area, or "Complete company setup"). The login form relies
 * on this — after a successful sign-in it simply loads this page again.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { destinationFor } from "@/lib/auth/destination";
import { resolveSession } from "@/server/auth/actor";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const state = await resolveSession();
  if (state.kind !== "anonymous") redirect(destinationFor(state));

  const { notice } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl">{t("login.title")}</h1>
      {/* Only these known values show a notice — never text taken from the URL. */}
      {notice === "account-created" ? (
        <p
          role="status"
          className="rounded-md bg-attention-bg p-3 text-sm text-attention-text"
        >
          {t("login.accountCreatedNotice")}
        </p>
      ) : null}
      {notice === "password-reset" ? (
        <p
          role="status"
          className="rounded-md bg-positive-bg p-3 text-sm text-positive-text"
        >
          {t("login.passwordResetNotice")}
        </p>
      ) : null}
      <LoginForm />
      <div className="flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="text-primary underline">
          {t("login.forgotPassword")}
        </Link>
        <p className="text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link href="/register" className="text-primary underline">
            {t("login.registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
