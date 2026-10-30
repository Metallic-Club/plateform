/**
 * Metallic platform API types.
 *
 * Wire types come from the OpenAPI spec (web/api/openapi.yaml, copied from
 * api/openapi.yaml on platform/design-20261030) through `pnpm api:types`,
 * which writes schema.d.ts. Pages use the names exported here.
 *
 * A few optional fields are marked UI-only. They are not in the spec: the
 * mock fills them with procedural art because there are no uploaded images
 * yet. When they are absent the UI falls back to the spec's image URLs.
 */
import type { components } from "./schema";

type S = components["schemas"];

/* ----------------------------------------------------------------- shared */

export type Id = S["Id"];
export type Timestamp = S["Timestamp"];
export type Problem = S["Problem"];

/** Every list endpoint returns `items` and `nextCursor`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/* ----------------------------------------------------------------- UI-only art */

/** Procedural scene drawn while games have no uploaded thumbnails. UI-only. */
export type ArtScene =
  | "dunes"
  | "forest"
  | "city"
  | "orbit"
  | "sea"
  | "platforms"
  | "track"
  | "blocks"
  | "peaks"
  | "arena"
  | "garden"
  | "rooms";

export interface GameArt {
  scene: ArtScene;
  /** sky, far, mid, near, detail */
  palette: readonly [string, string, string, string, string];
  seed: number;
}

/** Avatar categories the Wardrobe edits, in tab order. A subset of the spec's ItemCategory. */
export const WARDROBE_CATEGORIES = ["hat", "hair", "face", "shirt", "pants", "shoes", "back"] as const satisfies readonly S["ItemCategory"][];
export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];

/** How the avatar renderer draws an item. UI-only, stands in for thumbnailUrl. */
export interface ItemArt {
  category: WardrobeCategory;
  /** Shape key understood by the avatar renderer, e.g. "beanie", "hoodie". */
  shape: string;
  primary: string;
  secondary: string;
}

/** What the avatar renderer needs: skin colour and one drawn item per category. UI-only. */
export interface AvatarLook {
  skin: string;
  equipped: Partial<Record<WardrobeCategory, ItemArt & { itemId: Id }>>;
}

/* ----------------------------------------------------------------- games */

export type GenreId = S["GenreId"];
export type Genre = S["Genre"];
export type CreatorRef = S["CreatorRef"];
export type ContentLabel = S["ContentLabel"];
export type RatingSummary = S["RatingSummary"];
export type Rating = S["Rating"];
export type LiveCount = S["LiveCount"];
export type Platform = S["GameDetail"]["platforms"][number];

interface GameExtras {
  /** UI-only: procedural thumbnail. */
  art?: GameArt;
  /** UI-only: one line for tiles. Not in the spec yet. */
  tagline?: string;
}

export type GameSummary = S["GameSummary"] & GameExtras;
export type GameDetail = S["GameDetail"] &
  GameExtras & {
    /** UI-only: procedural stand-ins for `screenshots`. */
    gallery?: GameArt[];
  };

export type HomeSection = Omit<S["HomeSection"], "items"> & { items: GameSummary[] };
export type HomeSectionKind = S["HomeSection"]["kind"];
export interface HomeFeed {
  generatedAt: Timestamp;
  sections: HomeSection[];
}

type ListGamesParams = NonNullable<components["parameters"]["Device"]>;
export type DeviceHint = ListGamesParams;
export type GameSort = "popular" | "top_rated" | "trending" | "new" | "recently_updated";

/** GET /v1/games */
export interface GameListQuery {
  genre?: GenreId;
  sort?: GameSort;
  firstParty?: boolean;
  maxPlayers?: number;
  device?: DeviceHint;
  limit?: number;
  cursor?: string;
}

/** GET /v1/games/search */
export interface GameSearchQuery {
  q: string;
  genre?: GenreId;
  limit?: number;
  cursor?: string;
}

/* ----------------------------------------------------------------- servers */

export type RegionCode = S["RegionCode"];
export type Region = S["Region"];
export type Server = Omit<S["Server"], "friends"> & { friends: UserSummary[] };
export type ServerSort = "most_players" | "fewest_players" | "newest";
export interface ServerQuery {
  region?: RegionCode;
  sort?: ServerSort;
  hideFull?: boolean;
  limit?: number;
  cursor?: string;
}
export type JoinRequest = S["JoinRequest"];
export type JoinTicket = S["JoinTicket"];

/* ----------------------------------------------------------------- people */

interface UserExtras {
  /** UI-only: procedural avatar, stands in for avatarHeadshotUrl. */
  look?: AvatarLook;
}

export type UserSummary = S["UserSummary"] & UserExtras;
export type Presence = S["Presence"];
export type PresenceStatus = Presence["status"];
export type SocialPlatform = S["SocialPlatform"];
export type SocialLink = S["SocialLink"];
export type Relationship = S["Relationship"];
export type UserProfile = S["UserProfile"] & UserExtras;
export type Me = S["Me"] & UserExtras;
export type ThemeSetting = S["Theme"];
export type Settings = S["Settings"];
export type Audience = S["Audience"];
export type Friend = Omit<S["Friend"], "user"> & { user: UserSummary };
export type FriendRequest = Omit<S["FriendRequest"], "user"> & { user: UserSummary };
export type UsernameCheck = S["UsernameCheck"];
export type DeviceCodeResponse = S["DeviceCodeResponse"];

/** The signed-in account plus its spendable balance (GET /v1/users/me and /v1/me/wallet). */
export interface Viewer {
  user: Me;
  /** `available` credits from the wallet. */
  credits: number;
}

/* ----------------------------------------------------------------- library */

export type Favorite = Omit<S["Favorite"], "game"> & { game: GameSummary };
export type PlayHistoryEntry = Omit<S["PlayHistoryEntry"], "game"> & { game: GameSummary };

/* ----------------------------------------------------------------- catalog */

export type ItemCategory = S["ItemCategory"];
export type Price = S["Price"];

interface ItemExtras {
  /** UI-only: how the avatar renderer draws the item; stands in for thumbnailUrl. */
  art?: ItemArt;
}

export type CatalogItemSummary = S["CatalogItemSummary"] & ItemExtras;
export type CatalogItem = S["CatalogItem"] & ItemExtras;
export type InventoryItem = Omit<S["InventoryItem"], "item"> & { item: CatalogItemSummary };
export type BodyColors = S["BodyColors"];
export type Avatar = Omit<S["Avatar"], "equipped"> & { equipped: CatalogItemSummary[] };
export type CatalogSort = "relevance" | "newest" | "best_selling" | "price_low" | "price_high";

/** GET /v1/catalog/items */
export interface CatalogQuery {
  category?: ItemCategory;
  sort?: CatalogSort;
  q?: string;
  creatorId?: Id;
  free?: boolean;
  limit?: number;
  cursor?: string;
}

export type Wallet = S["Wallet"];

/* ----------------------------------------------------------------- Studio (not in the P1 spec) */

export interface StudioTemplate {
  id: string;
  name: string;
  summary: string;
  includes: string[];
  art: GameArt;
}
