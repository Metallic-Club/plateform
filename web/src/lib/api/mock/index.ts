import { genreName } from "@/lib/format";
import type { MockScenario } from "@/lib/prefs";
import { ApiError, type MetallicApi } from "../client";
import type {
  Avatar,
  CatalogItem,
  CatalogItemSummary,
  CreatorRef,
  Friend,
  GameDetail,
  GameSummary,
  HomeSection,
  Page,
  Presence,
  Region,
  Server,
  UserProfile,
  UserSummary,
} from "../types";
import { catalog, itemByKey, itemIdByKey, itemKeyById } from "./fixtures/catalog";
import { gameByKey, gameIdByKey, gameKeyById, games, placeIdByKey } from "./fixtures/games";
import type { FixtureCreator, FixtureGame, FixtureItem, FixtureUser } from "./fixtures/model";
import { GENRE_IDS } from "./fixtures/model";
import { templates } from "./fixtures/templates";
import {
  friendRequests,
  people,
  personByKey,
  personByUsername,
  unavailableUsernames,
  userIdByKey,
  userKeyById,
  viewer,
  viewerFavoriteKeys,
  viewerFriendKeys,
  viewerRecent,
} from "./fixtures/users";

export { MOCK_SCENARIOS, type MockScenario } from "@/lib/prefs";

/*
 * The mock API: fixtures turned into the spec's types. Ids are spec-style
 * decimal strings; fixture keys never leave this file.
 */

const NOW = Date.parse("2026-10-30T06:00:00Z");

/* ----------------------------------------------------------------- mapping */

const creatorIds = new Map<string, string>();
function creatorRef(c: FixtureCreator): CreatorRef {
  if (!creatorIds.has(c.key)) creatorIds.set(c.key, String(5050000000000001 + creatorIds.size));
  return {
    type: c.kind === "group" ? "group" : "user",
    id: creatorIds.get(c.key)!,
    name: c.name,
    isFirstParty: c.kind === "metallic",
  };
}

function upPercent(r: { up: number; down: number }) {
  const votes = r.up + r.down;
  return votes < 20 ? null : Math.round((r.up / votes) * 100);
}

/** Live count drifts a little every 15 seconds so the live poll visibly works. */
function livePlaying(g: FixtureGame, now = Date.now()) {
  const bucket = Math.floor(now / 15_000);
  const wave = Math.sin(bucket * 0.9 + g.art.seed) * 0.012 + Math.sin(bucket * 0.13 + g.art.seed * 3) * 0.02;
  return Math.max(0, Math.round(g.playing * (1 + wave)));
}

function gameSummary(g: FixtureGame): GameSummary {
  const id = gameIdByKey.get(g.key)!;
  return {
    id,
    name: g.name,
    creator: creatorRef(g.creator),
    // No uploaded images yet: `art` is drawn instead and these are never fetched.
    iconUrl: `mock://games/${id}/icon`,
    thumbnailUrl: `mock://games/${id}/thumbnail`,
    genres: g.genres,
    playing: g.playing,
    rating: { upPercent: upPercent(g.rating), votes: g.rating.up + g.rating.down },
    contentLabel: g.contentLabel,
    isFirstParty: g.firstParty,
    art: g.art,
    tagline: g.tagline,
  };
}

function gameByAnyId(id: string) {
  const key = gameKeyById.get(id);
  return key ? gameByKey.get(key) : undefined;
}

function g(key: string) {
  const game = gameByKey.get(key);
  if (!game) throw new Error(`Unknown fixture game ${key}`);
  return gameSummary(game);
}

function userSummary(u: FixtureUser): UserSummary {
  return {
    id: userIdByKey.get(u.key)!,
    username: u.username,
    displayName: u.displayName,
    avatarHeadshotUrl: null,
    look: u.look,
  };
}

function serverId(gameKey: string, n: number) {
  return String(4050000000000001 + (gameIdByKey.get(gameKey) ? Number(gameIdByKey.get(gameKey)!.slice(-3)) * 100 : 0) + n);
}

