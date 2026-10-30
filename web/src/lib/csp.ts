/**
 * The site's Content-Security-Policy (plateform #7, section 5). Any script on
 * the site's origin can call the Launcher bridge, so scripts are nonce-only:
 * no inline scripts without the per-request nonce, no eval, no third-party
 * hosts, no frames in either direction.
 *
 * No imports, so the Node test runner can load this file directly.
 */
export function buildCsp({ nonce, dev, https }: { nonce: string; dev: boolean; https: boolean }): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // 'strict-dynamic' lets the nonce'd Next.js runtime load its own chunks.
    // React needs eval only in development, for its debugging stacks.
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Style elements need the nonce (Next.js adds it); style attributes are
    // allowed because components set CSS custom properties inline. Development
    // injects styles without a nonce, so it allows inline elements too.
    ["style-src", "'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    ["style-src-attr", "'unsafe-inline'"],
    // Avatar and game images come from the API's CDN host, which is configured
    // per environment and never written here; images cannot run script.
    ["img-src", "'self'", "data:", "blob:", "https:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(dev ? ["ws:", "wss:"] : [])],
    ["media-src", "'self'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["frame-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
  ];
  const policy = directives.map((d) => d.join(" "));
  // Only over https: on plain-http localhost it would rewrite every asset URL.
  if (https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** A fresh, unguessable nonce (128 random bits, base64). */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
