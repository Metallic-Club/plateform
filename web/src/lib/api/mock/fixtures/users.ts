import type { AvatarLook, FriendRequest, UserProfile } from "../../types";
import { equip } from "./catalog";

/* Sample accounts for the preview build. None of these are real people. */

function look(skin: string, ids: string[]): AvatarLook {
  const equipped: AvatarLook["equipped"] = {};
  for (const id of ids) {
    const e = equip(id);
    equipped[e.slot] = e;
  }
  return { skin, equipped };
}

type U = UserProfile;

function user(p: Omit<U, "links" | "bio" | "friendCount" | "joinedAt"> & Partial<U>): U {
  return {
    bio: "",
    links: [],
    friendCount: 0,
    joinedAt: "2026-09-20T00:00:00Z",
    ...p,
  };
}

export const viewer: U = user({
  id: "u-ash",
  username: "ash_wren",
  displayName: "Ash Wren",
  avatar: look("#c99a78", ["i-crop", "i-face-calm", "i-work-jacket", "i-cargo", "i-boots", "i-backpack"]),
  presence: { status: "online" },
  bio: "Mostly racing and co-op climbs. Building a train game in Studio, slowly.",
  joinedAt: "2026-09-16T00:00:00Z",
  links: [
    { kind: "discord", handle: "ash_wren", url: "https://discord.com/" },
    { kind: "youtube", handle: "@ashwren", url: "https://www.youtube.com/" },
    { kind: "twitch", handle: "ashwren", url: "https://www.twitch.tv/" },
  ],
  friendCount: 9,
});

