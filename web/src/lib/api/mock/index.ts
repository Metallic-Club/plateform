import { ApiError, type MetallicApi } from "../client";
import type {
  CatalogItem,
  GameDetail,
  GameServer,
  GameSummary,
  Page,
  Region,
  UserProfile,
  UserSummary,
} from "../types";
import { catalog, catalogById } from "./fixtures/catalog";
import { gameById, games } from "./fixtures/games";
import { templates } from "./fixtures/templates";
import {
  friendRequests,
  people,
  personById,
  personByUsername,
  reservedUsernames,
  viewer,
  viewerFavouriteIds,
  viewerFriendIds,
  viewerRecent,
} from "./fixtures/users";

import type { MockScenario } from "@/lib/prefs";
export { MOCK_SCENARIOS, type MockScenario } from "@/lib/prefs";

function summary(g: GameDetail): GameSummary {
  const rest: Partial<GameDetail> = { ...g };
  for (const k of ["description", "gallery", "tags", "sessionLength", "visits", "favourites"] as const) delete rest[k];
  return rest as GameSummary;
}

function game(id: string): GameSummary {
  const g = gameById.get(id);
  if (!g) throw new Error(`Unknown fixture game ${id}`);
  return summary(g);
}

function toSummary(p: UserProfile): UserSummary {
  const { id, username, displayName, avatar, presence } = p;
  return { id, username, displayName, avatar, presence };
}

