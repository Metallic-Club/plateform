import { ApiError, type MetallicApi } from "./client";
import { SESSION_COOKIE } from "../launcher-handoff";
import type { Me, Problem, StudioTemplate, Wallet } from "./types";

/**
 * HTTP implementation of the spec, used when METALLIC_API_URL is set.
 * Runs on the server; `cookie` forwards the visitor's metallic_session
 * (getApi passes it from the incoming request).
 */
export function createHttpApi(baseUrl: string, cookie?: string): MetallicApi {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  async function call<T>(method: string, path: string, params?: object, body?: unknown): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), root);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const p = (await res.json().catch(() => null)) as Partial<Problem> | null;
      throw new ApiError(p?.detail ?? p?.title ?? `Request failed (${res.status})`, res.status, p?.code ?? "http_error");
    }
    return (res.status === 204 ? null : await res.json()) as T;
  }

  const get = <T>(path: string, params?: object) => call<T>("GET", path, params);

  /** A body-less call with extra headers; only the status matters. */
  async function callWith(method: string, path: string, headers: Record<string, string>): Promise<void> {
    const res = await fetch(new URL(path.replace(/^\//, ""), root), {
      method,
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}), ...headers },
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status, "http_error");
  }

  /** 404 becomes null, for detail lookups. */
  async function find<T>(path: string): Promise<T | null> {
    try {
      return await get<T>(path);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** 401 becomes null, for "who is signed in". */
  async function optionalAuth<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  }

  const enc = encodeURIComponent;
  const items = async <T>(path: string, params?: object) => (await get<{ items: T[] }>(path, params)).items;

  return {
    getViewer: () =>
      optionalAuth(async () => {
        const [user, wallet] = await Promise.all([
          get<Me>("/v1/users/me"),
          get<Wallet>("/v1/me/wallet"),
        ]);
        return { user, credits: wallet.balances.find((b) => b.currency === "credits")?.available ?? 0 };
      }),
    checkUsername: (username) => get("/v1/auth/username-check", { username }),

    logOut: async () => {
      if (!cookie) return;
      try {
        // Unsafe methods need the session's CSRF token (api/openapi.yaml, conventions).
        const { csrfToken } = await get<{ csrfToken: string }>("/v1/auth/session");
        await callWith("POST", "/v1/auth/logout", { "x-csrf-token": csrfToken });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        throw e;
      }
    },

    redeemWebSession: async (code) => {
      let res: Response;
      try {
        res = await fetch(new URL("v1/oauth/web-session/redeem", root), {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({ code }),
          cache: "no-store",
          redirect: "error",
        });
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      if (res.status === 400 || res.status === 404 || res.status === 410) return { ok: false, reason: "invalid" };
      if (!res.ok) return { ok: false, reason: "unavailable" };
      // Like /v1/auth/login, the API answers with Set-Cookie: metallic_session=...
      const set = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
      const session = set?.slice(SESSION_COOKIE.length + 1).split(";")[0];
      if (!session) return { ok: false, reason: "unavailable" };
      const maxAge = Number(/;\s*max-age=(\d+)/i.exec(set!)?.[1]);
      return { ok: true, session, maxAge: Number.isFinite(maxAge) ? maxAge : undefined };
    },

    getHome: () => get("/v1/home"),
    listGenres: () => items("/v1/genres"),
    listGames: (q) => get("/v1/games", q),
    searchGames: (q) => get("/v1/games/search", q),
    getGame: (id) => find(`/v1/games/${enc(id)}`),
    listSimilarGames: (id, limit) => get(`/v1/games/${enc(id)}/similar`, { limit }),
    getRating: (id) => get(`/v1/games/${enc(id)}/rating`),
    getLiveCounts: (gameIds) => items("/v1/games/live", { gameIds }),

    listRegions: () => items("/v1/regions"),
    listServers: (id, q) => get(`/v1/games/${enc(id)}/servers`, q),
    createJoinTicket: (id, req) => call("POST", `/v1/games/${enc(id)}/join`, undefined, req ?? {}),

    getUserByUsername: (username) => find(`/v1/usernames/${enc(username)}`),
    searchUsers: (q) => get("/v1/users/search", { q }),
    listFriends: (userId) => get(`/v1/users/${enc(userId)}/friends`),
    listFriendRequests: (direction = "incoming") => get("/v1/friends/requests", { direction }),
    getPresence: (userIds) => items("/v1/presence", { userIds }),

    listFavorites: () => get("/v1/me/favorites"),
    listPlayHistory: () => get("/v1/me/play-history"),

    listCatalogItems: (q) => get("/v1/catalog/items", q),
    getCatalogItem: (id) => find(`/v1/catalog/items/${enc(id)}`),
    listInventory: (category) => get("/v1/me/inventory", { category }),
    getMyAvatar: () => get("/v1/me/avatar"),
    getUserAvatar: (userId) => get(`/v1/users/${enc(userId)}/avatar`),

    // Not in the P1 spec: Studio templates stay on fixtures until there is an endpoint.
    listStudioTemplates: async () => {
      const { templates } = await import("./mock/fixtures/templates");
      return templates satisfies StudioTemplate[];
    },
  };
}

