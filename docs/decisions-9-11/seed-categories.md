# Seed — category tree, attribute definitions, demo CSVs (decision 10.10)

Used by `pnpm db:seed` (D3-B3) and the demo CSVs (D6-A2). Rules from decision 10:
- max depth 3; **products only on leaf categories** (marked 🍃);
- child categories **inherit** their ancestors' attributes, no overrides; a key is unique along the path;
- the attribute key carries the canonical unit (`capacity_l`, `power_w`); values are stored only in that unit;
- `F` = filterable (Meilisearch facet/filter), `S` = sortable, `R` = required.
- VAT: all seed products at **2100 bps (21 %)**; textiles/hygiene at 21 % as well — Montenegrin reduced rates: **verify** before using 700.

## Tree
```
kitchen_equipment                 Kitchen equipment
├── cooking                       Cooking
│   ├── combi_ovens 🍃            Combi ovens             (depth 3)
│   └── ranges 🍃                 Ranges & hobs           (depth 3)
└── prep_tables 🍃                Stainless prep tables
refrigeration                     Refrigeration
├── under_counter 🍃              Under-counter fridges
├── freezers 🍃                   Freezers
└── display_coolers 🍃            Display coolers
tableware                         Tableware
├── plates 🍃                     Plates
├── glasses 🍃                    Glasses
└── cutlery 🍃                    Cutlery
textiles                          Textiles
├── tablecloths 🍃                Tablecloths
├── napkins 🍃                    Napkins
└── uniforms 🍃                   Chef & staff uniforms
hygiene_cosmetics                 Hygiene & cosmetics
├── dishwasher_detergents 🍃      Dishwasher detergents
└── hotel_amenities 🍃            Hotel amenities
bar                               Bar
├── coffee_machines 🍃            Coffee machines
├── blenders 🍃                   Blenders
└── ice_makers 🍃                 Ice makers
```
`path` = the keys joined with dots, e.g. `kitchen_equipment.cooking.combi_ovens`; `slug` = path with `-` (unique).

## Attribute definitions
Inherited definitions are listed once, on the highest category they belong to.

| Category | key | label | type | unit | flags | enum options / range |
|---|---|---|---|---|---|---|
| kitchen_equipment | `material` | Material | enum | — | F | stainless_steel, aluminium, cast_iron, plastic |
| kitchen_equipment | `width_mm` | Width | number | mm | F S | 100–5000 |
| kitchen_equipment | `depth_mm` | Depth | number | mm | F | 100–2000 |
| cooking | `power_w` | Power | number | W | F S R | 100–60000 |
| cooking | `energy_source` | Energy source | enum | — | F R | electric, gas |
| combi_ovens | `gn_capacity` | GN 1/1 trays | number | pcs | F S R | 1–40 |
| combi_ovens | `steam_generator` | Steam generator | boolean | — | F | |
| ranges | `burners` | Burners / zones | number | pcs | F S R | 1–12 |
| prep_tables | `undershelf` | Undershelf | boolean | — | F | |
| prep_tables | `splashback` | Splashback | boolean | — | F | |
| refrigeration | `power_w` | Power | number | W | F S | 10–5000 |
| refrigeration | `energy_class` | Energy class | enum | — | F | a, b, c, d, e, f, g |
| refrigeration | `temp_min_c` | Min. temperature | number | °C | F | −40–15 |
| under_counter | `capacity_l` | Capacity | number | l | F S R | 50–800 |
| under_counter | `doors` | Doors | number | pcs | F R | 1–4 |
| under_counter | `door_type` | Door type | enum | — | F | solid, glass |
| freezers | `capacity_l` | Capacity | number | l | F S R | 50–2000 |
| freezers | `freezer_type` | Type | enum | — | F R | chest, upright |
| display_coolers | `capacity_l` | Capacity | number | l | F S R | 50–2000 |
| display_coolers | `shelves` | Shelves | number | pcs | F | 1–10 |
| tableware | `material` | Material | enum | — | F R | porcelain, glass, stainless_steel, melamine |
| tableware | `pack_qty` | Pieces per pack | number | pcs | F S | 1–500 |
| tableware | `dishwasher_safe` | Dishwasher safe | boolean | — | F | |
| plates | `diameter_mm` | Diameter | number | mm | F S R | 50–500 |
| plates | `plate_type` | Plate type | enum | — | F | flat, deep, dessert, platter |
| glasses | `volume_ml` | Volume | number | ml | F S R | 20–1500 |
| glasses | `glass_type` | Glass type | enum | — | F R | wine, water, beer, cocktail, shot |
| cutlery | `cutlery_type` | Cutlery type | enum | — | F R | knife, fork, spoon, teaspoon, set |
| textiles | `material` | Material | enum | — | F R | cotton, polyester, cotton_polyester, linen |
| textiles | `colour` | Colour | enum | — | F | white, ivory, black, grey, red, blue |
| textiles | `wash_temp_c` | Max. wash temperature | number | °C | F | 30–95 |
| tablecloths | `width_cm` | Width | number | cm | F S R | 50–400 |
| tablecloths | `length_cm` | Length | number | cm | F S R | 50–600 |
| napkins | `size_cm` | Size (square) | number | cm | F S R | 20–60 |
| uniforms | `garment` | Garment | enum | — | F R | chef_jacket, apron, trousers, shirt |
| uniforms | `size` | Size | enum | — | F R | xs, s, m, l, xl, xxl |
| hygiene_cosmetics | `volume_ml` | Volume | number | ml | F S R | 10–30000 |
| dishwasher_detergents | `usage` | Use | enum | — | F R | washing, rinsing, descaling |
| hotel_amenities | `amenity_type` | Amenity | enum | — | F R | shampoo, shower_gel, soap, lotion, dental_kit |
| hotel_amenities | `pack_qty` | Pieces per pack | number | pcs | F S | 1–1000 |
| bar | `power_w` | Power | number | W | F S | 50–10000 |
| coffee_machines | `groups` | Groups | number | pcs | F S R | 1–4 |
| coffee_machines | `water_connection` | Fixed water connection | boolean | — | F | |
| blenders | `jar_volume_l` | Jar volume | number | l | F S R | 0.5–5 |
| ice_makers | `output_kg_24h` | Output per 24 h | number | kg | F S R | 5–1000 |
| ice_makers | `ice_shape` | Ice shape | enum | — | F | cube, nugget, flake |

