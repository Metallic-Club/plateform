/**
 * Validates a `next` redirect target so it can only point at this site.
 * Returns a path (with query and hash) on the same origin, or the fallback.
 *
 * Rejected, among others: `//evil.test`, `/\evil.test`, `\\evil.test`,
 * `https://evil.test`, `javascript:...`, paths with control characters or
 * backslashes (browsers treat `\` as `/`), and anything that resolves to
 * another origin.
 *
 * No imports, so the Node test runner can load this file directly.
 */
export function safeNextPath(raw: string | null | undefined, origin: string, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  // Only absolute paths on this site. "//" and "/\" are protocol-relative URLs.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return fallback;
  // Backslashes, control characters and whitespace have no business in a path we
  // redirect to; browsers normalise some of them into "//".
  if (/[\\\u0000- \u007f-\u009f]/.test(raw)) return fallback;

  let base: URL;
  let target: URL;
  try {
    base = new URL(origin);
    target = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (target.origin !== base.origin) return fallback;
  // Never bounce back into the handoff itself.
  if (target.pathname.startsWith("/auth/launcher-handoff")) return fallback;
  const path = `${target.pathname}${target.search}${target.hash}`;
  // Dot segments can collapse to "//host" ("/.//evil.test"); that would be
  // protocol-relative again once it is a Location header.
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