function presence(u: FixtureUser, joinableForViewer: boolean): Presence {
  const userId = userIdByKey.get(u.key)!;
  const p = u.presence;
  switch (p.status) {
    case "in_game": {
      const game = gameByKey.get(p.game)!;
      return { userId, status: "in_game", game: { id: gameIdByKey.get(p.game)!, name: game.name }, joinable: joinableForViewer, lastOnlineAt: null };
    }
    case "offline":
      return { userId, status: "offline", game: null, joinable: false, lastOnlineAt: p.lastOnlineAt };
    default:
      return { userId, status: p.status, game: null, joinable: false, lastOnlineAt: null };
  }
}

const SOCIAL_URL: Record<string, ((h: string) => string) | null> = {
  discord: null,
  youtube: (h) => `https://www.youtube.com/${h.startsWith("@") ? h : `@${h}`}`,
  twitch: (h) => `https://www.twitch.tv/${h}`,
  tiktok: (h) => `https://www.tiktok.com/${h.startsWith("@") ? h : `@${h}`}`,
};

function profile(u: FixtureUser, relationship: UserProfile["relationship"]): UserProfile {
  return {
    ...userSummary(u),
    bio: u.bio || undefined,
    createdAt: u.createdAt,
    friendCount: u.friendCount,
    isFirstParty: false,
    socialLinks: u.links.map((l) => ({
      platform: l.platform,
      handle: l.handle,
      url: SOCIAL_URL[l.platform]?.(l.handle) ?? null,
      verified: false,
    })),
    relationship,
    presence: presence(u, relationship === "friend"),
  };
}

function itemSummary(i: FixtureItem): CatalogItemSummary {
  const id = itemIdByKey.get(i.key)!;
  return {
    id,
    name: i.name,
    category: i.art.category,
    creator: creatorRef(i.creator),
    thumbnailUrl: `mock://items/${id}/thumbnail`,
    price: { currency: "credits", amount: i.price },
    onSale: true,
    limited: null,
    art: i.art,
  };
}

function page<T>(all: T[], cursor: string | undefined, limit = 24): Page<T> {
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const end = start + limit;
  return { items: all.slice(start, end), nextCursor: end < all.length ? String(end) : null };
}

/** Small deterministic PRNG so server lists are stable between renders. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordered nearest-first for the sample player in the central US. */
const REGIONS: Region[] = [
  { code: "us-central", name: "US Central", probeUrl: "mock://probe/us-central" },
  { code: "us-east", name: "US East", probeUrl: "mock://probe/us-east" },
  { code: "us-west", name: "US West", probeUrl: "mock://probe/us-west" },
  { code: "eu-west", name: "Europe West", probeUrl: "mock://probe/eu-west" },
  { code: "eu-central", name: "Europe Central", probeUrl: "mock://probe/eu-central" },
  { code: "sa-east", name: "South America", probeUrl: "mock://probe/sa-east" },
  { code: "asia-east", name: "Asia East", probeUrl: "mock://probe/asia-east" },
  { code: "au-east", name: "Australia", probeUrl: "mock://probe/au-east" },
];

/** Servers running for a game: players spread over servers about 80% full. */
function serverTotal(game: FixtureGame) {
  return Math.max(1, Math.ceil(game.playing / (game.maxPlayersPerServer * 0.8)));
}

/** Up to 12 listed servers per game; friends sit in the server their fixture names. */
function serversFor(game: FixtureGame, withFriends: boolean): Server[] {
  const r = rng(game.art.seed * 7919);
  const count = Math.min(12, serverTotal(game));
  const list: Server[] = [];
  for (let n = 1; n <= count; n++) {
    const region = REGIONS[Math.floor(r() * r() * REGIONS.length)].code;
    const fill = n === 1 ? 1 : r();
    const playing = Math.max(1, Math.round(fill * game.maxPlayersPerServer));
    const friends = withFriends
      ? people.filter((p) => viewerFriendKeys.includes(p.key) && p.presence.status === "in_game" && p.presence.game === game.key && p.presence.server === n)
      : [];
    list.push({
      id: serverId(game.key, n),
      gameId: gameIdByKey.get(game.key)!,
      placeId: placeIdByKey.get(game.key)!,
      region,
      playing,
      maxPlayers: game.maxPlayersPerServer,
      friends: friends.map(userSummary),
      startedAt: new Date(NOW - Math.round(r() * 5 * 3600_000)).toISOString(),
      joinable: playing < game.maxPlayersPerServer,
    });
  }
  return list;
}

