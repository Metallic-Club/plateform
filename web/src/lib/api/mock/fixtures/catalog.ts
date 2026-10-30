import type { ItemArt } from "../../types";
import type { FixtureCreator, FixtureItem } from "./model";

/* Sample avatar items for the preview build. Names and prices are invented. */

const METALLIC: FixtureCreator = { key: "c-metallic", name: "Metallic", kind: "metallic" };
const thimble: FixtureCreator = { key: "c-thimble", name: "thimble", kind: "user" };
const warp: FixtureCreator = { key: "c-warp", name: "Warp & Weft", kind: "group" };
const hollis: FixtureCreator = { key: "c-hollis", name: "hollis_k", kind: "user" };

function item(
  key: string,
  name: string,
  art: ItemArt,
  creator: FixtureCreator,
  price: number,
  owned: boolean,
  createdAt: string,
  description: string,
): FixtureItem {
  return { key, name, art, creator, price, owned, createdAt, description };
}

export const catalog: FixtureItem[] = [
  item("i-graphite-hoodie", "Graphite Hoodie", { category: "shirt", shape: "hoodie", primary: "#3a3c44", secondary: "#8b8e99" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "Heavy cotton hoodie in the house colour. Free for every account."),
  item("i-anodised-tee", "Anodised Tee", { category: "shirt", shape: "tee", primary: "#5d49d8", secondary: "#c9c0ff" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "A plain tee dyed the colour titanium turns when you anodise it."),
  item("i-work-jacket", "Canvas Work Jacket", { category: "shirt", shape: "jacket", primary: "#8a6a3f", secondary: "#3a2e22" }, warp, 120, true, "2026-10-02T00:00:00Z", "Waxed canvas with a corduroy collar and four pockets."),
  item("i-fisher-vest", "Fisher's Vest", { category: "shirt", shape: "vest", primary: "#c7b98f", secondary: "#2f3b30" }, thimble, 60, false, "2026-10-21T00:00:00Z", "Too many pockets, all of them useful. Worn over a long-sleeve shirt."),
  item("i-striped-tee", "Breton Stripe Tee", { category: "shirt", shape: "tee-stripe", primary: "#f1efe8", secondary: "#2a3550" }, warp, 45, false, "2026-10-26T00:00:00Z", "Navy stripes on off-white cotton."),
  item("i-rain-shell", "Rain Shell", { category: "shirt", shape: "jacket", primary: "#d9b44a", secondary: "#2b2a27" }, hollis, 150, false, "2026-10-28T00:00:00Z", "A bright shell for wet servers. The hood stays down unless it rains in-game."),

  item("i-cargo", "Cargo Trousers", { category: "pants", shape: "trousers", primary: "#4c5240", secondary: "#353a2c" }, warp, 70, true, "2026-10-02T00:00:00Z", "Side pockets, reinforced knees."),
  item("i-denim", "Raw Denim", { category: "pants", shape: "trousers", primary: "#2c3a5a", secondary: "#1d2740" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "Dark indigo jeans. Free for every account."),
  item("i-shorts", "Trail Shorts", { category: "pants", shape: "shorts", primary: "#8f4a3a", secondary: "#5e2f25" }, thimble, 35, false, "2026-10-19T00:00:00Z", "Short, light and quick to dry."),
  item("i-pleated", "Pleated Skirt", { category: "pants", shape: "skirt", primary: "#3d3550", secondary: "#2a2438" }, hollis, 55, false, "2026-10-24T00:00:00Z", "Knee length, box pleats."),

  item("i-runners", "Grey Runners", { category: "shoes", shape: "sneakers", primary: "#c8cad0", secondary: "#f4f4f6" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "Plain runners. Free for every account."),
  item("i-boots", "Lug Boots", { category: "shoes", shape: "boots", primary: "#4a3626", secondary: "#2a1f17" }, warp, 80, true, "2026-10-05T00:00:00Z", "Leather boots with a deep lug sole."),
  item("i-high-tops", "Violet High Tops", { category: "shoes", shape: "sneakers", primary: "#6650e6", secondary: "#ece9ff" }, hollis, 95, false, "2026-10-27T00:00:00Z", "Canvas high tops with a white sole."),

  item("i-beanie", "Ribbed Beanie", { category: "hat", shape: "beanie", primary: "#b0472f", secondary: "#8c3825" }, thimble, 25, true, "2026-10-08T00:00:00Z", "Folded cuff, fine rib."),
  item("i-cap", "Six-Panel Cap", { category: "hat", shape: "cap", primary: "#2f3b4f", secondary: "#e9e6dc" }, warp, 40, false, "2026-10-17T00:00:00Z", "Structured cap with a curved brim."),
  item("i-bucket", "Bucket Hat", { category: "hat", shape: "bucket", primary: "#d8cfb4", secondary: "#a69c80" }, hollis, 30, false, "2026-10-22T00:00:00Z", "Soft cotton, wide brim."),
  item("i-welder", "Welder's Cap", { category: "hat", shape: "cap-flat", primary: "#55575f", secondary: "#a99bff" }, METALLIC, 0, false, "2026-10-29T00:00:00Z", "A soft cap for the foundry floor. Free while the Foundry update is new."),

  item("i-crop", "Short Crop", { category: "hair", shape: "crop", primary: "#2a211c", secondary: "#2a211c" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "Short and tidy. Free for every account."),
  item("i-bob", "Straight Bob", { category: "hair", shape: "bob", primary: "#1c1a1f", secondary: "#1c1a1f" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "Chin length with a straight fringe. Free for every account."),
  item("i-curls", "Loose Curls", { category: "hair", shape: "curls", primary: "#6b3f24", secondary: "#6b3f24" }, thimble, 50, false, "2026-10-12T00:00:00Z", "Shoulder-length curls."),

  item("i-face-calm", "Calm", { category: "face", shape: "calm", primary: "#1a1a1d", secondary: "#1a1a1d" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "The default face. Unbothered."),
  item("i-face-grin", "Grin", { category: "face", shape: "grin", primary: "#1a1a1d", secondary: "#1a1a1d" }, METALLIC, 0, true, "2026-09-15T00:00:00Z", "A wide grin."),
  item("i-face-focus", "Focused", { category: "face", shape: "focus", primary: "#1a1a1d", secondary: "#1a1a1d" }, hollis, 20, false, "2026-10-20T00:00:00Z", "Brows down, eyes on the finish line."),

  item("i-backpack", "Field Backpack", { category: "back", shape: "backpack", primary: "#5b6b4a", secondary: "#3d4932" }, warp, 90, true, "2026-10-06T00:00:00Z", "Roll-top pack with a side bottle pocket."),
  item("i-cape", "Short Cape", { category: "back", shape: "cape", primary: "#5d49d8", secondary: "#3b2d96" }, hollis, 140, false, "2026-10-25T00:00:00Z", "Shoulder cape that moves when you run."),
];

export const itemByKey = new Map(catalog.map((i) => [i.key, i]));

/** Spec-style 64-bit ids, as decimal strings. */
export const itemIdByKey = new Map(catalog.map((i, n) => [i.key, String(6050000000000001 + n)]));
export const itemKeyById = new Map([...itemIdByKey].map(([k, id]) => [id, k]));

export function equip(key: string) {
  const i = itemByKey.get(key);
  if (!i) throw new Error(`Unknown fixture item ${key}`);
  return { ...i.art, itemId: itemIdByKey.get(key)! };
}
