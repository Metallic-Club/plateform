import type { AvatarLook, GameArt, ItemArt, SocialPlatform } from "../../types";

/*
 * Shapes the fixtures are written in. They use readable keys ("ferrous-drift",
 * "u-lumen") so relations between fixtures are easy to follow; the mock turns
 * them into the spec's types and numeric ids.
 */

export interface FixtureCreator {
  key: string;
  name: string;
  /** "metallic" maps to a first-party user creator. */
  kind: "user" | "group" | "metallic";
}

export const GENRE_IDS = [
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
export type FixtureGenre = (typeof GENRE_IDS)[number];

export interface FixtureGame {
  key: string;
  name: string;
  tagline: string;
  genres: FixtureGenre[];
  creator: FixtureCreator;
  art: GameArt;
  playing: number;
  rating: { up: number; down: number };
  maxPlayersPerServer: number;
  platforms: ("windows" | "macos" | "linux" | "android" | "ios")[];
  createdAt: string;
  updatedAt: string;
  description: string[];
  /** Search terms; the spec searches tags server-side but does not return them. */
  tags: string[];
  visits: number;
  favorites: number;
  firstParty: boolean;
  contentLabel: "everyone" | "mild" | "moderate";
}

export type FixturePresence =
  | { status: "offline"; lastOnlineAt: string }
  | { status: "online" }
  | { status: "in_studio" }
  | { status: "in_game"; game: string; server: number | null };

export interface FixtureUser {
  key: string;
  username: string;
  displayName: string;
  look: AvatarLook;
  presence: FixturePresence;
  bio: string;
  links: { platform: SocialPlatform; handle: string }[];
  friendCount: number;
  createdAt: string;
}

export interface FixtureItem {
  key: string;
  name: string;
  description: string;
  art: ItemArt;
  creator: FixtureCreator;
  /** Credits. 0 is free. */
  price: number;
  /** In the sample player's inventory. */
  owned: boolean;
  createdAt: string;
}
