/**
 * Zoom-aware map graph coloring for polygon administrative regions.
 * Framework-agnostic: Leaflet passes bounds + features; this module returns color indices / CSS colors.
 *
 * Point features (e.g. city POIs) are not supported for adjacency — use finest bundled polygon layer (ADM1).
 */

import bbox from '@turf/bbox'
import buffer from '@turf/buffer'
import booleanIntersects from '@turf/boolean-intersects'
import booleanTouches from '@turf/boolean-touches'

/** @typedef {'continent' | 'country' | 'adm1'} LayerKind */

/**
 * Zoom → data layer. We avoid `continent` at world zoom: continents do not share borders
 * (ocean between them), so adjacency is empty and graph coloring collapses to a single fill.
 *
 * Country vs ADM1: Carto/OSM raster often draws admin-1 (state) lines **before** a high Leaflet zoom
 * number is reached. A **viewport** check lets us switch to ADM1 as soon as the map is "regional"
 * (narrow bounds), matching when users actually see state borders — not only `zoom >= N`.
 */
export const DEFAULT_LAYER_RULES = [
  { maxZoom: 4, kind: 'country' },
  { maxZoom: 32, kind: 'adm1' },
]

/** Max lat/lon span to treat as "regional" (state/province lines meaningful). Whole-world views exceed this. */
const REGIONAL_MAX_LAT_SPAN = 78
const REGIONAL_MAX_LON_SPAN = 118
/** Basemap typically shows admin-1 lines around z4+; allow regional views slightly earlier. */
const ADM1_MIN_ZOOM_REGIONAL = 3.5

/** Bundled Natural Earth assets (Vite public/). */
export const GEO_URLS = {
  continent: '/geo/ne_110m_continents.geojson',
  country: '/geo/ne_110m_admin_0_countries.geojson',
  /** 50m: worldwide admin-1 (110m NE admin-1 is US-only). Built by `npm run build:admin1`. */
  adm1: '/geo/ne_50m_admin_1_states_provinces.geojson',
}

const DEFAULT_MAX_FEATURES = 500
const BBOX_PAD_DEG = 0.02
/**
 * Natural Earth polygons often have micro-gaps along shared borders; `booleanTouches` alone
 * misses many real adjacencies, so greedy coloring assigns the same index to touching states.
 * Intersection + a tiny buffer recovers border-sharing pairs without relying on fragile touches().
 */
const ADJACENCY_BUFFER_KM = 0.09

/**
 * @param {import('leaflet').LatLngBounds | null | undefined} bounds
 * @returns {{ latSpan: number, lonSpan: number } | null}
 */
export function viewportLatLonSpans(bounds) {
  if (!bounds || typeof bounds.getNorth !== 'function') return null
  const latSpan = bounds.getNorth() - bounds.getSouth()
  let lonSpan = Math.abs(bounds.getEast() - bounds.getWest())
  if (lonSpan > 180) lonSpan = 360 - lonSpan
  if (!Number.isFinite(latSpan) || !Number.isFinite(lonSpan)) return null
  return { latSpan, lonSpan }
}

/**
 * Regional framing: basemap shows internal borders — use worldwide ADM1 polygons for graph coloring.
 * @param {number} zoom
 * @param {import('leaflet').LatLngBounds | null | undefined} bounds
 */
export function isRegionalViewportForAdm1(zoom, bounds) {
  if (zoom < ADM1_MIN_ZOOM_REGIONAL) return false
  const sp = viewportLatLonSpans(bounds)
  if (!sp) return false
  const { latSpan, lonSpan } = sp
  return (
    latSpan > 0.35 &&
    lonSpan > 0.35 &&
    latSpan < REGIONAL_MAX_LAT_SPAN &&
    lonSpan < REGIONAL_MAX_LON_SPAN
  )
}

/**
 * @param {number} zoom - Leaflet zoom level
 * @param {Array<{ maxZoom: number, kind: LayerKind }>} [rules]
 * @param {import('leaflet').LatLngBounds | null | undefined} [bounds] - when set, regional views prefer ADM1 as soon as state-level lines appear
 * @returns {LayerKind}
 */
