// Service Worker for the Electronic Grimoire PWA
// Strategy (rebuilt in Code Review Plan Phase 8):
//
//   Same-origin (our HTML/JS/CSS/icons) ........ NETWORK-FIRST, cache fallback.
//       Online users always run the latest deployed code; offline serves the
//       last-seen copy. No cache-version bump needed per release anymore.
//   Versioned CDN runtime (React, Babel, Firebase SDKs, fonts) ... CACHE-FIRST.
//       These URLs are immutable, so cached copies never go stale. This is
//       what makes the app genuinely offline-capable.
//   Everything else cross-origin ............... NOT INTERCEPTED.
//       Firebase data traffic (firebaseio.com, firestore.googleapis.com,
//       identitytoolkit) and Discord webhooks go straight to the network and
//       are never cached.
//
// CACHE_NAME only needs bumping if the caching strategy or layout changes —
// NOT per release (network-first refreshes entries on every successful fetch).

const CACHE_NAME = 'mage-grimoire-v53';

// Everything needed to boot all three pages offline.
const PRECACHE = [
  './',
  './index.html',
  './wizard.html',
  './storyteller.html',
  './manifest.json',
  './theme.css',
  './shared/firebase.js',
  './shared/session.js',
  './shared/nav.js',
  './js/spellFactors.js',
  './js/dicePool.js',
  './js/character.js',
  './js/spellCompendium.js',
  './js/glossary.js',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Versioned CDN runtime — immutable, cached forever
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
];

// Cross-origin hosts handled cache-first. Google Fonts (wizard/storyteller)
// populate at runtime on first visit; pages fall back to system fonts offline
// if the fonts were never fetched.
const CACHE_FIRST_HOSTS = [
  'cdnjs.cloudflare.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Store a response under `request`. Redirected responses can't be replayed
// for navigations (local `npx serve` 301s *.html to clean URLs), so re-wrap
// them; GitHub Pages serves everything directly and never hits that path.
async function cachePut(cache, request, response) {
  if (!response || !response.ok) return;
  if (response.redirected) {
    const body = await response.clone().blob();
    await cache.put(request, new Response(body, { status: 200, headers: response.headers }));
  } else {
    await cache.put(request, response.clone());
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async (url) => {
      // CORS mode for CDN entries so SRI-tagged <script> requests can be
      // answered from cache (opaque responses would fail integrity checks).
      const request = new Request(url, url.startsWith('http') ? { mode: 'cors' } : undefined);
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Precache failed: ${url} (${response.status})`);
      await cachePut(cache, request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    await cachePut(cache, request, response);
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      // Clean-URL hosts (e.g. local `npx serve`) 301 "/wizard.html" → "/wizard";
      // map back so the precached .html entry answers the bare path offline.
      const path = new URL(request.url).pathname.replace(/\/$/, '/index');
      const htmlAlias = await cache.match(path + '.html');
      if (htmlAlias) return htmlAlias;
      const home = await cache.match('./index.html');
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await cachePut(cache, request, response);
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
  // All other cross-origin traffic (Firebase data, Discord webhooks, …)
  // is deliberately not intercepted.
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
