// Local static server for trying the app and for tests: node tools/serve.mjs [root] [port]
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..')), port = Number(process.argv[3] || 8770);
const T = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain' };
http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ s.writeHead(404); return s.end('nf'); }
  s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control':'no-store' }); fs.createReadStream(f).pipe(s); }).listen(port, () => console.log('serving', root, port));