export function selectLayerKind(zoom, rules = DEFAULT_LAYER_RULES, bounds = null) {
  if (isRegionalViewportForAdm1(zoom, bounds)) return 'adm1'

  const sorted = [...rules].sort((a, b) => a.maxZoom - b.maxZoom)
  for (const r of sorted) {
    if (zoom < r.maxZoom) return r.kind
  }
  return sorted[sorted.length - 1].kind
}

/**
 * @param {import('geojson').Feature} f
 * @param {LayerKind} kind
 * @returns {string}
 */
export function stableRegionId(f, kind) {
  const p = f.properties || {}
  if (kind === 'continent') {
    return `continent:${String(p.CONTINENT || p.NAME || p.name || 'unknown')}`
  }
  if (kind === 'country') {
    const id = p.ADM0_A3 || p.ISO_A3 || p.WB_A3 || p.ISO_A2 || p.NAME || p.ADMIN || 'unknown'
    return `country:${String(id)}`
  }
  const adm1 = p.adm1_code || `${p.adm0_a3 || p.ADM0_A3 || ''}-${p.name || p.NAME || ''}`
  return `adm1:${String(adm1)}`
}

/**
 * @param {L.LatLngBounds} leafletBounds
 * @param {number} padFraction - expand view box by this fraction of width/height
 * @returns {[number, number, number, number]} bbox [west, south, east, north]
 */
export function leafletBoundsToBbox(leafletBounds, padFraction = 0.08) {
  const w = leafletBounds.getWest()
  const s = leafletBounds.getSouth()
  const e = leafletBounds.getEast()
  const n = leafletBounds.getNorth()
  let lonSpan = e - w
  let latSpan = n - s
  if (!Number.isFinite(lonSpan) || lonSpan <= 0) lonSpan = 360
  if (!Number.isFinite(latSpan) || latSpan <= 0) latSpan = 180
  return [
    w - lonSpan * padFraction,
    s - latSpan * padFraction,
    e + lonSpan * padFraction,
    n + latSpan * padFraction,
  ]
}

/**
 * @param {[number, number, number, number]} a
 * @param {[number, number, number, number]} b
 */
export function bboxIntersects(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3])
}

/**
 * @param {import('geojson').Feature[]} features
 * @param {[number, number, number, number]} viewBbox
 * @param {{ maxFeatures?: number }} [opts]
 * @returns {import('geojson').Feature[]}
 */
export function filterFeaturesInBounds(features, viewBbox, opts = {}) {
  const maxF = opts.maxFeatures ?? DEFAULT_MAX_FEATURES
  const out = []
  for (const f of features) {
    const g = f.geometry
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
    try {
      const bb = bbox(f)
      const pad = BBOX_PAD_DEG
      const expanded = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad]
      if (bboxIntersects(expanded, viewBbox)) out.push(f)
    } catch {
      continue
    }
  }
  if (out.length <= maxF) return out
  // Prefer keeping geographically larger features (rough proxy: bbox area)
  const scored = out.map((f) => {
    let bb
    try {
      bb = bbox(f)
    } catch {
      return { f, score: 0 }
    }
    const area = Math.max(0, bb[2] - bb[0]) * Math.max(0, bb[3] - bb[1])
    return { f, score: area }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxF).map((x) => x.f)
}

/**
 * @param {Map<string, Set<string>>} adj
 * @param {string} id
 */
function neighborColors(adj, id, colors) {
  const used = new Set()
  const nb = adj.get(id)
  if (!nb) return used
  for (const n of nb) {
    const c = colors.get(n)
    if (c != null) used.add(c)
  }
  return used
}

/**
 * Smallest non-negative integer not in `used`.
 * @param {Set<number>} used
 * @param {number | undefined} prefer
 */
function pickColor(used, prefer) {
  if (prefer != null && !used.has(prefer)) return prefer
  let c = 0
  while (used.has(c)) c += 1
  return c
}

/**
 * First-fit greedy: fixed order (sorted id), assign smallest feasible color.
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} nodeIds
 * @param {Map<string, number>} [previousColors]
 * @returns {Map<string, number>}
 */
export function firstFitGreedyColoring(adjacency, nodeIds, previousColors = new Map()) {
  const order = [...nodeIds].sort((a, b) => String(a).localeCompare(String(b)))
  const colors = new Map()
  for (const id of order) {
    const forbidden = neighborColors(adjacency, id, colors)
    const prev = previousColors.get(id)
    colors.set(id, pickColor(forbidden, prev))
  }
  return colors
}

