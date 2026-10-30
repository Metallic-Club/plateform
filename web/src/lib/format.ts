const full = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(n: number) {
  return full.format(n);
}

export function formatCompact(n: number) {
  return compact.format(n);
}

export function ratingPercent(r: { up: number; down: number }) {
  const total = r.up + r.down;
  return total === 0 ? null : Math.round((r.up / total) * 100);
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

export const GENRE_LABEL = {
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
} as const;

export const REGION_LABEL = {
  "us-east": "US East",
  "us-central": "US Central",
  "us-west": "US West",
  "eu-west": "Europe West",
  "eu-central": "Europe Central",
  "asia-east": "Asia East",
  oceania: "Oceania",
  "sa-east": "South America",
} as const;

export const PARTY_LABEL = { solo: "Solo or 1v1", small: "Small groups", large: "Big servers" } as const;
export const DEVICE_LABEL = { desktop: "Desktop", phone: "Phone", tablet: "Tablet", controller: "Controller" } as const;
export const SESSION_LABEL = { short: "Under 15 minutes", medium: "15 to 45 minutes", long: "45 minutes or more" } as const;
export const SLOT_LABEL = {
  hat: "Hats",
  hair: "Hair",
  face: "Faces",
  top: "Tops",
  bottom: "Bottoms",
  shoes: "Shoes",
  back: "Back",
} as const;