function matches(text: string, q: string) {
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

const GENRE_LINES: Record<string, string> = {
  adventure: "Explore, find things, go somewhere new.",
  action: "Fast rounds and quick reactions.",
  horror: "Dark places, best with friends.",
  obby: "Jump, climb, beat the course.",
  racing: "Cars, karts and anything else with wheels.",
  roleplay: "Pick a life and play it with others.",
  simulation: "Run a place or a machine, in detail.",
  strategy: "Plan ahead, outthink the other side.",
  survival: "Gather, build and last the night.",
  puzzle: "Think your way through.",
  social: "Places to meet and hang out.",
  sports: "Ball games and competitions.",
  tycoon: "Build a business and watch it grow.",
  party: "Short games for groups.",
};

/* ----------------------------------------------------------------- API */

export function createMockApi(scenario: MockScenario = "normal"): MetallicApi {
  const empty = scenario === "empty";
  const signedIn = scenario !== "guest";

  async function gate() {
    if (scenario === "slow") await new Promise((r) => setTimeout(r, 1800));
    if (scenario === "error") throw new ApiError("The Metallic API did not respond.", 503, "unavailable");
  }

  function requireAuth() {
    if (!signedIn) throw new ApiError("Sign in to see this.", 401, "unauthorized");
  }

  function isFriend(key: string) {
    return !empty && viewerFriendKeys.includes(key);
  }

  function relationshipTo(u: FixtureUser): UserProfile["relationship"] {
    if (!signedIn) return undefined;
    if (u.key === viewer.key) return "self";
    if (isFriend(u.key)) return "friend";
    if (!empty && friendRequests.some((r) => r.key === u.key)) return "request_received";
    return "none";
  }

  function ownedKeys() {
    return catalog.filter((i) => (empty ? i.price === 0 && i.creator.kind === "metallic" && i.owned : i.owned)).map((i) => i.key);
  }

  function avatarOf(u: FixtureUser): Avatar {
    const look = u.key === viewer.key && empty ? { skin: u.look.skin, equipped: {} } : u.look;
    return {
      userId: userIdByKey.get(u.key)!,
      bodyColors: { head: look.skin, torso: look.skin, arms: look.skin, legs: look.skin },
      equipped: Object.values(look.equipped).map((e) => itemSummary(itemByKey.get(itemKeyById.get(e.itemId)!)!)),
      headshotUrl: null,
      fullBodyUrl: null,
      updatedAt: "2026-10-28T00:00:00Z",
    };
  }

  return {
    async getViewer() {
      await gate();
      if (!signedIn) return null;
      const base = profile(viewer, "self");
      return {
        user: {
          ...base,
          bio: empty ? undefined : base.bio,
          socialLinks: empty ? [] : base.socialLinks,
          friendCount: empty ? 0 : base.friendCount,
          emailMasked: "a***@example.com",
          verification: empty
            ? { status: "unverified", deleteAfter: "2026-11-29T00:00:00Z" }
            : { status: "verified", deleteAfter: null },
          ageBand: "adult",
          accountStatus: "active",
          settings: {
            theme: "graphite",
            language: "en",
            privacy: { presenceVisibility: "friends", joinPolicy: "friends", friendRequests: "everyone", socialLinksVisibility: "everyone" },
          },
        },
        credits: empty ? 0 : 1240,
      };
    },

    async checkUsername(username) {
      await gate();
      const reason = unavailableUsernames.get(username.trim().toLowerCase()) ?? null;
      return { username, available: reason === null, reason };
    },

    async getHome() {
      await gate();
      const ranked = [...games].sort((a, b) => b.playing - a.playing);
      const newest = games
        .filter((x) => Date.parse(x.createdAt) >= Date.parse("2026-10-16T00:00:00Z"))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const personal = signedIn && !empty;
      const friendGames = personal
        ? [...new Set(viewerFriendKeys.map((k) => personByKey.get(k)!.presence).flatMap((p) => (p.status === "in_game" ? [p.game] : [])))]
        : [];
      const sections: HomeSection[] = [
        { id: "featured", kind: "featured", title: "Featured", reason: "Picked by the Metallic team", items: [g("night-market")] },
        ...(personal
          ? [
              { id: "continue", kind: "continue", title: "Continue playing", reason: "You played these recently", items: viewerRecent.map((r) => g(r.game)) } as const,
              { id: "friends", kind: "friends_playing", title: "Friends playing now", reason: "Games your friends are in right now", items: friendGames.map(g) } as const,
            ]
          : []),
        { id: "popular", kind: "popular", title: "Most played right now", reason: "Ranked by players in the game this minute", items: ranked.slice(0, 10).map(gameSummary) },
        { id: "first-party", kind: "first_party", title: "Made by Metallic", reason: "Games the Metallic team builds and runs", items: games.filter((x) => x.firstParty).map(gameSummary) },
        ...(personal
          ? [
              {
                id: "because-hollow-peak",
                kind: "because_you_played",
                title: "Because you played Hollow Peak",
                reason: "Players who climb Hollow Peak also play these",
                items: ["the-long-lantern", "lighthouse-keepers", "kelp-station-nine", "signal-lost", "orbit-couriers", "snowline-express"].map(g),
              } as const,
            ]
          : []),
        { id: "new", kind: "new_and_rising", title: "New this fortnight", reason: "Released in the last two weeks", items: newest.map(gameSummary) },
      ];
      return { generatedAt: new Date(NOW).toISOString(), sections };
    },

    async listGenres() {
      await gate();
      return GENRE_IDS.map((id) => ({
        id,
        name: genreName(id),
        description: GENRE_LINES[id] ?? "",
        gameCount: empty ? 0 : games.filter((x) => x.genres.includes(id)).length,
      }));
    },

    async listGames(q) {
      await gate();
      if (empty) return { items: [], nextCursor: null };
      let list = [...games];
      if (q.genre) list = list.filter((x) => x.genres.includes(q.genre as never));
      if (q.firstParty) list = list.filter((x) => x.firstParty);
      if (q.maxPlayers) list = list.filter((x) => x.maxPlayersPerServer <= q.maxPlayers!);
      if (q.device === "mobile") list = list.filter((x) => x.platforms.includes("android") || x.platforms.includes("ios"));
      const score = (x: FixtureGame) => x.rating.up / Math.max(1, x.rating.up + x.rating.down);
      switch (q.sort ?? "popular") {
        case "top_rated":
          list.sort((a, b) => score(b) - score(a));
          break;
        case "trending":
          list.sort((a, b) => b.playing / b.visits - a.playing / a.visits);
          break;
        case "new":
          list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          break;
        case "recently_updated":
          list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
          break;
        default:
          list.sort((a, b) => b.playing - a.playing);
      }
      return page(list.map(gameSummary), q.cursor, q.limit);
    },

    async searchGames(q) {
      await gate();
      if (empty) return { items: [], nextCursor: null };
      let list = games.filter((x) => matches(`${x.name} ${x.tagline} ${x.creator.name} ${x.genres.map(genreName).join(" ")} ${x.tags.join(" ")}`, q.q));
      if (q.genre) list = list.filter((x) => x.genres.includes(q.genre as never));
      list.sort((a, b) => Number(matches(b.name, q.q)) - Number(matches(a.name, q.q)) || b.playing - a.playing);
      return page(list.map(gameSummary), q.cursor, q.limit);
    },

    async getGame(id) {
      await gate();
      const game = gameByAnyId(id);
      if (!game) return null;
      const fav = signedIn && !empty && viewerFavoriteKeys.includes(game.key);
      const played = signedIn && !empty ? viewerRecent.find((r) => r.game === game.key) : undefined;
      const detail: GameDetail = {
        ...gameSummary(game),
        playing: livePlaying(game),
        description: game.description.join("\n\n"),
        screenshots: [1, 2, 3, 4].map((n) => `mock://games/${id}/screenshot-${n}`),
        startPlaceId: placeIdByKey.get(game.key)!,
        maxPlayersPerServer: game.maxPlayersPerServer,
        platforms: game.platforms,
        visits: game.visits,
        favorites: game.favorites,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        friendsPlaying: signedIn
          ? people
              .filter((p) => isFriend(p.key) && p.presence.status === "in_game" && p.presence.game === game.key)
              .map(userSummary)
          : [],
        viewer: signedIn
          ? { isFavorite: fav, vote: fav ? "up" : null, canVote: Boolean(played && played.minutesPlayed >= 10), lastPlayedAt: played?.lastPlayedAt ?? null }
          : undefined,
        gallery: [0, 101, 202, 303].map((d) => ({ ...game.art, seed: game.art.seed + d })),
      };
      return detail;
    },

    async listSimilarGames(id, limit = 6) {
      await gate();
      const game = gameByAnyId(id);
      if (!game) throw new ApiError("Game not found.", 404, "not_found");
      if (empty) return { items: [], nextCursor: null };
      const items = games
        .filter((o) => o.key !== game.key)
        .map((o) => ({ o, s: (o.genres.some((x) => game.genres.includes(x)) ? 3 : 0) + o.tags.filter((t) => game.tags.includes(t)).length }))
        .sort((a, b) => b.s - a.s || b.o.playing - a.o.playing)
        .slice(0, limit)
        .map(({ o }) => gameSummary(o));
      return { items, nextCursor: null };
    },

    async getRating(id) {
      await gate();
      const game = gameByAnyId(id);
      if (!game) throw new ApiError("Game not found.", 404, "not_found");
      const played = signedIn && !empty ? viewerRecent.find((r) => r.game === game.key) : undefined;
      const canVote = Boolean(played && played.minutesPlayed >= 10);
      return {
        gameId: id,
        up: game.rating.up,
        down: game.rating.down,
        upPercent: upPercent(game.rating),
        myVote: signedIn && viewerFavoriteKeys.includes(game.key) && !empty ? "up" : null,
        canVote: signedIn ? canVote : undefined,
        cannotVoteReason: signedIn && !canVote ? "play_longer" : null,
      };
    },

    async getLiveCounts(gameIds) {
      await gate();
      return gameIds.flatMap((id) => {
        const game = gameByAnyId(id);
        if (!game) return [];
        return [{ gameId: id, playing: empty ? 0 : livePlaying(game), servers: empty ? 0 : serverTotal(game), updatedAt: new Date().toISOString() }];
      });
    },

    async listRegions() {
      await gate();
      return REGIONS;
    },

    async listServers(id, q = {}) {
      await gate();
      const game = gameByAnyId(id);
      if (!game) throw new ApiError("Game not found.", 404, "not_found");
      if (empty) return { items: [], nextCursor: null };
      let list = serversFor(game, signedIn);
      if (q.region) list = list.filter((s) => s.region === q.region);
      if (q.hideFull ?? true) list = list.filter((s) => s.joinable);
      const order = q.sort ?? "most_players";
      list.sort(
        (a, b) =>
          b.friends.length - a.friends.length ||
          (order === "newest"
            ? Date.parse(b.startedAt) - Date.parse(a.startedAt)
            : order === "fewest_players"
              ? a.playing - b.playing
              : b.playing - a.playing),
      );
      return page(list, q.cursor, q.limit);
    },

    async createJoinTicket(id, req = {}) {
      await gate();
      requireAuth();
      const game = gameByAnyId(id);
      if (!game) throw new ApiError("Game not found.", 404, "not_found");
      const placeId = placeIdByKey.get(game.key)!;
      const ticket = `mock_${Math.random().toString(36).slice(2, 12)}`;
      const extra = req.serverId ? `&server=${req.serverId}` : req.followUserId ? `&follow=${req.followUserId}` : "";
      return {
        ticket,
        launchUri: `metallic://play?place=${placeId}&ticket=${ticket}${extra}`,
        placeId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },

    async getUserByUsername(username) {
      await gate();
      const u = personByUsername.get(username.toLowerCase());
      if (!u) return null;
      const p = profile(u, relationshipTo(u));
      if (u.key === viewer.key && empty) return { ...p, bio: undefined, socialLinks: [], friendCount: 0 };
      return p;
    },

    async searchUsers(q) {
      await gate();
      if (q.trim().length < 3) throw new ApiError("Search needs at least 3 characters.", 400, "query_too_short");
      const items = people.filter((p) => p.key !== viewer.key && (matches(p.username, q) || matches(p.displayName, q))).map(userSummary);
      return { items, nextCursor: null };
    },

    async listFriends(userId) {
      await gate();
      const key = userKeyById.get(userId);
      if (!key) throw new ApiError("User not found.", 404, "not_found");
      if (empty && key === viewer.key) return { items: [], nextCursor: null };
      const keys = key === viewer.key ? viewerFriendKeys : people.filter((p) => p.key !== key && p.key !== viewer.key).slice(0, 6).map((p) => p.key);
      const order = { in_game: 0, in_studio: 1, online: 2, offline: 3 } as const;
      const items: Friend[] = keys
        .map((k) => personByKey.get(k)!)
        .map((u) => ({ user: userSummary(u), since: "2026-10-01T00:00:00Z", presence: presence(u, key === viewer.key) }))
        .sort((a, b) => order[a.presence!.status] - order[b.presence!.status]);
      return { items, nextCursor: null };
    },

    async listFriendRequests(direction = "incoming") {
      await gate();
      requireAuth();
      if (empty || direction === "outgoing") return { items: [], nextCursor: null };
      return {
        items: friendRequests.map((r, n) => ({
          id: String(3050000000000001 + n),
          user: userSummary(personByKey.get(r.key)!),
          mutualFriends: r.mutualFriends,
          createdAt: r.createdAt,
        })),
        nextCursor: null,
      };
    },

    async getPresence(userIds) {
      await gate();
      return userIds.flatMap((id) => {
        const key = userKeyById.get(id);
        return key ? [presence(personByKey.get(key)!, isFriend(key))] : [];
      });
    },

    async listFavorites() {
      await gate();
      requireAuth();
      if (empty) return { items: [], nextCursor: null };
      return { items: viewerFavoriteKeys.map((k) => ({ game: g(k), favoritedAt: "2026-10-20T00:00:00Z" })), nextCursor: null };
    },

    async listPlayHistory() {
      await gate();
      requireAuth();
      if (empty) return { items: [], nextCursor: null };
      return { items: viewerRecent.map((r) => ({ game: g(r.game), lastPlayedAt: r.lastPlayedAt, minutesPlayed: r.minutesPlayed })), nextCursor: null };
    },

    async listCatalogItems(q) {
      await gate();
      if (empty) return { items: [], nextCursor: null };
      let list = [...catalog];
      if (q.q) list = list.filter((i) => matches(`${i.name} ${i.creator.name}`, q.q!));
      if (q.category) list = list.filter((i) => i.art.category === q.category);
      if (q.free) list = list.filter((i) => i.price === 0);
      switch (q.sort ?? "relevance") {
        case "price_low":
          list.sort((a, b) => a.price - b.price);
          break;
        case "price_high":
          list.sort((a, b) => b.price - a.price);
          break;
        case "newest":
          list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          break;
        default:
          break;
      }
      return page(list.map(itemSummary), q.cursor, q.limit ?? 30);
    },

    async getCatalogItem(id) {
      await gate();
      const key = itemKeyById.get(id);
      const i = key ? itemByKey.get(key) : undefined;
      if (!i) return null;
      const item: CatalogItem = {
        ...itemSummary(i),
        description: i.description,
        createdAt: i.createdAt,
        owned: signedIn ? ownedKeys().includes(i.key) : undefined,
      };
      return item;
    },

    async listInventory(category) {
      await gate();
      requireAuth();
      const items = ownedKeys()
        .map((k) => itemByKey.get(k)!)
        .filter((i) => !category || i.art.category === category)
        .map((i) => ({ item: itemSummary(i), acquiredAt: i.createdAt, source: i.price === 0 ? ("starter" as const) : ("purchase" as const), serial: null }));
      return { items, nextCursor: null };
    },

    async getMyAvatar() {
      await gate();
      requireAuth();
      return avatarOf(viewer);
    },

    async getUserAvatar(userId) {
      await gate();
      const key = userKeyById.get(userId);
      if (!key) throw new ApiError("User not found.", 404, "not_found");
      return avatarOf(personByKey.get(key)!);
    },

    async listStudioTemplates() {
      await gate();
      return templates;
    },
  };
}

