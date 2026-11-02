/* שבצ״ק נא · offline cache. Every file of the app is kept on the phone, so it opens with no signal.
   VERSION and ASSETS are written by `node tools/stamp.mjs`; run it after changing any file. */
const VERSION = "37b94cab6023";
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "css/fonts.css",
  "js/01-utils-store.js",
  "js/02-engine.js",
  "js/03-insights.js",
  "js/04-shell.js",
  "js/05-calendar.js",
  "js/06-day.js",
  "js/07-board.js",
  "js/08-ask.js",
  "js/09-roster.js",
  "js/10-manage.js",
  "js/11-gear.js",
  "js/12-sheets.js",
  "js/13-setup.js",
  "js/14-actions.js",
  "js/15-share.js",
  "js/16-rulebook.js",
  "js/17-pwa.js",
  "js/99-boot.js",
  "fonts/ibm-plex-mono-latin-400-normal.woff2",
  "fonts/ibm-plex-mono-latin-600-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-hebrew-400-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-hebrew-500-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-hebrew-600-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-hebrew-700-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-latin-600-normal.woff2",
  "fonts/ibm-plex-sans-hebrew-latin-700-normal.woff2",
  "fonts/secular-one-hebrew-400-normal.woff2",
  "fonts/secular-one-latin-400-normal.woff2",
  "vendor/xlsx.bundle.js",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
];
const CACHE = "shabtzak-" + VERSION;

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("shabtzak-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* the page asks for this when the commander taps "עדכון" */
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // any page address (also ?text=… from Android sharing) opens the cached app
  if (r.mode === "navigate"){ e.respondWith(caches.match("index.html").then(m => m || fetch(r))); return; }
  e.respondWith(caches.match(r, { ignoreSearch:true }).then(m => m || fetch(r)));
});
