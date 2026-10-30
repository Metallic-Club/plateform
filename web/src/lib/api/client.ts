import type {
  Avatar,
  CatalogItem,
  CatalogItemSummary,
  CatalogQuery,
  Favorite,
  Friend,
  FriendRequest,
  GameDetail,
  GameListQuery,
  GameSearchQuery,
  GameSummary,
  Genre,
  HomeFeed,
  Id,
  InventoryItem,
  ItemCategory,
  JoinRequest,
  JoinTicket,
  LiveCount,
  Page,
  PlayHistoryEntry,
  Presence,
  Rating,
  Region,
  Server,
  ServerQuery,
  StudioTemplate,
  UserProfile,
  UserSummary,
  UsernameCheck,
  Viewer,
} from "./types";
import type { WebSessionRedemption } from "../launcher-handoff";

/**
 * Everything the website reads from the platform. Pages depend on this
 * interface only. Method names follow the spec's operationIds; each one is a
 * single endpoint, except getViewer, which combines getMe and getWallet.
 * Lookups that 404 resolve to null; other failures throw ApiError.
 */
export interface MetallicApi {
  /** The signed-in account, or null when signed out. */
  getViewer(): Promise<Viewer | null>;
  checkUsername(username: string): Promise<UsernameCheck>;
  /** Ends the website session (POST /v1/auth/logout). Already signed out is not an error. */
  logOut(): Promise<void>;
  /**
   * Redeems a Launcher web-session code for a website session
   * (POST /v1/oauth/web-session/redeem, proposed in plateform #7). Never throws:
   * a used, expired or unknown code is `invalid`, anything else `unavailable`.
   */
  redeemWebSession(code: string): Promise<WebSessionRedemption>;

  getHome(): Promise<HomeFeed>;
  listGenres(): Promise<Genre[]>;
  listGames(query: GameListQuery): Promise<Page<GameSummary>>;
  searchGames(query: GameSearchQuery): Promise<Page<GameSummary>>;
  getGame(gameId: Id): Promise<GameDetail | null>;
  listSimilarGames(gameId: Id, limit?: number): Promise<Page<GameSummary>>;
  getRating(gameId: Id): Promise<Rating>;
  getLiveCounts(gameIds: Id[]): Promise<LiveCount[]>;

  listRegions(): Promise<Region[]>;
  listServers(gameId: Id, query?: ServerQuery): Promise<Page<Server>>;
  createJoinTicket(gameId: Id, request?: JoinRequest): Promise<JoinTicket>;

  getUserByUsername(username: string): Promise<UserProfile | null>;
  searchUsers(q: string): Promise<Page<UserSummary>>;
  listFriends(userId: Id): Promise<Page<Friend>>;
  listFriendRequests(direction?: "incoming" | "outgoing"): Promise<Page<FriendRequest>>;
  getPresence(userIds: Id[]): Promise<Presence[]>;

  listFavorites(): Promise<Page<Favorite>>;
  listPlayHistory(): Promise<Page<PlayHistoryEntry>>;

  listCatalogItems(query: CatalogQuery): Promise<Page<CatalogItemSummary>>;
  getCatalogItem(itemId: Id): Promise<CatalogItem | null>;
  listInventory(category?: ItemCategory): Promise<Page<InventoryItem>>;
  getMyAvatar(): Promise<Avatar>;
  getUserAvatar(userId: Id): Promise<Avatar>;

  /** Not in the P1 spec. Served from fixtures until Studio has an endpoint. */
  listStudioTemplates(): Promise<StudioTemplate[]>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The spec's stable Problem `code`. */
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
