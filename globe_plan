# Globe Caching, Night Shading Fix, & Data Point Reliability

## Problem Summary

Three issues from the user's screenshots and observations:

1. **No globe caching** — The Cesium/Globe.GL globes fetch textures, tiles, and GeoJSON fresh every load, causing slow startup and potential site crashes on poor connections.
2. **Night shading is too harsh** (Image 1) — The Cesium globe shows a stark blue/navy night side instead of the more natural, subtle teal-dark shading seen in Image 2 (Globe.GL). The goal is to match Image 2's look on Cesium.
3. **Data points don't always load** — Events sometimes fail to appear on the globe due to race conditions in the initialization sequence.

---

## Proposed Changes

### 1. Globe Texture & Tile Caching (Service Worker)

#### [NEW] [sw-globe-cache.js](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/public/sw-globe-cache.js)

A dedicated service worker that intercepts and caches requests for:
- **Globe textures**: CDN textures (earth-day.jpg, earth-night.jpg, bump, night-sky.png) → `globe-textures` cache (cache-first, immutable)
- **Cesium tile imagery**: World Imagery, Black Marble, Carto labels → `cesium-tiles` cache (stale-while-revalidate, max ~500 entries, auto-pruned)
- **GeoJSON boundaries**: Natural Earth borders/states → `globe-geojson` cache (cache-first, revalidate weekly)
- **GDELT/API data**: NOT cached — always fresh from network

Strategy: **Cache-first for static assets** (textures, GeoJSON), **stale-while-revalidate for tiles** (fast load with background refresh), **network-only for API data** (always live).

#### [MODIFY] [index.html](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/index.html)

Register the service worker:
```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-globe-cache.js')
  }
</script>
```

---

### 2. Night Shading — Match Image 2 (Globe.GL-style)

> [!IMPORTANT]
> Image 1 (current Cesium): harsh flat navy-blue night side with extreme contrast at the terminator.
> Image 2 (Globe.GL): soft teal-dark tones, land visible on night side, smooth gradual terminator, more natural limb glow.

#### [MODIFY] [CesiumGlobe.jsx](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/src/components/Globe/CesiumGlobe.jsx)

**Night-side appearance fixes:**
- `baseLayer.nightAlpha`: `0.45` → `0.28` — Darken base imagery at night (less blue bleed-through)
- Night lights `brightness`: `2.2` → `1.6` — Less oversaturated city glow
- Night lights `gamma`: `0.86` → `1.0` — Remove the shadow lifting that causes blue tinting
- Night lights `contrast`: `1.3` → `1.1` — Softer night lights
- Night lights `saturation`: `1.18` → `0.9` — Desaturate slightly (the blue comes from oversaturated night texture)

**Atmosphere/limb fixes (softer, Globe.GL-like edge):**
- `globe.atmosphereLightIntensity`: `12.0` → `8.0` — Less intense limb glow
- `scene.atmosphere.lightIntensity`: `6.0` → `4.5` — Softer atmospheric scatter
- `scene.atmosphere.brightnessShift`: `-0.06` → `-0.12` — Darker night atmosphere (kills the blue wash)
- `scene.fog.minimumBrightness`: `0.045` → `0.025` — Darker night horizon (the current value lifts the blue)
- `scene.skyAtmosphere.brightnessShift`: `-0.08` → `-0.14` — Darker sky at night

**Sun:**
- `SunLight.intensity`: `1.7` → `2.0` — Brighter day side to increase contrast vs darker night
- `scene.skyAtmosphere.atmosphereLightIntensity`: `28.0` → `22.0` — Less aggressive limb bloom

---

### 3. Fix Data Points Not Loading (Race Condition)

The root cause is a **race condition**: `initEventBusSystem()` starts fetching data, but the globe component may not have finished its async initialization (textures, terrain, imagery providers) by the time events arrive. When `rebuildEventMarkers` runs but `viewerRef.current` is null or the viewer is still initializing, the events are silently dropped — and since the news content signature hasn't changed, they never rebuild.

#### [MODIFY] [CesiumGlobe.jsx](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/src/components/Globe/CesiumGlobe.jsx)

**Fix 1 — Guard + retry `rebuildEventMarkers`:**
```js
// Event markers effect — add init guard + deferred retry
useEffect(() => {
  const viewer = viewerRef.current
  if (!viewer || viewer.isDestroyed()) {
    // Viewer isn't ready yet — schedule a retry instead of dropping events
    const retryTimer = setTimeout(() => {
      const v = viewerRef.current
      if (v && !v.isDestroyed() && events.length > 0) {
        rebuildEventMarkers(v, events)
      }
    }, 1500)
    return () => clearTimeout(retryTimer)
  }
  if (events.length === 0 && eventBillboardMapRef.current.size === 0) return
  rebuildEventMarkers(viewer, events)
  // ... cluster logic
}, [events, activeDimensions, priorityFilter])
```

**Fix 2 — Globe `onReady` triggers a re-render:**
After all async init completes (imagery, terrain, borders), call `requestSnapshot()` to force the eventBus to re-emit its current state, so the globe gets events even if they arrived before it was ready.

#### [MODIFY] [GlobeGLView.jsx](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/src/components/Globe/GlobeGLView.jsx)

**Same pattern**: After globe init completes, force an event data re-sync by reading the current store state:
```js
// After globe init, force data sync from current store
setTimeout(() => {
  const { events, newsItems } = useAtlasStore.getState()
  const visible = getVisibleItems()
  globe.pointsData(visible)
}, 500)
```

#### [MODIFY] [eventBus.js](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/src/core/eventBus.js)

Export `requestSnapshot()` so globe components can explicitly ask for the current event state after init.

---

### 4. Document in `.cursorrules`

#### [MODIFY] [.cursorrules](file:///c:/Shreyas/Work/Global%20Intelligence/atlas/.cursorrules)

Append a new `DATA LOADING` section with invariants:

```
# DATA LOADING — GLOBE MARKER INVARIANTS (NEVER BREAK)
- Globe components MUST handle the case where events arrive before the viewer/globe 
  is initialized. Use a deferred retry (setTimeout) when viewerRef is null.
- Globe components MUST re-request event data AFTER async initialization completes 
  (textures, tiles, terrain). Use requestSnapshot() or re-read store state.
- NEVER silently drop events. If the globe isn't ready, queue or retry.
- The event data lifecycle is: fetchManager.worker → eventBus.worker → atlasStore → 
  globe useEffect. Each stage is async. The globe useEffect MUST be resilient to 
  arriving before init completes.
- EventBus init (initEventBusSystem) runs when onGlobeView becomes true, which is 
  BEFORE the globe 3D context finishes loading. Globe components must handle this gap.
```

---

## Verification Plan

### Build Check
```bash
npx vite build
```

### Visual Verification
1. Open the app in browser → verify Cesium globe night side matches Image 2 (teal-dark, not harsh blue)
2. Hard-refresh (Ctrl+Shift+R) → verify textures cache in service worker (DevTools → Application → Cache Storage)
3. Navigate to globe → verify data points appear within 5 seconds
4. Refresh page → verify globe loads faster from cache

### Data Point Reliability
1. Open DevTools console → filter for "EVENTS" messages
2. Verify events appear on globe after page load
3. Toggle globe mode (Cesium ↔ Globe.GL) → verify data points persist across switches
