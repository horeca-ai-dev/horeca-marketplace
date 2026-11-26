/**
 * next-intl request configuration (found by the plugin in next.config.ts at this default path).
 * No locale in the URL and no negotiation: every request is Montenegrin until a second catalogue
 * has content. Server Components read messages with getTranslations(), Client Components with
 * useTranslations() through the provider in the root layout.
 */
import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/sr-Latn-ME.json";
import { APP_LOCALE, APP_TIME_ZONE } from "./config";

export default getRequestConfig(async () => ({
  locale: APP_LOCALE,
  timeZone: APP_TIME_ZONE,
  messages,
}));
