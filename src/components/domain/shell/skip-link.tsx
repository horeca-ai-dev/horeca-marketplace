/**
 * First focusable element of every page: invisible until it receives keyboard focus, then it jumps
 * past the header and navigation to <main id="main">.
 */
import { getTranslations } from "next-intl/server";

export async function SkipLink() {
  const t = await getTranslations("shell");
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-background text-sm font-semibold text-primary focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2"
    >
      {t("skipToContent")}
    </a>
  );
}