/**
 * Welsh–Powell: degree-descending order + first-fit (fast ordered greedy).
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} nodeIds
 * @param {Map<string, number>} [previousColors]
 * @returns {Map<string, number>}
 */
export function welshPowellColoring(adjacency, nodeIds, previousColors = new Map()) {
  const order = [...nodeIds].sort((a, b) => {
    const da = adjacency.get(a)?.size ?? 0
    const db = adjacency.get(b)?.size ?? 0
    if (db !== da) return db - da
    const pa = previousColors.has(a) ? 0 : 1
    const pb = previousColors.has(b) ? 0 : 1
    if (pa !== pb) return pa - pb
    return String(a).localeCompare(String(b))
  })

  const colors = new Map()
  for (const id of order) {
    const forbidden = neighborColors(adjacency, id, colors)
    const prev = previousColors.get(id)
    colors.set(id, pickColor(forbidden, prev))
  }
  return colors
}

/** @deprecated use welshPowellColoring */
export const greedyColoring = welshPowellColoring

/**
 * DSatur (saturation degree) greedy coloring — often fewer colors than Welsh–Powell on hard graphs.
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} nodeIds
 * @param {Map<string, number>} [previousColors]
 * @returns {Map<string, number>}
 */
export function dsaturColoring(adjacency, nodeIds, previousColors = new Map()) {
  const uncolored = new Set(nodeIds)
  const colors = new Map()

  const saturation = (id) => {
    const sat = new Set()
    const nb = adjacency.get(id)
    if (!nb) return sat
    for (const n of nb) {
      const c = colors.get(n)
      if (c != null) sat.add(c)
    }
    return sat
  }

  while (uncolored.size > 0) {
    let best = null
    let bestKey = null
    for (const id of uncolored) {
      const sat = saturation(id)
      const deg = adjacency.get(id)?.size ?? 0
      const hasPrev = previousColors.has(id) ? 0 : 1
      const key = [sat.size, deg, -hasPrev, id]
      if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1]) || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2]) || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] === bestKey[2] && key[3] < bestKey[3])) {
        best = id
        bestKey = key
      }
    }
    if (!best) break
    uncolored.delete(best)
    const forbidden = neighborColors(adjacency, best, colors)
    const prev = previousColors.get(best)
    colors.set(best, pickColor(forbidden, prev))
  }
  return colors
}

/**
 * RLF (Recursive Largest First) heuristic: repeatedly build an independent set by
 * picking max-degree-in-remaining, then removing that vertex and its neighbors from the pool.
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} nodeIds
 * @param {Map<string, number>} [previousColors]
 * @returns {Map<string, number>}
 */
export function rlfColoring(adjacency, nodeIds, previousColors = new Map()) {
  void previousColors
  const uncolored = new Set(nodeIds)
  const colors = new Map()
  let colorIdx = 0
  while (uncolored.size > 0) {
    const R = new Set(uncolored)
    const I = []
    while (R.size > 0) {
      const deg = (v) => [...R].filter((u) => u !== v && adjacency.get(v)?.has(u)).length
      const v = [...R].sort((a, b) => deg(b) - deg(a) || String(a).localeCompare(String(b)))[0]
      I.push(v)
      R.delete(v)
      for (const n of adjacency.get(v) || []) R.delete(n)
    }
    for (const v of I) {
      colors.set(v, colorIdx)
      uncolored.delete(v)
    }
    colorIdx += 1
  }
  return colors
}

const EXACT_MAX_NODES = 18
const EXACT_TIME_BUDGET_MS = 55

/**
 * Greedy maximal clique size (lower bound on chromatic number).
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} ids
 */
export function approximateCliqueLowerBound(adjacency, ids) {
  if (ids.length === 0) return 0
  const sorted = [...ids].sort(
    (a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0),
  )
  let best = 1
  for (const start of sorted) {
    const clique = [start]
    for (const v of sorted) {
      if (v === start) continue
      if (clique.every((u) => adjacency.get(u)?.has(v))) clique.push(v)
    }
    best = Math.max(best, clique.length)
  }
  return best
}

