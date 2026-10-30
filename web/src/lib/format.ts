import type { Presence } from "@/lib/api/types";

const full = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(n: number) {
  return full.format(n);
}

export function formatCompact(n: number) {
  return compact.format(n);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string, now = Date.now()) {
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

const GENRE_NAMES: Record<string, string> = {
  adventure: "Adventure",
  action: "Action",
  horror: "Horror",
  obby: "Obstacle courses",
  racing: "Racing",
  roleplay: "Roleplay",
  simulation: "Simulation",
  strategy: "Strategy",
  survival: "Survival",
  puzzle: "Puzzle",
  social: "Hangouts",
  sports: "Sports",
  tycoon: "Tycoon",
  party: "Party",
};

/** Display name for a genre id. GET /v1/genres has the full list with names. */
export function genreName(id: string) {
  return GENRE_NAMES[id] ?? id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const PLATFORM_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", ios: "iOS" } as const;
export const CONTENT_LABEL = {
  everyone: "Everyone",
  mild: "Mild",
  moderate: "Moderate",
  restricted: "Restricted (18+)",
} as const;
export const DEVICE_LABEL = { desktop: "Computer", mobile: "Phone or tablet", console: "Console" } as const;
export const CATEGORY_LABEL = {
  hat: "Hats",
  hair: "Hair",
  face: "Faces",
  shirt: "Tops",
  pants: "Bottoms",
  shoes: "Shoes",
  back: "Back items",
} as const;

/** One line for where someone is: "Playing Ferrous Drift", "Last online 2 days ago". */
export function presenceText(p: Presence | undefined) {
  if (!p) return null;
  if (p.status === "in_game") return `Playing ${p.game?.name ?? "a game"}`;
  if (p.status === "in_studio") return "Building in Studio";
  if (p.status === "online") return "Online";
  return p.lastOnlineAt ? `Last online ${timeAgo(p.lastOnlineAt)}` : "Offline";
}
