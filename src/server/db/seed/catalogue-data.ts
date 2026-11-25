/**
 * Category tree and attribute definitions (D3-B2) — from docs/decisions-9-11/seed-categories.md.
 *
 * Keys, units and ranges are the source's; **names, labels and enum labels are Montenegrin** (ijekavian,
 * Latin) because buyers see them on screen and the platform admin edits them later (decision 012 §10).
 * Machine keys (`capacity_l`, `stainless_steel`) stay English: they appear in JSONB, CSV headers and search.
 *
 * Rules (decision 10): max depth 3 · products only on leaf categories · a child inherits its ancestors'
 * attributes with no overrides · a key is unique along one path (it may repeat in another branch) ·
 * values are stored only in the canonical unit named by the key.
 */

export type AttributeSeed = {
  key: string;
  label: string;
  type: "number" | "enum" | "boolean";
  unit?: string;
  required: boolean;
  filterable: boolean;
  sortable: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

export type CategorySeed = {
  key: string;
  name: string;
  attributes: AttributeSeed[];
  children: CategorySeed[];
};

/** Flags as a string: F = filterable, S = sortable, R = required (the notation of seed-categories.md). */
function flags(f: string) {
  return {
    filterable: f.includes("F"),
    sortable: f.includes("S"),
    required: f.includes("R"),
  };
}

const num = (
  key: string,
  label: string,
  unit: string,
  f: string,
  min: number,
  max: number,
): AttributeSeed => ({
  key,
  label,
  type: "number",
  unit,
  min,
  max,
  ...flags(f),
});

const choice = (
  key: string,
  label: string,
  f: string,
  options: [value: string, label: string][],
): AttributeSeed => ({
  key,
  label,
  type: "enum",
  options: options.map(([value, text]) => ({ value, label: text })),
  ...flags(f),
});

const yesNo = (key: string, label: string, f: string): AttributeSeed => ({
  key,
  label,
  type: "boolean",
  ...flags(f),
});

const node = (
  key: string,
  name: string,
  attributes: AttributeSeed[] = [],
  children: CategorySeed[] = [],
): CategorySeed => ({ key, name, attributes, children });

export const CATEGORY_TREE: CategorySeed[] = [
  node(
    "kitchen_equipment",
    "Kuhinjska oprema",
    [
      choice("material", "Materijal", "F", [
        ["stainless_steel", "Nerđajući čelik"],
        ["aluminium", "Aluminijum"],
        ["cast_iron", "Liveno gvožđe"],
        ["plastic", "Plastika"],
      ]),
      num("width_mm", "Širina", "mm", "FS", 100, 5000),
      num("depth_mm", "Dubina", "mm", "F", 100, 2000),
    ],
    [
      node(
        "cooking",
        "Kuvanje",
        [
          num("power_w", "Snaga", "W", "FSR", 100, 60000),
          choice("energy_source", "Izvor energije", "FR", [
            ["electric", "Struja"],
            ["gas", "Gas"],
          ]),
        ],
        [
          node("combi_ovens", "Kombinovane pećnice", [
            num("gn_capacity", "Broj GN 1/1 posuda", "pcs", "FSR", 1, 40),
            yesNo("steam_generator", "Generator pare", "F"),
          ]),
          node("ranges", "Šporeti i ploče", [
            num("burners", "Broj plamenika / zona", "pcs", "FSR", 1, 12),
          ]),
        ],
      ),
      node("prep_tables", "Radni stolovi od nerđajućeg čelika", [
        yesNo("undershelf", "Donja polica", "F"),
        yesNo("splashback", "Zadnja zaštitna ivica", "F"),
      ]),
    ],
  ),
  node(
    "refrigeration",
    "Rashladna oprema",
    [
      num("power_w", "Snaga", "W", "FS", 10, 5000),
      choice("energy_class", "Energetska klasa", "F", [
        ["a", "A"],
        ["b", "B"],
        ["c", "C"],
        ["d", "D"],
        ["e", "E"],
        ["f", "F"],
        ["g", "G"],
      ]),
      num("temp_min_c", "Minimalna temperatura", "°C", "F", -40, 15),
    ],
    [
      node("under_counter", "Podpultni frižideri", [
        num("capacity_l", "Zapremina", "l", "FSR", 50, 800),
        num("doors", "Broj vrata", "pcs", "FR", 1, 4),
        choice("door_type", "Vrsta vrata", "F", [
          ["solid", "Puna"],
          ["glass", "Staklena"],
        ]),
      ]),
      node("freezers", "Zamrzivači", [
        num("capacity_l", "Zapremina", "l", "FSR", 50, 2000),
        choice("freezer_type", "Vrsta zamrzivača", "FR", [
          ["chest", "Horizontalni (škrinja)"],
          ["upright", "Uspravni"],
        ]),
      ]),
      node("display_coolers", "Rashladne vitrine", [
        num("capacity_l", "Zapremina", "l", "FSR", 50, 2000),
        num("shelves", "Broj polica", "pcs", "F", 1, 10),
      ]),
    ],
  ),
  node(
    "tableware",
    "Stolno posuđe",
    [
      choice("material", "Materijal", "FR", [
        ["porcelain", "Porcelan"],
        ["glass", "Staklo"],
        ["stainless_steel", "Nerđajući čelik"],
        ["melamine", "Melamin"],
      ]),
      num("pack_qty", "Komada u pakovanju", "pcs", "FS", 1, 500),
      yesNo("dishwasher_safe", "Može u mašinu za suđe", "F"),
    ],
    [
      node("plates", "Tanjiri", [
        num("diameter_mm", "Prečnik", "mm", "FSR", 50, 500),
        choice("plate_type", "Vrsta tanjira", "F", [
          ["flat", "Plitki"],
          ["deep", "Duboki"],
          ["dessert", "Desertni"],
          ["platter", "Servirni"],
        ]),
      ]),
      node("glasses", "Čaše", [
        num("volume_ml", "Zapremina", "ml", "FSR", 20, 1500),
        choice("glass_type", "Vrsta čaše", "FR", [
          ["wine", "Za vino"],
          ["water", "Za vodu"],
          ["beer", "Za pivo"],
          ["cocktail", "Za koktele"],
          ["shot", "Za žestoka pića"],
        ]),
      ]),
      node("cutlery", "Escajg", [
        choice("cutlery_type", "Vrsta escajga", "FR", [
          ["knife", "Nož"],
          ["fork", "Viljuška"],
          ["spoon", "Kašika"],
          ["teaspoon", "Kašičica"],
          ["set", "Komplet"],
        ]),
      ]),
    ],
  ),
  node(
    "textiles",
    "Tekstil",
    [
      choice("material", "Materijal", "FR", [
        ["cotton", "Pamuk"],
        ["polyester", "Poliester"],
        ["cotton_polyester", "Pamuk i poliester"],
        ["linen", "Lan"],
      ]),
      choice("colour", "Boja", "F", [
        ["white", "Bijela"],
        ["ivory", "Krem"],
        ["black", "Crna"],
        ["grey", "Siva"],
        ["red", "Crvena"],
        ["blue", "Plava"],
      ]),
      num("wash_temp_c", "Najviša temperatura pranja", "°C", "F", 30, 95),
    ],
    [
      node("tablecloths", "Stolnjaci", [
        num("width_cm", "Širina", "cm", "FSR", 50, 400),
        num("length_cm", "Dužina", "cm", "FSR", 50, 600),
      ]),
      node("napkins", "Salvete", [
        num("size_cm", "Veličina (stranica kvadrata)", "cm", "FSR", 20, 60),
      ]),
      node("uniforms", "Uniforme za kuhinju i osoblje", [
        choice("garment", "Odjevni predmet", "FR", [
          ["chef_jacket", "Kuvarska bluza"],
          ["apron", "Kecelja"],
          ["trousers", "Pantalone"],
          ["shirt", "Košulja"],
        ]),
        choice("size", "Veličina", "FR", [
          ["xs", "XS"],
          ["s", "S"],
          ["m", "M"],
          ["l", "L"],
          ["xl", "XL"],
          ["xxl", "XXL"],
        ]),
      ]),
    ],
  ),
  node(
    "hygiene_cosmetics",
    "Higijena i kozmetika",
    [num("volume_ml", "Zapremina", "ml", "FSR", 10, 30000)],
    [
      node("dishwasher_detergents", "Deterdženti za mašine za suđe", [
        choice("usage", "Namjena", "FR", [
          ["washing", "Pranje"],
          ["rinsing", "Ispiranje"],
          ["descaling", "Uklanjanje kamenca"],
        ]),
      ]),
      node("hotel_amenities", "Hotelska kozmetika", [
        choice("amenity_type", "Vrsta proizvoda", "FR", [
          ["shampoo", "Šampon"],
          ["shower_gel", "Gel za tuširanje"],
          ["soap", "Sapun"],
          ["lotion", "Losion"],
          ["dental_kit", "Set za njegu zuba"],
        ]),
        num("pack_qty", "Komada u pakovanju", "pcs", "FS", 1, 1000),
      ]),
    ],
  ),
  node(
    "bar",
    "Bar",
    [num("power_w", "Snaga", "W", "FS", 50, 10000)],
    [
      node("coffee_machines", "Aparati za kafu", [
        num("groups", "Broj grupa", "pcs", "FSR", 1, 4),
        yesNo("water_connection", "Fiksni priključak na vodu", "F"),
      ]),
      node("blenders", "Blenderi", [
        num("jar_volume_l", "Zapremina posude", "l", "FSR", 0.5, 5),
      ]),
      node("ice_makers", "Aparati za led", [
        num("output_kg_24h", "Proizvodnja za 24 h", "kg", "FSR", 5, 1000),
        choice("ice_shape", "Oblik leda", "F", [
          ["cube", "Kocka"],
          ["nugget", "Nugat"],
          ["flake", "Ljuspice"],
        ]),
      ]),
    ],
  ),
];

export type FlatCategory = {
  /** ltree path, e.g. `refrigeration.under_counter`. */
  path: string;
  /** The path with `-` instead of `.` (unique). */
  slug: string;
  name: string;
  depth: number;
  /** Position among siblings, 0-based. */
  position: number;
  parentPath: string | null;
  isLeaf: boolean;
  /** Only this category's own definitions — inherited ones are on its ancestors. */
  attributes: AttributeSeed[];
};

/** Parents come before their children, so inserting in this order always satisfies the parent FK. */
export function flattenCategories(
  tree: CategorySeed[] = CATEGORY_TREE,
): FlatCategory[] {
  const out: FlatCategory[] = [];
  const walk = (
    nodes: CategorySeed[],
    parentPath: string | null,
    depth: number,
  ) => {
    nodes.forEach((n, position) => {
      const path = parentPath ? `${parentPath}.${n.key}` : n.key;
      out.push({
        path,
        slug: path.replace(/\./g, "-"),
        name: n.name,
        depth,
        position,
        parentPath,
        isLeaf: n.children.length === 0,
        attributes: n.attributes,
      });
      walk(n.children, path, depth + 1);
    });
  };
  walk(tree, null, 1);
  return out;
}
