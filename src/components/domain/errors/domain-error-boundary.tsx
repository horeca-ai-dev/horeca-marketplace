"use client";

/**
 * The body of every error.tsx (root and per area). Reads the digest that loadPage() set
 * (src/lib/page-error-digest.ts) and picks the text; any other error gets the generic one.
 *
 * One next action: "Pokušajte ponovo" (retry re-renders the segment) where trying again can help —
 * a conflict or an unexpected error; for invalid page input, the area's home instead.
 * Nothing is logged here: the server already logged the original error (and the browser console is
 * not our log).
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { decodePageErrorDigest } from "@/lib/page-error-digest";
import { ErrorPage } from "./error-page";

export function DomainErrorBoundary({
  error,
  retry,
  homeHref,
  standalone = false,
}: {
  error: unknown;
  retry: () => void;
  homeHref: string;
  standalone?: boolean;
}) {
  const t = useTranslations("errors");
  const tApp = useTranslations("app");
  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;
  const kind = decodePageErrorDigest(digest);

  const retryButton = (
    <Button variant="primary" onClick={() => retry()}>
      {t("actions.retry")}
    </Button>
  );

  let title: string;
  let message: string;
  let action = retryButton;
  if (kind.code === "CONFLICT") {
    title = t("conflict.title");
    message = kind.reason
      ? t(`conflict.reason.${kind.reason}`)
      : t("conflict.message");
  } else if (kind.code === "VALIDATION") {
    title = t("validation.title");
    message = t("validation.message");
    action = (
      <Button asChild variant="primary">
        <Link href={homeHref}>{t("actions.home")}</Link>
      </Button>
    );
  } else {
    title = t("unexpected.title");
    message = t("unexpected.message");
  }

  return (
    <ErrorPage
      title={title}
      message={message}
      action={action}
      standalone={standalone}
      appName={tApp("name")}
    />
  );
}
