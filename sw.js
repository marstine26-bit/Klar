const CACHE = 'klar-v5';
const OFFLINE_PAGE = '/';
const PRECACHE = [
  '/',
  '/app',
  '/manifest.json',
  '/icons/klar-256.png',
  '/icons/klar-512.png',
  '/klarmoney-landing.html',
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
  // Don't intercept Supabase, Groq, Lemon Squeezy, Crisp, PostHog, or Salt Edge API calls
  const url = new URL(e.request.url);
  const passThrough = ['supabase.co', 'groq.com', 'lemonsqueezy.com', 'crisp.chat',
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
