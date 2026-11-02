// Writes the offline file list and a content-based version into sw.js. Run after changing any app file:
//   node tools/stamp.mjs          (writes)
//   node tools/stamp.mjs --check  (fails if sw.js is out of date; used in CI)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dirs = ['css', 'js', 'fonts', 'vendor', 'icons'];
const files = ['index.html', 'manifest.webmanifest'];
for (const d of dirs) for (const f of fs.readdirSync(path.join(root, d)).sort()) if (!/\.(map|txt|md)$/.test(f) && !f.startsWith('.')) files.push(d + '/' + f);
const hash = crypto.createHash('sha256'); for (const f of files) hash.update(f).update(fs.readFileSync(path.join(root, f)));
const version = hash.digest('hex').slice(0, 12);
const swPath = path.join(root, 'sw.js'), before = fs.readFileSync(swPath, 'utf8'); let sw = before;
sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`).replace(/const ASSETS = \[[^\]]*\];/s, 'const ASSETS = [\n  "./",\n' + files.map(f => `  "${f}",`).join('\n') + '\n];');
if (process.argv.includes('--check')){ if (sw !== before){ console.error('sw.js is out of date: run node tools/stamp.mjs'); process.exit(1); } console.log('sw.js is up to date:', version); }
else { fs.writeFileSync(swPath, sw); console.log('sw.js:', version, files.length + 1, 'files'); }
