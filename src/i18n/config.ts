/**
 * Language settings (decision 012 §10). One locale for now: Montenegrin in Latin script.
 *
 * Intl has no data for `cnr` (Montenegrin), so the locale is `sr-Latn-ME` — it produces the formats
 * DESIGN.md asks for (1.234,56 €, decimal comma, 24 h time); src/lib/format.test.ts pins them.
 * English is prepared (messages/en.json) but empty, and is not selectable yet.
 */
export const APP_LOCALE = "sr-Latn-ME";

/** All dates and times are shown in Montenegro's time zone, whatever the server's zone is. */
export const APP_TIME_ZONE = "Europe/Podgorica";
