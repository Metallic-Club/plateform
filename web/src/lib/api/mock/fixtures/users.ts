import type { AvatarLook } from "../../types";
import { equip } from "./catalog";
import type { FixtureUser } from "./model";

/* Sample accounts for the preview build. None of these are real people. */

function look(skin: string, keys: string[]): AvatarLook {
  const equipped: AvatarLook["equipped"] = {};
  for (const key of keys) {
    const e = equip(key);
    equipped[e.category] = e;
  }
  return { skin, equipped };
}

type U = FixtureUser;

function user(p: Omit<U, "links" | "bio" | "friendCount" | "createdAt"> & Partial<U>): U {
  return { bio: "", links: [], friendCount: 0, createdAt: "2026-09-20T00:00:00Z", ...p };
}

export const viewer: U = user({
  key: "u-ash",
  username: "ash_wren",
  displayName: "Ash Wren",
  look: look("#c99a78", ["i-crop", "i-face-calm", "i-work-jacket", "i-cargo", "i-boots", "i-backpack"]),
  presence: { status: "online" },
  bio: "Mostly racing and co-op climbs. Building a train game in Studio, slowly.",
  createdAt: "2026-09-16T00:00:00Z",
  links: [
    { platform: "discord", handle: "ash_wren" },
    { platform: "youtube", handle: "@ashwren" },
    { platform: "twitch", handle: "ashwren" },
  ],
  friendCount: 9,
});

export const people: U[] = [
  viewer,
  user({
    key: "u-lumen",
    username: "lumen_k",
    displayName: "Lumen",
    look: look("#8d5b3e", ["i-bob", "i-face-grin", "i-anodised-tee", "i-denim", "i-high-tops"]),
    presence: { status: "in_game", game: "ferrous-drift", server: 2 },
    bio: "Ferrous Drift time trials. Ask me about gear ratios.",
    links: [{ platform: "twitch", handle: "lumenk" }],
    friendCount: 31,
  }),
  user({
    key: "u-pockettorch",
    username: "PocketTorch",
    displayName: "PocketTorch",
    look: look("#e0b896", ["i-curls", "i-face-focus", "i-rain-shell", "i-shorts", "i-runners", "i-bucket"]),
    presence: { status: "in_game", game: "the-long-lantern", server: 1 },
    friendCount: 12,
  }),
  user({
    key: "u-orrery",
    username: "orrery",
    displayName: "orrery",
    look: look("#6e4630", ["i-crop", "i-face-calm", "i-graphite-hoodie", "i-cargo", "i-runners", "i-welder"]),
    presence: { status: "in_game", game: "orbit-couriers", server: null },
    bio: "Delivering parcels to moons. Studio tinkerer.",
    links: [{ platform: "youtube", handle: "@orrery" }],
    friendCount: 54,
  }),
  user({
    key: "u-milo",
    username: "milo_v",
    displayName: "Milo",
    look: look("#f1cfb0", ["i-crop", "i-face-grin", "i-striped-tee", "i-denim", "i-runners", "i-cap"]),
    presence: { status: "in_game", game: "brickfall-tycoon", server: 4 },
    friendCount: 8,
  }),
  user({
    key: "u-fjord",
    username: "quietfjord",
    displayName: "Quiet Fjord",
    look: look("#d2a07e", ["i-bob", "i-face-calm", "i-fisher-vest", "i-cargo", "i-boots"]),
    presence: { status: "online" },
    bio: "Saltmarsh regular. Bring me your clams.",
    links: [{ platform: "tiktok", handle: "@quietfjord" }],
    friendCount: 19,
  }),
  user({
    key: "u-bramble",
    username: "bramble",
    displayName: "Bramble",
    look: look("#a7714c", ["i-curls", "i-face-grin", "i-graphite-hoodie", "i-pleated", "i-high-tops", "i-cape"]),
    presence: { status: "in_studio" },
    friendCount: 23,
  }),
  user({
    key: "u-tess",
    username: "tessellate",
    displayName: "Tess",
    look: look("#e7c3a3", ["i-bob", "i-face-focus", "i-anodised-tee", "i-shorts", "i-runners", "i-beanie"]),
    presence: { status: "offline", lastOnlineAt: "2026-10-29T21:40:00Z" },
    friendCount: 40,
  }),
  user({
    key: "u-kite",
    username: "kitecat",
    displayName: "kitecat",
    look: look("#7a4b33", ["i-crop", "i-face-calm", "i-work-jacket", "i-denim", "i-boots"]),
    presence: { status: "offline", lastOnlineAt: "2026-10-27T18:05:00Z" },
    friendCount: 6,
  }),
  user({
    key: "u-sable",
    username: "sable",
    displayName: "Sable",
    look: look("#cf9f7f", ["i-bob", "i-face-calm", "i-rain-shell", "i-cargo", "i-high-tops"]),
    presence: { status: "offline", lastOnlineAt: "2026-10-22T09:12:00Z" },
    friendCount: 14,
  }),
  // Not friends with the viewer: appear in requests and search.
  user({
    key: "u-nori",
    username: "nori",
    displayName: "Nori",
    look: look("#efc9a8", ["i-curls", "i-face-grin", "i-striped-tee", "i-pleated", "i-runners", "i-bucket"]),
    presence: { status: "online" },
    friendCount: 3,
  }),
  user({
    key: "u-gantry",
    username: "gantry",
    displayName: "Gantry",
    look: look("#94603f", ["i-crop", "i-face-focus", "i-graphite-hoodie", "i-cargo", "i-boots", "i-welder"]),
    presence: { status: "in_game", game: "clocktower-heist", server: 1 },
    friendCount: 77,
  }),
];

export const viewerFriendKeys = ["u-lumen", "u-pockettorch", "u-orrery", "u-milo", "u-fjord", "u-bramble", "u-tess", "u-kite", "u-sable"];

export const personByKey = new Map(people.map((p) => [p.key, p]));
export const personByUsername = new Map(people.map((p) => [p.username.toLowerCase(), p]));
/** Spec-style 64-bit ids, as decimal strings. */
export const userIdByKey = new Map(people.map((p, n) => [p.key, String(1050000000000001 + n)]));
export const userKeyById = new Map([...userIdByKey].map(([k, id]) => [id, k]));

export const friendRequests = [
  { key: "u-nori", createdAt: "2026-10-29T16:20:00Z", mutualFriends: 2 },
  { key: "u-gantry", createdAt: "2026-10-28T11:02:00Z", mutualFriends: 0 },
];

export const viewerFavoriteKeys = ["ferrous-drift", "hollow-peak", "snowline-express", "signal-lost", "glasshouse-garden"];

export const viewerRecent = [
  { game: "ferrous-drift", lastPlayedAt: "2026-10-29T22:10:00Z", minutesPlayed: 1840 },
  { game: "hollow-peak", lastPlayedAt: "2026-10-29T19:45:00Z", minutesPlayed: 410 },
  { game: "snowline-express", lastPlayedAt: "2026-10-27T20:30:00Z", minutesPlayed: 265 },
  { game: "foundry", lastPlayedAt: "2026-10-25T17:00:00Z", minutesPlayed: 95 },
];

/** Names that cannot be registered, with the spec's reason. */
export const unavailableUsernames = new Map<string, "taken" | "reserved" | "released_recently">([
  ...people.map((p) => [p.username.toLowerCase(), "taken"] as const),
  ["metallic", "reserved"],
  ["admin", "reserved"],
  ["support", "reserved"],
  ["chrome", "released_recently"],
]);
