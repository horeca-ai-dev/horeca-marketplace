/**
 * Thin banner on staging only (DESIGN.md → Environment banner). The environment is read per request
 * from the server's configuration — connection() stops Next from deciding it at build time, when the
 * one image we ship does not know where it will run (CLAUDE.md rule 14). Local and production: nothing.
 */
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { env } from "@/env";

export async function StagingBanner() {
  await connection();
  if (env.APP_ENV !== "staging") return null;
  const t = await getTranslations("shell");
  return (
    <p className="bg-attention-bg px-4 py-1 text-center text-sm font-medium text-attention-text">
      {t("stagingBanner")}
    </p>
  );
}
