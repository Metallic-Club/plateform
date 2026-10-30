/*
 * GET /healthz for the website: the Launcher calls it before showing the site
 * and shows its bundled offline page on anything but a 2xx (plateform #7,
 * section 5). It must stay cheap: no API call, no database, no cookies.
 * API readiness, with its database and cache checks, is /v1/readyz on the API
 * and is internal only; on the public origin the edge sends /healthz here.
 */
export function GET() {
  return new Response("ok\n", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