/**
 * Minimum k-coloring via backtracking (small n only). Returns null if timeout.
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} ids
 * @param {number} [maxMs]
 * @returns {{ colorById: Map<string, number>, chromaticNumber: number } | null}
 */
export function exactMinColoring(adjacency, ids, maxMs = EXACT_TIME_BUDGET_MS) {
  const n = ids.length
  if (n === 0) return { colorById: new Map(), chromaticNumber: 0 }
  if (n > EXACT_MAX_NODES) return null
  const t0 = Date.now()
  const neighbors = ids.map((_, i) => {
    const arr = []
    for (let j = 0; j < n; j++) {
      if (i !== j && adjacency.get(ids[i])?.has(ids[j])) arr.push(j)
    }
    return arr
  })
  const lb = approximateCliqueLowerBound(adjacency, ids)
  const col = new Array(n).fill(-1)

  function tryK(k) {
    col.fill(-1)
    function dfs(i) {
      if (Date.now() - t0 > maxMs) return false
      if (i === n) return true
      const forbidden = new Set()
      for (const j of neighbors[i]) {
        if (col[j] >= 0) forbidden.add(col[j])
      }
      for (let c = 0; c < k; c++) {
        if (forbidden.has(c)) continue
        col[i] = c
        if (dfs(i + 1)) return true
        col[i] = -1
      }
      return false
    }
    return dfs(0)
  }

  for (let k = lb; k <= n; k++) {
    if (Date.now() - t0 > maxMs) return null
    if (tryK(k)) {
      const colorById = new Map()
      ids.forEach((id, i) => colorById.set(id, col[i]))
      return { colorById, chromaticNumber: k }
    }
  }
  return null
}

function countUndirectedEdges(adjacency) {
  let e = 0
  for (const s of adjacency.values()) e += s.size
  return e / 2
}

/** @typedef {'firstFit' | 'welshPowell' | 'dsatur' | 'rlf' | 'exact'} ColoringStrategyName */

export const DEFAULT_COLORING_STRATEGY = 'dsatur'

const STRATEGIES = {
  firstFit: firstFitGreedyColoring,
  welshPowell: welshPowellColoring,
  greedy: welshPowellColoring,
  dsatur: dsaturColoring,
  rlf: rlfColoring,
}

/**
 * @param {ColoringStrategyName} name
 * @param {Map<string, Set<string>>} adjacency
 * @param {string[]} ids
 * @param {Map<string, number>} previousColors
 */
function runStrategy(name, adjacency, ids, previousColors) {
  const fn = STRATEGIES[name] || STRATEGIES.dsatur
  return fn(adjacency, ids, previousColors)
}

/**
 * @param {import('geojson').Feature} fi
 * @param {import('geojson').Feature} fj
 */
export function polygonsAdjacentForColoring(fi, fj) {
  const a = { type: 'Feature', geometry: fi.geometry, properties: fi.properties || {} }
  const b = { type: 'Feature', geometry: fj.geometry, properties: fj.properties || {} }
  try {
    if (booleanIntersects(a, b)) return true
    if (booleanTouches(a, b)) return true
    const ab = buffer(a, ADJACENCY_BUFFER_KM, { units: 'kilometers' })
    if (ab && booleanIntersects(ab, b)) return true
    const ba = buffer(b, ADJACENCY_BUFFER_KM, { units: 'kilometers' })
    if (ba && booleanIntersects(a, ba)) return true
  } catch {
    return false
  }
  return false
}

/**
 * @param {import('geojson').Feature[]} features - polygon features (already viewport-filtered)
 * @param {LayerKind} kind - for stable ids
 * @returns {{ adjacency: Map<string, Set<string>>, ids: string[], idToFeature: Map<string, import('geojson').Feature> }}
 */
