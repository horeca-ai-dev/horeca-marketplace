/**
 * Makes message keys type-checked: t("shell.logout") compiles only if the key exists in the
 * Montenegrin catalogue, which is the complete one.
 */
import type messages from "../../messages/sr-Latn-ME.json";
import type { APP_LOCALE } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: typeof APP_LOCALE;
    Messages: typeof messages;
  }
}
