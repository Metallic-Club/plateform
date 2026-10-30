/**
 * Detects the desktop Launcher from its user-agent suffix
 * ` MetallicLauncher/<version> bridge/<n>` (plateform #7, section 1).
 *
 * Not a security boundary: anyone can send this user agent. The result only
 * picks a layout (the `launcher` shell). Never grant anything on it.
 *
 * No imports, so the Node test runner can load this file directly.
 */

export type LauncherUa = { version: string; bridge: number };

// The token must start the string or follow whitespace, so "XMetallicLauncher/"
// does not count. Versions are semver-like; the bridge version is an integer.
const TOKEN = /(?:^|\s)MetallicLauncher\/([0-9A-Za-z][0-9A-Za-z.+-]{0,63}) bridge\/([1-9][0-9]{0,5})(?=\s|$)/;

export function parseLauncherUserAgent(ua: string | null | undefined): LauncherUa | null {
  if (!ua || ua.length > 2048) return null;
  const m = TOKEN.exec(ua);
  if (!m) return null;
  return { version: m[1], bridge: Number(m[2]) };
}

export function isLauncherUserAgent(ua: string | null | undefined): boolean {
  return parseLauncherUserAgent(ua) !== null;
}

export type ShellChoice = "browser" | "launcher";

/**
 * The shell for a request. The `metallic_shell` cookie is a preview override
 * (Settings, Preview tools, or `?shell=`) and wins when it holds a valid value;
 * otherwise the user agent decides.
 */
export function chooseShell(cookieValue: string | null | undefined, ua: string | null | undefined): ShellChoice {
  if (cookieValue === "launcher" || cookieValue === "browser") return cookieValue;
  return isLauncherUserAgent(ua) ? "launcher" : "browser";
}
