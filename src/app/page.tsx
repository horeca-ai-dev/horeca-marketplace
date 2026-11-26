import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("app");
  return (
    <main id="main" className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-2xl">{t("name")}</h1>
    </main>
  );
}
