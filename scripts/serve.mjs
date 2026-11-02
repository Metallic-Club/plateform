import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
export function createPreviewServer({ directory = '.' } = {}) {
const root = path.resolve(directory);
return http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed'); return;
    }
    let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (url === '/') url = '/index.html';
    // Serve application assets only; never expose repository metadata or local config.
    // Artwork lives beside index.html, so the same relative paths work here, in dist/ and on Pages.
    if (!(url === '/index.html' || url === '/favicon.svg' || /^\/src\/[\w-]+\.(js|css)$/.test(url) || /^\/art\/[\w-]+\.svg$/.test(url))) {
      res.writeHead(404).end('Not found'); return;
    }
    const file = path.resolve(root, '.' + url);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const production = process.argv.includes('--dist');
  createPreviewServer({ directory: production ? 'dist' : '.' })
    .listen(4173, '127.0.0.1', () => console.log('Metallic: http://127.0.0.1:4173'));
}
