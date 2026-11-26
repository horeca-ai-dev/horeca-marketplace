/**
 * Seeds the platform settings (D4-B1) — decision 11.9, with decision 012 applied.
 *
 *   default_commission_bps  800 = 8 % (the default of the money examples; a supplier can override it)
 *   vat_rates_bps           [2100, 1500, 700, 0] — mentor answer M5 (verify before a real launch)
 *   invoice_due_days        8 — ONE integer (decision 012: there are no payment methods any more)
 *   platform_company        the pro-forma's issuer; FICTIONAL demo data, the same company as the demo
 *                           platform organization (the admin edits it later; every change is audited)
 *
 * Like the catalogue seed: runs as `horeca_owner`, only adds what is missing and NEVER overwrites, so a
 * value the admin changed survives a re-seed.
 */
import { DEMO_ORGS } from "./demo-data";
import { settings } from "../schema";
import type { Tx } from "../tx";

const platform = DEMO_ORGS.find((o) => o.type === "platform")!;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  default_commission_bps: 800,
  vat_rates_bps: [2100, 1500, 700, 0],
  invoice_due_days: 8,
  platform_company: {
    legal_name: platform.legalName,
    tax_id: platform.taxId,
    vat_number: null,
    address: `${platform.addressLine}, ${platform.postalCode} ${platform.city}`,
    // Not a valid IBAN (wrong check digits on purpose) — format: verify.
    iban: "ME25000000000000000001",
    bank_name: "Demo banka a.d.",
  },
};

export type SettingsSeedResult = { settingsInserted: number };

export async function seedSettings(tx: Tx): Promise<SettingsSeedResult> {
  let settingsInserted = 0;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const inserted = await tx
      .insert(settings)
      .values({ key, value })
      .onConflictDoNothing()
      .returning({ key: settings.key });
    settingsInserted += inserted.length;
  }
  return { settingsInserted };
}