export function buildAdjacency(features, kind) {
  const idToFeature = new Map()
  const ids = []
  for (const f of features) {
    const id = stableRegionId(f, kind)
    if (idToFeature.has(id)) continue
    idToFeature.set(id, f)
    ids.push(id)
  }

  const feats = ids.map((id) => idToFeature.get(id))
  const bboxes = feats.map((f) => {
    try {
      return bbox(f)
    } catch {
      return [0, 0, 0, 0]
    }
  })

  const adjacency = new Map()
  for (const id of ids) adjacency.set(id, new Set())

  const pad = BBOX_PAD_DEG
  for (let i = 0; i < feats.length; i++) {
    for (let j = i + 1; j < feats.length; j++) {
      const bi = bboxes[i]
      const bj = bboxes[j]
      const ei = [bi[0] - pad, bi[1] - pad, bi[2] + pad, bi[3] + pad]
      const ej = [bj[0] - pad, bj[1] - pad, bj[2] + pad, bj[3] + pad]
      if (!bboxIntersects(ei, ej)) continue
      const fi = feats[i]
      const fj = feats[j]
      try {
        if (polygonsAdjacentForColoring(fi, fj)) {
          const a = ids[i]
          const b = ids[j]
          adjacency.get(a).add(b)
          adjacency.get(b).add(a)
        }
      } catch {
        continue
      }
    }
  }

  return { adjacency, ids, idToFeature }
}

/**
 * Muted pastel fills (classic political-map look). Indices map 1:1 to greedy color slots.
 * Extra slots (rare dense graphs) use soft HSL so adjacent regions never alias.
 */
export const NATURAL_POLITICAL_PALETTE = [
  '#e8d4a8',
  '#e8b0a8',
  '#b8d4b0',
  '#ddc8a0',
  '#d0c8e0',
  '#a8cfe8',
  '#f0e4c0',
  '#c8d8c0',
  '#e8c8d4',
  '#d8e0c8',
  '#c8d8e8',
  '#e8e0c8',
]

/**
 * @param {number} count - number of distinct color indices used (chromatic usage)
 * @param {{ palette?: string[] }} [opts] - override base swatches for theming
 * @returns {string[]} hex or hsl strings
 */
export function buildPalette(count, opts = {}) {
  if (count <= 0) return []
  const base = opts.palette?.length ? opts.palette : NATURAL_POLITICAL_PALETTE
  const colors = []
  for (let i = 0; i < count; i += 1) {
    if (i < base.length) {
      colors.push(base[i])
    } else {
      const h = (i * 41 + 17) % 360
      colors.push(`hsl(${h}, 28%, 58%)`)
    }
  }
  return colors
}

/** Balanced rainbow HSL for political map fills (moderate saturation/lightness). */
export function buildRainbowPalette(count) {
  if (count <= 0) return []
  const out = []
  for (let i = 0; i < count; i += 1) {
    const h = (i * 360) / Math.max(count, 1)
    out.push(`hsl(${Math.round(h)}, 48%, 52%)`)
  }
  return out
}

/** Stable zoom bucket for caching (0.5 steps). */
export function quantizeZoom(zoom) {
  return Math.floor(zoom * 2) / 2
}

/**
 * @param {string[]} sortedIds
 */
export function graphSignatureHash(sortedIds) {
  const s = sortedIds.join('\u0001')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h << 5) + h + s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

/**
 * @param {LayerKind} layerKind
 * @param {number} zoomBucket
 * @param {string[]} sortedRegionIds
 */
export function getGraphCacheKey(layerKind, zoomBucket, sortedRegionIds) {
  return `${layerKind}|${zoomBucket}|${graphSignatureHash(sortedRegionIds)}`
}

/** Bump when baked feature props used by FlatMap change (invalidates in-memory precolor cache). */
const PRECOLOR_RESULT_CACHE_BUSTER = 'v3-raster-blend-tint'

const PRECOLOR_CACHE_MAX = 96
/** @type {Map<string, { collection: import('geojson').FeatureCollection, stats: object }>} */
const precolorResultCache = new Map()

function precolorCacheSet(key, val) {
  if (precolorResultCache.size >= PRECOLOR_CACHE_MAX) {
    const k = precolorResultCache.keys().next().value
    precolorResultCache.delete(k)
  }
  precolorResultCache.set(key, val)
}

function precolorCacheGet(key) {
  return precolorResultCache.get(key)
}

export function clearMapPrecolorCache() {
  precolorResultCache.clear()
}

/**
 * @param {Map<string, number>} colorIndexById
 * @param {string[]} palette
 * @returns {Map<string, string>}
 */
