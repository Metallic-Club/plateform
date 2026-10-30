/** User and host preferences carried in cookies so the server renders them on first paint. */

export const THEMES = [
  { id: "graphite", name: "Graphite", note: "Dark charcoal. The default." },
  { id: "aluminium", name: "Aluminium", note: "Light, for bright rooms and daytime." },
  { id: "anodised", name: "Anodised", note: "Dark with a violet cast, after anodised titanium." },
] as const;
export type Theme = (typeof THEMES)[number]["id"];

export type Shell = "browser" | "launcher";
export type Display = "standard" | "tv";

export const COOKIES = {
  theme: "metallic_theme",
  shell: "metallic_shell",
  display: "metallic_display",
  mock: "metallic_mock",
} as const;

/**
 * Preview scenarios for the mock API, so every state can be seen without a backend:
 *   normal - fixtures as written     empty - new account, nothing anywhere
 *   error  - API unreachable         slow  - fixtures after a delay (loading states)
 *   guest  - signed out
 */
export const MOCK_SCENARIOS = ["normal", "empty", "error", "slow", "guest"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function parseTheme(v: string | undefined | null): Theme {
  return THEMES.some((t) => t.id === v) ? (v as Theme) : "graphite";
}
export function parseShell(v: string | undefined | null): Shell {
  return v === "launcher" ? "launcher" : "browser";
}
export function parseDisplay(v: string | undefined | null): Display {
  return v === "tv" ? "tv" : "standard";
}
