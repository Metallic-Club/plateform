/**
 * Metallic platform API types.
 *
 * Written ahead of the OpenAPI spec (api/openapi.yaml on platform/design-20261030).
 * Field names use camelCase and ISO-8601 strings for times. When the spec lands,
 * these types are the single place to realign.
 */

export type Id = string;
export type IsoDate = string;

export interface Page<T> {
  items: T[];
  total: number;
  /** Opaque cursor for the next page, null on the last page. */
  next: string | null;
}

/* ----------------------------------------------------------------- games */

export const GENRES = [
  "adventure",
  "action",
  "horror",
  "obby",
  "racing",
  "roleplay",
  "simulation",
  "strategy",
  "survival",
  "puzzle",
  "social",
  "sports",
  "tycoon",
  "party",
] as const;
export type Genre = (typeof GENRES)[number];

export const DEVICES = ["desktop", "phone", "tablet", "controller"] as const;
export type Device = (typeof DEVICES)[number];

/** Procedural scene used for game art until creators upload real thumbnails. */
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

export interface Creator {
  id: Id;
  name: string;
  kind: "user" | "group" | "metallic";
}

export interface Rating {
  up: number;
  down: number;
}

export type SessionLength = "short" | "medium" | "long";
export type PartySize = "solo" | "small" | "large";

export interface GameSummary {
  id: Id;
  name: string;
  /** One line, shown on tiles. */
  tagline: string;
  genre: Genre;
  creator: Creator;
  art: GameArt;
  /** Players in the game right now. */
  playing: number;
  rating: Rating;
  maxPlayersPerServer: number;
  partySize: PartySize;
  devices: Device[];
  firstParty: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface GameDetail extends GameSummary {
  description: string[];
  gallery: GameArt[];
  tags: string[];
  sessionLength: SessionLength;
  visits: number;
  favourites: number;
}

export type Region =
  | "us-east"
  | "us-central"
  | "us-west"
  | "eu-west"
  | "eu-central"
  | "asia-east"
  | "oceania"
  | "sa-east";

export interface GameServer {
  id: Id;
  gameId: Id;
  region: Region;
  players: number;
  capacity: number;
  /** Estimated round trip from the viewer, in milliseconds. */
  pingMs: number;
  friendIds: Id[];
  startedAt: IsoDate;
}

export interface Presence {
  gameId: Id;
  playing: number;
  servers: number;
  at: IsoDate;
}

export interface GameQuery {
  q?: string;
  genre?: Genre;
  party?: PartySize;
  device?: Device;
  sort?: "playing" | "rating" | "new" | "updated";
  cursor?: string;
  limit?: number;
}

/* ----------------------------------------------------------------- people */

export type UserPresence =
  | { status: "offline"; lastSeenAt: IsoDate }
  | { status: "online" }
  | { status: "in-game"; gameId: Id; gameName: string; serverId: Id | null };

export interface UserSummary {
  id: Id;
  username: string;
  displayName: string;
  avatar: AvatarLook;
  presence: UserPresence;
}

export type SocialKind = "discord" | "youtube" | "twitch" | "tiktok" | "website";

export interface SocialLink {
  kind: SocialKind;
  handle: string;
  url: string;
}

export interface UserProfile extends UserSummary {
  bio: string;
  joinedAt: IsoDate;
  links: SocialLink[];
  friendCount: number;
}

export interface Viewer {
  user: UserProfile;
  credits: number;
  emailVerified: boolean;
}

export interface FriendRequest {
  id: Id;
  from: UserSummary;
  sentAt: IsoDate;
}

/* ----------------------------------------------------------------- avatar & catalog */

export const ITEM_SLOTS = ["hat", "hair", "face", "top", "bottom", "shoes", "back"] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export interface ItemArt {
  slot: ItemSlot;
  /** Shape key understood by the avatar renderer, e.g. "beanie", "hoodie". */
  shape: string;
  primary: string;
  secondary: string;
}

export interface AvatarLook {
  skin: string;
  equipped: Partial<Record<ItemSlot, ItemArt & { itemId: Id }>>;
}

export interface CatalogItem {
  id: Id;
  name: string;
  description: string;
  art: ItemArt;
  creator: Creator;
  /** Price in credits. 0 means free. */
  price: number;
  owned: boolean;
  createdAt: IsoDate;
}

export interface CatalogQuery {
  q?: string;
  slot?: ItemSlot;
  sort?: "new" | "price-asc" | "price-desc";
  free?: boolean;
  cursor?: string;
  limit?: number;
}

/* ----------------------------------------------------------------- home & create */

export interface HomeFeed {
  featured: GameSummary;
  continuePlaying: { game: GameSummary; lastPlayedAt: IsoDate }[];
  friendsPlaying: { friend: UserSummary; game: GameSummary }[];
  mostPlayed: GameSummary[];
  firstParty: GameSummary[];
  becauseYouPlayed: { basis: GameSummary; games: GameSummary[] } | null;
  newThisWeek: GameSummary[];
}

export interface StudioTemplate {
  id: Id;
  name: string;
  summary: string;
  includes: string[];
  art: GameArt;
}