export function mapIndicesToCssColors(colorIndexById, palette) {
  const out = new Map()
  for (const [id, idx] of colorIndexById) {
    const c = palette[idx % palette.length]
    out.set(id, c)
  }
  return out
}

function maxGraphDegree(adjacency, ids) {
  let m = 0
  for (const id of ids) m = Math.max(m, adjacency.get(id)?.size ?? 0)
  return m
}

/**
 * When every node is isolated (disjoint polygons), cycle distinct color indices.
 * @param {string[]} ids
 */
export function spreadColorsWhenDisconnected(ids) {
  const sorted = [...ids].sort((a, b) => String(a).localeCompare(String(b)))
  const cycle = 12
  const out = new Map()
  for (let i = 0; i < sorted.length; i++) {
    out.set(sorted[i], i % cycle)
  }
  return out
}

const EXACT_AUTO_MAX_NODES = 14

/**
 * Build adjacency, run coloring, bake style props on each feature (single pre-render pipeline).
 *
 * @param {object} input
 * @param {LayerKind} input.layerKind
 * @param {import('geojson').Feature[]} input.features
 * @param {ColoringStrategyName} [input.strategy]
 * @param {Map<string, number>} [input.previousColors]
 * @param {boolean} [input.useCache]
 * @param {string | null} [input.cacheKey]
 * @param {boolean} [input.useExactWhenSmall] - try exact min-colors when n <= EXACT_AUTO_MAX_NODES
 * @returns {{ collection: import('geojson').FeatureCollection, stats: object, colorIndexById: Map<string, number>, cssById: Map<string, string> }}
 */
export function buildPrecoloredFeatureCollection({
  layerKind,
  features,
  strategy = DEFAULT_COLORING_STRATEGY,
  previousColors = new Map(),
  useCache = true,
  cacheKey = null,
  useExactWhenSmall = true,
}) {
  const cacheKeyFull = cacheKey ? `${PRECOLOR_RESULT_CACHE_BUSTER}|${cacheKey}` : null
  if (useCache && cacheKeyFull) {
    const hit = precolorCacheGet(cacheKeyFull)
    if (hit) {
      return {
        collection: hit.collection,
        stats: hit.stats,
        colorIndexById: hit.colorIndexById,
        cssById: hit.cssById,
      }
    }
  }

  const { adjacency, ids, idToFeature } = buildAdjacency(features, layerKind)
  const nodeCount = ids.length
  const edgeCount = countUndirectedEdges(adjacency)
  const maxDeg = maxGraphDegree(adjacency, ids)
  const chromaticLowerBound = approximateCliqueLowerBound(adjacency, ids)

  let colorIndexById
  let strategyUsed = strategy
  let exactUsed = false

  if (nodeCount > 1 && maxDeg === 0) {
    colorIndexById = spreadColorsWhenDisconnected(ids)
    strategyUsed = 'spreadDisconnected'
  } else if (
    useExactWhenSmall &&
    nodeCount > 0 &&
    nodeCount <= EXACT_AUTO_MAX_NODES &&
    strategy !== 'exact'
  ) {
    const ex = exactMinColoring(adjacency, ids)
    if (ex) {
      colorIndexById = ex.colorById
      exactUsed = true
      strategyUsed = 'exact'
    } else {
      colorIndexById = runStrategy(strategy, adjacency, ids, previousColors)
    }
  } else if (strategy === 'exact') {
    const ex = exactMinColoring(adjacency, ids)
    if (ex) {
      colorIndexById = ex.colorById
      exactUsed = true
      strategyUsed = 'exact'
    } else {
      colorIndexById = dsaturColoring(adjacency, ids, previousColors)
      strategyUsed = 'dsatur'
    }
  } else {
    colorIndexById = runStrategy(strategy, adjacency, ids, previousColors)
  }

  let maxIdx = -1
  for (const v of colorIndexById.values()) maxIdx = Math.max(maxIdx, v)
  const colorsUsed = maxIdx + 1
  const palette = buildRainbowPalette(colorsUsed)
  const cssById = mapIndicesToCssColors(colorIndexById, palette)

  const featuresOut = ids.map((id) => {
    const f = idToFeature.get(id)
    const fill = cssById.get(id) || palette[0]
    const ci = colorIndexById.get(id) ?? 0
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        ...f.properties,
        _mapColorFill: fill,
        _mapColorStroke: 'rgba(0, 0, 0, 0.22)',
        /** Tuned for mix-blend tint over Carto dark tiles (FlatMap `.flatmap-land-tint`). */
        _mapColorFillOpacity: 0.55,
        _mapColorIdx: ci,
        _mapColorStrategy: strategyUsed,
        _mapStableRegionId: id,
      },
    }
  })

  const collection = { type: 'FeatureCollection', features: featuresOut }
  const stats = {
    nodeCount,
    edgeCount,
    colorsUsed,
    chromaticLowerBound,
    chromaticUpperBound: colorsUsed,
    strategy: strategyUsed,
    exactUsed,
  }

  const out = {
    collection,
    stats,
    colorIndexById,
    cssById,
  }

  if (useCache && cacheKeyFull) {
    precolorCacheSet(cacheKeyFull, {
      collection,
      stats,
      colorIndexById,
      cssById,
    })
  }

  return out
}