export const people: U[] = [
  viewer,
  user({
    id: "u-lumen",
    username: "lumen.k",
    displayName: "Lumen",
    avatar: look("#8d5b3e", ["i-bob", "i-face-grin", "i-anodised-tee", "i-denim", "i-high-tops"]),
    presence: { status: "in-game", gameId: "ferrous-drift", gameName: "Ferrous Drift", serverId: "ferrous-drift-s2" },
    bio: "Ferrous Drift time trials. Ask me about gear ratios.",
    links: [{ kind: "twitch", handle: "lumenk", url: "https://www.twitch.tv/" }],
    friendCount: 31,
  }),
  user({
    id: "u-pockettorch",
    username: "PocketTorch",
    displayName: "PocketTorch",
    avatar: look("#e0b896", ["i-curls", "i-face-focus", "i-rain-shell", "i-shorts", "i-runners", "i-bucket"]),
    presence: { status: "in-game", gameId: "the-long-lantern", gameName: "The Long Lantern", serverId: "the-long-lantern-s1" },
    friendCount: 12,
  }),
  user({
    id: "u-orrery",
    username: "orrery",
    displayName: "orrery",
    avatar: look("#6e4630", ["i-crop", "i-face-calm", "i-graphite-hoodie", "i-cargo", "i-runners", "i-welder"]),
    presence: { status: "in-game", gameId: "orbit-couriers", gameName: "Orbit Couriers", serverId: null },
    bio: "Delivering parcels to moons. Studio tinkerer.",
    links: [{ kind: "youtube", handle: "@orrery", url: "https://www.youtube.com/" }],
    friendCount: 54,
  }),
  user({
    id: "u-milo",
    username: "milo_v",
    displayName: "Milo",
    avatar: look("#f1cfb0", ["i-crop", "i-face-grin", "i-striped-tee", "i-denim", "i-runners", "i-cap"]),
    presence: { status: "in-game", gameId: "brickfall-tycoon", gameName: "Brickfall Tycoon", serverId: "brickfall-tycoon-s4" },
    friendCount: 8,
  }),
  user({
    id: "u-fjord",
    username: "quietfjord",
    displayName: "Quiet Fjord",
    avatar: look("#d2a07e", ["i-bob", "i-face-calm", "i-fisher-vest", "i-cargo", "i-boots"]),
    presence: { status: "online" },
    bio: "Saltmarsh regular. Bring me your clams.",
    links: [{ kind: "tiktok", handle: "@quietfjord", url: "https://www.tiktok.com/" }],
    friendCount: 19,
  }),
  user({
    id: "u-bramble",
    username: "bramble",
    displayName: "Bramble",
    avatar: look("#a7714c", ["i-curls", "i-face-grin", "i-graphite-hoodie", "i-pleated", "i-high-tops", "i-cape"]),
    presence: { status: "online" },
    friendCount: 23,
  }),
  user({
    id: "u-tess",
    username: "tessellate",
    displayName: "Tess",
    avatar: look("#e7c3a3", ["i-bob", "i-face-focus", "i-anodised-tee", "i-shorts", "i-runners", "i-beanie"]),
    presence: { status: "offline", lastSeenAt: "2026-10-29T21:40:00Z" },
    friendCount: 40,
  }),
  user({
    id: "u-kite",
    username: "kitecat",
    displayName: "kitecat",
    avatar: look("#7a4b33", ["i-crop", "i-face-calm", "i-work-jacket", "i-denim", "i-boots"]),
    presence: { status: "offline", lastSeenAt: "2026-10-27T18:05:00Z" },
    friendCount: 6,
  }),
  user({
    id: "u-sable",
    username: "sable",
    displayName: "Sable",
    avatar: look("#cf9f7f", ["i-bob", "i-face-calm", "i-rain-shell", "i-cargo", "i-high-tops"]),
    presence: { status: "offline", lastSeenAt: "2026-10-22T09:12:00Z" },
    friendCount: 14,
  }),
  // Not friends with the viewer: appear in requests and search.
  user({
    id: "u-nori",
    username: "nori",
    displayName: "Nori",
    avatar: look("#efc9a8", ["i-curls", "i-face-grin", "i-striped-tee", "i-pleated", "i-runners", "i-bucket"]),
    presence: { status: "online" },
    friendCount: 3,
  }),
  user({
    id: "u-gantry",
    username: "gantry",
    displayName: "Gantry",
    avatar: look("#94603f", ["i-crop", "i-face-focus", "i-graphite-hoodie", "i-cargo", "i-boots", "i-welder"]),
    presence: { status: "in-game", gameId: "clocktower-heist", gameName: "Clocktower Heist", serverId: "clocktower-heist-s1" },
    friendCount: 77,
  }),
];

export const viewerFriendIds = [
  "u-lumen",
  "u-pockettorch",
  "u-orrery",
  "u-milo",
  "u-fjord",
  "u-bramble",
  "u-tess",
  "u-kite",
  "u-sable",
];

export const personById = new Map(people.map((p) => [p.id, p]));
export const personByUsername = new Map(people.map((p) => [p.username.toLowerCase(), p]));

export const friendRequests: FriendRequest[] = [
  { id: "fr-1", from: personById.get("u-nori")!, sentAt: "2026-10-29T16:20:00Z" },
  { id: "fr-2", from: personById.get("u-gantry")!, sentAt: "2026-10-28T11:02:00Z" },
];

export const viewerFavouriteIds = ["ferrous-drift", "hollow-peak", "snowline-express", "signal-lost", "glasshouse-garden"];

export const viewerRecent: { gameId: string; lastPlayedAt: string }[] = [
  { gameId: "ferrous-drift", lastPlayedAt: "2026-10-29T22:10:00Z" },
  { gameId: "hollow-peak", lastPlayedAt: "2026-10-29T19:45:00Z" },
  { gameId: "snowline-express", lastPlayedAt: "2026-10-27T20:30:00Z" },
  { gameId: "foundry", lastPlayedAt: "2026-10-25T17:00:00Z" },
];

/** Usernames that cannot be registered (taken or reserved). */
export const reservedUsernames = new Set(["metallic", "admin", "support", "moderator", ...people.map((p) => p.username.toLowerCase())]);
