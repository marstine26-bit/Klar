const CACHE = 'klar-v6';
const OFFLINE_PAGE = '/';
// '/' and '/app' are now served natively as index.html at their own paths
// (see _redirects) -- the old '/klarmoney-landing.html' entry here is gone
// since that file no longer exists post-rename; caching.addAll() fails the
// whole install step on any single 404, so a stale entry here would have
// silently broken offline precaching for everyone.
const PRECACHE = [
  '/',
  '/app',
  '/manifest.json',
  '/icons/klar-256.png',
  '/icons/klar-512.png',
  '/klar-financial-model.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Don't intercept Supabase, Groq, Dodo Payments, Crisp, PostHog, or Salt Edge API calls
  const url = new URL(e.request.url);
  const passThrough = ['supabase.co', 'groq.com', 'dodopayments.com', 'crisp.chat',
                       'posthog.com', 'saltedge.com', 'frankfurter.app', 'frankfurter.dev'];
  if (passThrough.some(h => url.hostname.includes(h))) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match(OFFLINE_PAGE)))
  );
});