`material`, `power_w`, `capacity_l`, `volume_ml` and `pack_qty` appear in more than one branch. That is allowed: the
key only has to be unique **along one path** (`refrigeration.power_w` and `bar.power_w` are separate definitions).

## Demo suppliers and CSV files (D6-A2)
| Supplier | Categories | File(s) | Rows |
|---|---|---|---|
| A — "Gastro Oprema d.o.o." | under_counter, freezers, display_coolers, combi_ovens, prep_tables | one file per category | ≈ 45 |
| B — "Stolni Servis d.o.o." | plates, glasses, cutlery, coffee_machines, display_coolers | one file per category | ≈ 45 |
| C — "Hotel Tekstil d.o.o." | tablecloths, napkins, uniforms, hotel_amenities | one file per category | ≈ 40 |
| Bad file | under_counter (supplier A) | `under_counter_bad_rows.csv` | 20 rows, 8 invalid |

Names use č ć š ž đ (e.g. "Podpultni frižider", "Čaše za vino", "Stolnjak bijeli") so diacritics-tolerant search can be demoed.
Two display coolers share a **GTIN** across suppliers A and B (same model, different price) to demo "compare offers".

### Template (download for a leaf category = fixed columns + its effective attributes)
`under_counter` template header:
```
sku;name;description;brand;gtin;mpn;unit;min_order_qty;order_step;base_price;vat_rate_bps;status;material;width_mm;depth_mm;power_w;energy_class;temp_min_c;capacity_l;doors;door_type
```
- Separator `;` or `,` (auto-detected), UTF-8 (BOM tolerated), max 5,000 rows / 5 MB.
- `base_price` in euros with `.` or `,` as decimal separator and no thousands separator (`489,00` → 48900 cents).
- `status` optional (`draft` default). Enum cells use the option **value** (`stainless_steel`). Booleans: `true/false`, `yes/no`, `1/0`.
- No image column (images are uploaded in the UI; a URL column would be an SSRF risk).

### Deliberate errors in `under_counter_bad_rows.csv` (each must produce one report line)
| Row | Error | Expected message |
|---|---|---|
| 3 | `base_price` = `-12` | price must be a positive number |
| 5 | `capacity_l` = `veliki` | capacity_l must be a number (l) |
| 7 | `capacity_l` = `9000` | capacity_l must be between 50 and 800 |
| 9 | `door_type` = `wood` | door_type must be one of: solid, glass |
| 11 | missing `doors` | doors is required |
| 13 | duplicate `sku` of row 2 | duplicate SKU in file (row 2) |
| 15 | invalid enum value `energy_class` = `a+++` | energy_class must be one of: a … g |
| 17 | `min_order_qty` = `6`, `order_step` = `4` | min_order_qty must be a multiple of order_step |
