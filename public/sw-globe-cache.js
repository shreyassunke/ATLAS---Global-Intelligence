const CACHE_NAME_TEXTURES = 'globe-textures-v1';
const CACHE_NAME_TILES = 'cesium-tiles-v1';
const CACHE_NAME_GOOGLE_3D = 'google-3d-tiles-v1';
const CACHE_NAME_GEOJSON = 'globe-geojson-v1';

const MAX_TILES = 500;
const MAX_GOOGLE_3D_TILES = 800;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Globe Textures (Cache-first, immutable)
  if (url.pathname.match(/\.(jpg|png|jpeg)$/) && (
      url.href.includes('three-globe') || 
      url.href.includes('earth-day') || 
      url.href.includes('earth-night') ||
      url.href.includes('earth-topology') ||
      url.href.includes('night-sky')
  )) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME_TEXTURES));
    return;
  }

  // 2. Google Photorealistic 3D Tiles (Stale-while-revalidate)
  //    These are the primary globe surface — cache aggressively
  if (
      url.href.includes('tile.googleapis.com') &&
      event.request.method === 'GET'
  ) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME_GOOGLE_3D, MAX_GOOGLE_3D_TILES));
    return;
  }

  // 3. Cesium Tile Imagery — other Cesium assets (Stale-while-revalidate)
  if (
      url.href.includes('assets.cesium.com') ||
      url.href.includes('basemaps.cartocdn.com')
  ) {
    if (event.request.method === 'GET') {
      event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME_TILES, MAX_TILES));
      return;
    }
  }

  // 4. GeoJSON Boundaries (Cache-first)
  if (url.href.includes('natural-earth-vector') && url.pathname.endsWith('.geojson')) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME_GEOJSON));
    return;
  }

  // 5. API/GDELT data (Network-only - do nothing, let it pass through)
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('', { status: 408, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
      manageCacheSize(cacheName, maxItems);
    }
    return networkResponse;
  }).catch(e => {
    console.warn('SW Tile Fetch Failed:', e);
  });

  return cachedResponse || fetchPromise;
}

async function manageCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
        await cache.delete(keys[i]);
    }
  }
}