/**
 * @param {object} input
 * @param {LayerKind} input.layerKind
 * @param {import('geojson').Feature[]} input.features
 * @param {Map<string, number>} [input.previousColors]
 * @param {ColoringStrategyName} [input.strategy]
 * @returns {{ colorIndexById: Map<string, number>, colorsUsed: number, cssById: Map<string, string>, palette: string[], stats: object }}
 */
export function computeMapColors({
  layerKind,
  features,
  boundsKey: _boundsKey,
  previousColors = new Map(),
  strategy = DEFAULT_COLORING_STRATEGY,
}) {
  const { stats, colorIndexById, cssById } = buildPrecoloredFeatureCollection({
    layerKind,
    features,
    strategy,
    previousColors,
    useCache: false,
    cacheKey: null,
    useExactWhenSmall: true,
  })
  const palette = buildRainbowPalette(stats.colorsUsed)
  return { colorIndexById, colorsUsed: stats.colorsUsed, cssById, palette, stats }
}

/**
 * Session cache: reuse color indices across viewport updates when graph allows.
 */
export class ColorStabilityCache {
  constructor() {
    /** @type {Map<string, number>} */
    this.byRegionId = new Map()
    /** @type {LayerKind | null} */
    this.lastLayer = null
  }

  /**
   * Call when layer kind changes (continent → country) to avoid carrying invalid colors.
   * @param {LayerKind | null} layerKind
   */
  resetIfLayerChanged(layerKind) {
    if (this.lastLayer != null && layerKind !== this.lastLayer) {
      this.byRegionId.clear()
    }
    this.lastLayer = layerKind
  }

  /**
   * @param {Map<string, number>} next
   */
  merge(next) {
    for (const [k, v] of next) this.byRegionId.set(k, v)
  }

  getPreviousMap() {
    return new Map(this.byRegionId)
  }
}

/** In-memory fetch cache for GeoJSON URLs (per session). */
const geoFetchCache = new Map()

/**
 * @param {string} url
 * @returns {Promise<import('geojson').FeatureCollection>}
 */
export async function fetchGeoJsonCached(url) {
  if (geoFetchCache.has(url)) return geoFetchCache.get(url)
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`GeoJSON ${url}: ${r.status}`)
      return r.json()
    })
    .then((j) => {
      if (j.type !== 'FeatureCollection' || !Array.isArray(j.features)) {
        throw new Error(`Invalid FeatureCollection: ${url}`)
      }
      return j
    })
  geoFetchCache.set(url, p)
  return p
}

/**
 * Resolve `/geo/...` against Vite `import.meta.env.BASE_URL`.
 * @param {LayerKind} kind
 * @returns {string}
 */
export function geoUrlForLayer(kind) {
  const path = GEO_URLS[kind] || GEO_URLS.country
  if (path.startsWith('http')) return path
  const relative = path.startsWith('/') ? path.slice(1) : path
  const base = import.meta.env.BASE_URL || '/'
  if (typeof window !== 'undefined') {
    const absoluteBase = new URL(base, window.location.origin).href
    return new URL(relative, absoluteBase).href
  }
  return path.startsWith('/') ? path : `/${relative}`
}
