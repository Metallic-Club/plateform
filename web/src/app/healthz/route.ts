/*
 * GET /healthz for the website: the Launcher calls it before showing the site
 * and shows its bundled offline page on anything but a 2xx (plateform #7,
 * section 5). It must stay cheap: no API call, no database, no cookies.
 * The API's own readiness check (api/openapi.yaml /healthz, with its database
 * and cache checks) is a separate service; the edge sends /healthz on the
 * site's origin here.
 */
export function GET() {
  return new Response("ok\n", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
