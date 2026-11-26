/**
 * Frame of the pages that need no login (DESIGN.md → Screens, "Public"): login, registration,
 * password pages and "Complete company setup" — the pages themselves arrive with D4-A3 / D5-A2.
 * A narrow centred column under the wordmark; no navigation.
 */
import { getTranslations } from "next-intl/server";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("app");
  return (
    <>
      <header className="border-b border-border">
        <div className="flex h-14 items-center px-4 md:px-8">
          <p className="text-base font-semibold">{t("name")}</p>
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </>
  );
}
