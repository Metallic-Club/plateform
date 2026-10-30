import { ApiError, type MetallicApi } from "./client";

/**
 * HTTP implementation, used when METALLIC_API_URL is set.
 * Paths are provisional until api/openapi.yaml is final; each method maps to
 * one endpoint so realigning is a one-line change per call.
 */
export function createHttpApi(baseUrl: string, token?: string): MetallicApi {
  async function get<T>(path: string, params?: object): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    if (res.status === 404) return null as T;
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      throw new ApiError(body.message ?? `Request failed (${res.status})`, res.status, body.code ?? "http_error");
    }
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;

  return {
    getViewer: () => get("/v1/me"),
    getHomeFeed: () => get("/v1/home"),
    searchGames: (q) => get("/v1/games", q),
    getGame: (id) => get(`/v1/games/${enc(id)}`),
    getSimilarGames: (id) => get(`/v1/games/${enc(id)}/similar`),
    listServers: (id) => get(`/v1/games/${enc(id)}/servers`),
    getPresence: (id) => get(`/v1/games/${enc(id)}/presence`),
    getUser: (username) => get(`/v1/users/${enc(username)}`),
    listFriends: (userId) => get(`/v1/users/${enc(userId)}/friends`),
    listFriendRequests: () => get("/v1/me/friend-requests"),
    searchUsers: (q) => get("/v1/users", { q }),
    listFavourites: (userId) => get(`/v1/users/${enc(userId)}/favourites`),
    isUsernameAvailable: async (username) =>
      (await get<{ available: boolean }>("/v1/usernames/availability", { username })).available,
    searchCatalog: (q) => get("/v1/catalog", q),
    getCatalogItem: (id) => get(`/v1/catalog/${enc(id)}`),
    listInventory: () => get("/v1/me/inventory"),
    getAvatar: () => get("/v1/me/avatar"),
    listStudioTemplates: () => get("/v1/studio/templates"),
  };
}
