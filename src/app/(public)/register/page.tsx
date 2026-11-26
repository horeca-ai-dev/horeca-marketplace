/**
 * /register (D4-A3) — BUYER companies only (decision 012 §8); suppliers are created by the admin.
 *
 * REGISTRATION_OPEN=false: the page shows a calm "closed" message instead of the form. (The server
 * refuses registration in that case anyway — this only spares the visitor a form that cannot work.)
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";
import { destinationFor } from "@/lib/auth/destination";
import { resolveSession } from "@/server/auth/actor";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  // First, so the page is dynamic before configuration is read (see resolveSession).
  const state = await resolveSession();
  if (state.kind !== "anonymous") redirect(destinationFor(state));

  const t = await getTranslations("auth");
  const loginLink = (
    <p className="text-sm text-muted-foreground">
      {t("register.haveAccount")}{" "}
      <Link href="/login" className="text-primary underline">
        {t("register.loginLink")}
      </Link>
    </p>
  );

  if (!env.REGISTRATION_OPEN) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl">{t("register.closedTitle")}</h1>
        <p className="text-base">{t("register.closedDescription")}</p>
        {loginLink}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">{t("register.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("register.description")} {t("register.supplierNote")}
        </p>
      </div>
      <RegisterForm />
      {loginLink}
    </div>
  );
}
