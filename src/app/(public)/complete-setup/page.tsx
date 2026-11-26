/**
 * /complete-setup (D4-A3) — "Complete company setup", only for a logged-in user WITHOUT an
 * organization (for example: the account was created but the company step failed). Everybody else
 * is sent where they belong: not logged in → /login, already in a company → their area.
 */
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { destinationFor } from "@/lib/auth/destination";
import { resolveSession } from "@/server/auth/actor";
import { CompanyForm } from "./company-form";

export default async function CompleteSetupPage() {
  const state = await resolveSession();
  if (state.kind !== "no-organization") redirect(destinationFor(state));

  const t = await getTranslations("auth.completeSetup");
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <CompanyForm />
    </div>
  );
}
