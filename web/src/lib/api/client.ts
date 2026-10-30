import type {
  AvatarLook,
  CatalogItem,
  CatalogQuery,
  FriendRequest,
  GameDetail,
  GameQuery,
  GameServer,
  GameSummary,
  HomeFeed,
  Id,
  Page,
  Presence,
  StudioTemplate,
  UserProfile,
  UserSummary,
  Viewer,
} from "./types";

/**
 * Everything the website reads from the platform. Pages depend on this
 * interface only, never on a concrete implementation.
 */
export interface MetallicApi {
  /** The signed-in account, or null when signed out. */
  getViewer(): Promise<Viewer | null>;

  getHomeFeed(): Promise<HomeFeed>;
  searchGames(query: GameQuery): Promise<Page<GameSummary>>;
  getGame(id: Id): Promise<GameDetail | null>;
  getSimilarGames(id: Id): Promise<GameSummary[]>;
  listServers(gameId: Id): Promise<GameServer[]>;
  getPresence(gameId: Id): Promise<Presence>;

  getUser(username: string): Promise<UserProfile | null>;
  listFriends(userId: Id): Promise<UserSummary[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
  searchUsers(q: string): Promise<UserSummary[]>;
  listFavourites(userId: Id): Promise<GameSummary[]>;
  isUsernameAvailable(username: string): Promise<boolean>;

  searchCatalog(query: CatalogQuery): Promise<Page<CatalogItem>>;
  getCatalogItem(id: Id): Promise<CatalogItem | null>;
  listInventory(): Promise<CatalogItem[]>;
  getAvatar(): Promise<AvatarLook>;

  listStudioTemplates(): Promise<StudioTemplate[]>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