function page<T>(all: T[], cursor: string | undefined, limit = 24): Page<T> {
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const items = all.slice(start, start + limit);
  const nextStart = start + limit;
  return { items, total: all.length, next: nextStart < all.length ? String(nextStart) : null };
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

const REGIONS: { region: Region; ping: number }[] = [
  { region: "us-central", ping: 28 },
  { region: "us-east", ping: 41 },
  { region: "us-west", ping: 52 },
  { region: "eu-west", ping: 104 },
  { region: "eu-central", ping: 118 },
  { region: "sa-east", ping: 139 },
  { region: "asia-east", ping: 171 },
  { region: "oceania", ping: 196 },
];

/** Servers running for a game: players spread over servers about 80% full. */
function serverTotal(g: GameSummary) {
  return Math.max(1, Math.ceil(g.playing / (g.maxPlayersPerServer * 0.8)));
}

/** The browser lists the 12 nearest servers, as a real API would page them. */
function serversFor(g: GameDetail): GameServer[] {
  const r = rng(g.art.seed * 7919);
  const count = Math.min(12, serverTotal(g));
  const friendsHere = people.filter(
    (p) => viewerFriendIds.includes(p.id) && p.presence.status === "in-game" && p.presence.gameId === g.id,
  );
  const list: GameServer[] = [];
  for (let i = 0; i < count; i++) {
    const reg = REGIONS[Math.floor(r() * r() * REGIONS.length)];
    const fill = i === 0 ? 1 : r();
    const players = Math.max(1, Math.round(fill * g.maxPlayersPerServer));
    const id = `${g.id}-s${i + 1}`;
    list.push({
      id,
      gameId: g.id,
      region: reg.region,
      players,
      capacity: g.maxPlayersPerServer,
      pingMs: Math.round(reg.ping + r() * 18),
      friendIds: friendsHere
        .filter((p) => p.presence.status === "in-game" && p.presence.serverId === id)
        .map((p) => p.id),
      startedAt: new Date(Date.parse("2026-10-30T06:00:00Z") - Math.round(r() * 5 * 3600_000)).toISOString(),
    });
  }
  return list;
}

/** Live count drifts a little every 15 seconds so the presence poll visibly works. */
function livePlaying(g: GameSummary, now = Date.now()) {
  const bucket = Math.floor(now / 15_000);
  const wave = Math.sin(bucket * 0.9 + g.art.seed) * 0.012 + Math.sin(bucket * 0.13 + g.art.seed * 3) * 0.02;
  return Math.max(0, Math.round(g.playing * (1 + wave)));
}

function matches(text: string, q: string) {
  return text.toLowerCase().includes(q.trim().toLowerCase());
}

export function createMockApi(scenario: MockScenario = "normal"): MetallicApi {
  const empty = scenario === "empty";

  async function gate() {
    if (scenario === "slow") await new Promise((r) => setTimeout(r, 1800));
    if (scenario === "error") {
      throw new ApiError("The Metallic API did not respond.", 503, "unavailable");
    }
  }

  return {
    async getViewer() {
      await gate();
      if (scenario === "guest") return null;
      return { user: viewer, credits: empty ? 0 : 1240, emailVerified: !empty };
    },

    async getHomeFeed() {
      await gate();
      const ranked = [...games].sort((a, b) => b.playing - a.playing).map(summary);
      const newest = [...games]
        .filter((g) => Date.parse(g.createdAt) >= Date.parse("2026-10-18T00:00:00Z"))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(summary);
      const signedIn = scenario !== "guest";
      const friends = viewerFriendIds.map((id) => personById.get(id)!);
      return {
        featured: game("night-market"),
        continuePlaying:
          empty || !signedIn ? [] : viewerRecent.map((r) => ({ game: game(r.gameId), lastPlayedAt: r.lastPlayedAt })),
        friendsPlaying:
          empty || !signedIn
            ? []
            : friends
                .filter((f) => f.presence.status === "in-game")
                .map((f) => ({
                  friend: toSummary(f),
                  game: game(f.presence.status === "in-game" ? f.presence.gameId : ""),
                })),
        mostPlayed: ranked.slice(0, 10),
        firstParty: games.filter((g) => g.firstParty).map(summary),
        becauseYouPlayed:
          empty || !signedIn
            ? null
            : {
                basis: game("hollow-peak"),
                games: ["the-long-lantern", "lighthouse-keepers", "kelp-station-nine", "signal-lost", "orbit-couriers", "snowline-express"].map(game),
              },
        newThisWeek: newest,
      };
    },

    async searchGames(query) {
      await gate();
      if (empty) return { items: [], total: 0, next: null };
      let list = games.map(summary);
      if (query.q) list = list.filter((g) => matches(`${g.name} ${g.tagline} ${g.creator.name} ${g.genre} ${gameById.get(g.id)?.tags.join(" ")}`, query.q!));
      if (query.genre) list = list.filter((g) => g.genre === query.genre);
      if (query.party) list = list.filter((g) => g.partySize === query.party);
      if (query.device) list = list.filter((g) => g.devices.includes(query.device!));
      const score = (g: GameSummary) => g.rating.up / Math.max(1, g.rating.up + g.rating.down);
      switch (query.sort ?? "playing") {
        case "rating":
          list.sort((a, b) => score(b) - score(a));
          break;
        case "new":
          list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          break;
        case "updated":
          list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
          break;
        default:
          list.sort((a, b) => b.playing - a.playing);
      }
      return page(list, query.cursor, query.limit);
    },

    async getGame(id) {
      await gate();
      const g = gameById.get(id);
      return g ? { ...g, playing: livePlaying(g) } : null;
    },

    async getSimilarGames(id) {
      await gate();
      const g = gameById.get(id);
      if (!g || empty) return [];
      return games
        .filter((o) => o.id !== id)
        .map((o) => ({ o, s: (o.genre === g.genre ? 3 : 0) + o.tags.filter((t) => g.tags.includes(t)).length + (o.partySize === g.partySize ? 1 : 0) }))
        .sort((a, b) => b.s - a.s || b.o.playing - a.o.playing)
        .slice(0, 6)
        .map(({ o }) => summary(o));
    },

    async listServers(gameId) {
      await gate();
      const g = gameById.get(gameId);
      if (!g) throw new ApiError("Game not found.", 404, "not_found");
      return empty ? [] : serversFor(g);
    },

    async getPresence(gameId) {
      await gate();
      const g = gameById.get(gameId);
      if (!g) throw new ApiError("Game not found.", 404, "not_found");
      const servers = empty ? 0 : serverTotal(g);
      return { gameId, playing: empty ? 0 : livePlaying(g), servers, at: new Date().toISOString() };
    },

    async getUser(username) {
      await gate();
      return personByUsername.get(username.toLowerCase()) ?? null;
    },

    async listFriends(userId) {
      await gate();
      if (empty) return [];
      const ids = userId === viewer.id ? viewerFriendIds : people.filter((p) => p.id !== userId).slice(0, 6).map((p) => p.id);
      const order = { "in-game": 0, online: 1, offline: 2 } as const;
      return ids
        .map((id) => toSummary(personById.get(id)!))
        .sort((a, b) => order[a.presence.status] - order[b.presence.status]);
    },

    async listFriendRequests() {
      await gate();
      return empty ? [] : friendRequests;
    },

    async searchUsers(q) {
      await gate();
      if (!q.trim()) return [];
      return people
        .filter((p) => p.id !== viewer.id && (matches(p.username, q) || matches(p.displayName, q)))
        .map(toSummary);
    },

    async listFavourites(userId) {
      await gate();
      if (empty) return [];
      if (userId === viewer.id) return viewerFavouriteIds.map(game);
      const r = rng(userId.length * 131);
      return games.filter(() => r() > 0.7).slice(0, 5).map(summary);
    },

    async isUsernameAvailable(username) {
      await gate();
      return !reservedUsernames.has(username.trim().toLowerCase());
    },

    async searchCatalog(query) {
      await gate();
      if (empty) return { items: [], total: 0, next: null };
      let list: CatalogItem[] = [...catalog];
      if (query.q) list = list.filter((i) => matches(`${i.name} ${i.creator.name} ${i.art.slot}`, query.q!));
      if (query.slot) list = list.filter((i) => i.art.slot === query.slot);
      if (query.free) list = list.filter((i) => i.price === 0);
      switch (query.sort ?? "new") {
        case "price-asc":
          list.sort((a, b) => a.price - b.price);
          break;
        case "price-desc":
          list.sort((a, b) => b.price - a.price);
          break;
        default:
          list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      }
      return page(list, query.cursor, query.limit ?? 30);
    },

    async getCatalogItem(id) {
      await gate();
      return catalogById.get(id) ?? null;
    },

    async listInventory() {
      await gate();
      return catalog.filter((i) => (empty ? i.price === 0 && i.creator.kind === "metallic" : i.owned));
    },

    async getAvatar() {
      await gate();
      return viewer.avatar;
    },

    async listStudioTemplates() {
      await gate();
      return templates;
    },
  };
}
