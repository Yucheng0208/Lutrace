// 本機預覽用的小伺服器：public/ 的靜態檔案＋src/worker.js 的 /api/*（不需安裝 wrangler）
// 用法：node scripts/dev-server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/worker.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8787);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.ttf': 'font/ttf',
};

const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(root, 'index.html'); }
    try {
      return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  },
};

http.createServer(async (req, res) => {
  try {
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers });
    const response = await worker.fetch(request, { ASSETS });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`光痕 Lutrace: http://localhost:${port}`));
