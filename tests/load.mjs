// Loads the app's scripts into a Node vm with small browser stubs, for engine tests.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export function loadApp({ today, fixture } = {}){
  const store = new Map();
  const el = () => ({ innerHTML:'', textContent:'', hidden:false, style:{}, dataset:{}, setAttribute(){}, addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){}, querySelector:() => null, querySelectorAll:() => [] });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, Blob, Response, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream, btoa, atob, structuredClone,
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { hash:'', search:'', pathname:'/', protocol:'http:' }, history: { replaceState(){} },
    navigator: { userAgent:'node', platform:'node', maxTouchPoints:0, onLine:true, clipboard:{ writeText: async () => {} } },
    requestAnimationFrame: () => 0, matchMedia: () => ({ matches:false }),
    document: { querySelector: () => el(), querySelectorAll: () => [], getElementById: () => null, addEventListener(){}, createElement: el, body: el(), head: el(), activeElement:null, documentElement: el() },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  const files = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src="(js\/[^"]+)"/g).map(m => m.slice(5, -1)).filter(f => !f.endsWith('99-boot.js'));
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  if (today) run(`todayStr = () => ${JSON.stringify(today)};`);
  if (fixture){ store.set('shabtzak-app-v1', JSON.stringify(fixture)); run('initStore()'); }
  return { ctx, run, store };
}
export const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixture.json'), 'utf8'));
