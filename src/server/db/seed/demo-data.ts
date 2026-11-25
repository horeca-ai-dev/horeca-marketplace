/**
 * Demo organizations and their owners (D3-B1) — what README → "Demo accounts" lists.
 *
 * Everything is FICTIONAL: company names, tax IDs (PIB), addresses and IBANs. Decision 012 §9: production
 * shows fictional supplier names unless the mentors confirm real companies agreed. IBANs are not valid
 * (check digits are wrong on purpose) — format: verify before anything real.
 *
 * Suppliers are created directly as `approved` (registration is for buyers only, decision 012 §8; the
 * admin's "Create supplier" screen comes on D16). Supplier C has a commission override of 650 bps and
 * A / B use the platform default, so the numbers match the money examples (E5) in money-rules.md.
 */

export type DemoOrg = {
  /** Slug is `demo-<key>`; it is how the seed recognises an organization it already created. */
  key: string;
  type: "platform" | "supplier" | "buyer";
  legalName: string;
  /** PIB: 8 digits. */
  taxId: string;
  addressLine: string;
  city: string;
  postalCode: string;
  owner: { email: string; name: string };
  /** Suppliers only: basis points; undefined = platform default. */
  commissionOverrideBps?: number;
  /** Suppliers only. */
  iban?: string;
  /** Buyers only: the default delivery location. */
  location?: {
    label: string;
    addressLine: string;
    city: string;
    postalCode: string;
  };
};

const owner = (email: string, name: string) => ({ email, name });

/** Order matters: an owner's FIRST membership is the organization a new session starts in. */
export const DEMO_ORGS: DemoOrg[] = [
  {
    key: "platform",
    type: "platform",
    legalName: "HoReCa Market d.o.o.",
    taxId: "02000001",
    addressLine: "Bulevar Svetog Petra Cetinjskog 10",
    city: "Podgorica",
    postalCode: "81000",
    owner: owner("admin@demo.local", "Admin Demo"),
  },
  {
    key: "supplier-a",
    type: "supplier",
    legalName: "Gastro Oprema d.o.o.",
    taxId: "02000002",
    addressLine: "Ulica Radnička 5",
    city: "Podgorica",
    postalCode: "81000",
    owner: owner("supplier-a@demo.local", "Dobavljač A Demo"),
    iban: "ME25000000000000000002",
  },
  {
    key: "supplier-b",
    type: "supplier",
    legalName: "Stolni Servis d.o.o.",
    taxId: "02000003",
    addressLine: "Vuka Karadžića 12",
    city: "Nikšić",
    postalCode: "81400",
    owner: owner("supplier-b@demo.local", "Dobavljač B Demo"),
    iban: "ME25000000000000000003",
  },
  {
    key: "supplier-c",
    type: "supplier",
    legalName: "Hotel Tekstil d.o.o.",
    taxId: "02000004",
    addressLine: "Put Šestog Maja 3",
    city: "Bar",
    postalCode: "85000",
    owner: owner("supplier-c@demo.local", "Dobavljač C Demo"),
    commissionOverrideBps: 650,
    iban: "ME25000000000000000004",
  },
  {
    key: "buyer-hotel",
    type: "buyer",
    legalName: "Hotel Adriatik d.o.o.",
    taxId: "02000005",
    addressLine: "Jadranski put 1",
    city: "Budva",
    postalCode: "85310",
    owner: owner("buyer-hotel@demo.local", "Kupac Hotel Demo"),
    location: {
      label: "Hotel — recepcija i kuhinja",
      addressLine: "Jadranski put 1",
      city: "Budva",
      postalCode: "85310",
    },
  },
  {
    key: "buyer-cafe",
    type: "buyer",
    legalName: "Kafe Bar Lipa d.o.o.",
    taxId: "02000006",
    addressLine: "Stari grad 7",
    city: "Kotor",
    postalCode: "85330",
    owner: owner("buyer-cafe@demo.local", "Kupac Kafe Demo"),
    location: {
      label: "Kafe — glavni lokal",
      addressLine: "Stari grad 7",
      city: "Kotor",
      postalCode: "85330",
    },
  },
  // One company, two organizations (buyer + supplier) and ONE user in both — the multi-organization
  // case (organization switcher, "wrong org type → not found"). The buyer comes first, so a new
  // session starts there. Same PIB is allowed: unique per (tax ID, type).
  {
    key: "multi-buyer",
    type: "buyer",
    legalName: "Multi Trade d.o.o.",
    taxId: "02000007",
    addressLine: "Mainska 2",
    city: "Herceg Novi",
    postalCode: "85340",
    owner: owner("multi@demo.local", "Multi Demo"),
    location: {
      label: "Multi Trade — skladište",
      addressLine: "Mainska 2",
      city: "Herceg Novi",
      postalCode: "85340",
    },
  },
  {
    key: "multi-supplier",
    type: "supplier",
    legalName: "Multi Trade d.o.o.",
    taxId: "02000007",
    addressLine: "Mainska 2",
    city: "Herceg Novi",
    postalCode: "85340",
    owner: owner("multi@demo.local", "Multi Demo"),
    iban: "ME25000000000000000007",
  },
];

/** One entry per distinct e-mail, in first-appearance order. */
export function demoUsers(): { email: string; name: string }[] {
  const seen = new Map<string, { email: string; name: string }>();
  for (const org of DEMO_ORGS)
    if (!seen.has(org.owner.email)) seen.set(org.owner.email, org.owner);
  return [...seen.values()];
}
