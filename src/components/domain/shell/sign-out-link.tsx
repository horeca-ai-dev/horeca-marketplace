"use client";

/**
 * "Odjavite se" as a visible text link, for pages outside the app shell that a logged-in user can be
 * stuck on — "Complete company setup": a user without a company has no header and no account menu.
 * A real <button> (signing out is a POST, not a navigation) that looks like a link.
 */
import { useTranslations } from "next-intl";
import { useSignOut } from "./use-sign-out";

export function SignOutLink() {
  const t = useTranslations("shell");
  const { status, signOut } = useSignOut();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={status === "pending"}
        onClick={() => void signOut()}
        className="self-start text-sm text-primary underline disabled:opacity-50"
      >
        {status === "pending" ? t("loggingOut") : t("logout")}
      </button>
      {status === "failed" ? (
        <p role="alert" className="text-sm text-negative-text">
          {t("logoutFailed")}
        </p>
      ) : null}
    </div>
  );
}
