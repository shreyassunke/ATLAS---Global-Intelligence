/**
 * US states — live greedy graph coloring (presentation demo).
 *
 * Welsh–Powell: sort vertices by degree (descending), then first-fit greedy coloring.
 * Adjacency from shared polygon edges (same method as offline precompute); Turf touches
 * misses NE gaps along borders (e.g. NY–NJ–MA–RI).
 */

/** Match states-fill `minzoom` in FlatMap — animate as soon as state polygons appear (continental overview). */
export const USA_FOCUS_MIN_ZOOM = 3

/** Delay between greedy steps (ms) */
export const GREEDY_ANIM_STEP_MS = 160

/** Placeholder fill until greedy assigns a palette slot */
export const US_STATES_UNCOLORED_FILL = '#3a4254'

/** Rough geographic bounds [west, south, east, north] — includes AK/HI for zoom demos */
export const USA_ROUGH_BOUNDS = { west: -169.5, east: -65.5, south: 17.8, north: 71.6 }

/**
 * Stable region id for Natural Earth admin-1 US features (matches atlas-map-coloring keys).
 * @param {GeoJSON.Feature} feat
 * @returns {string | null}
 */
export function getUsStateRegionKey(feat) {
  const p = feat.properties || {}
  if ((p.iso_a2 || p.ISO_A2 || '').toString().toUpperCase() !== 'US') return null
  const abbr = (p.postal || p.POSTAL || '').toString().toUpperCase()
  if (abbr.length === 2) return `US_${abbr}`
  const iso2 = (p.iso_3166_2 || p.ISO_3166_2 || '').toString().toUpperCase()
  const m = iso2.match(/^US-([A-Z]{2})$/i)
  return m ? `US_${m[1].toUpperCase()}` : null
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {number} [minZoom]
 */
export function isMapFocusedOnUsa(map, minZoom = USA_FOCUS_MIN_ZOOM) {
  if (!map || map.getZoom() < minZoom) return false
  const b = map.getBounds()
  const { west, east, south, north } = USA_ROUGH_BOUNDS
  return b.getWest() < east && b.getEast() > west && b.getSouth() < north && b.getNorth() > south
}

/* ── Shared-edge adjacency (aligned with scripts/precompute-map-coloring.mjs) ── */

function round4(n) {
  return Math.round(n * 1e4) / 1e4
}

function edgeKey(x1, y1, x2, y2) {
  const p1 = `${round4(x1)},${round4(y1)}`
  const p2 = `${round4(x2)},${round4(y2)}`
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`
}

function addRingEdgesFromCoords(ring, featureIndex, edgeOwners) {
  if (!ring || ring.length < 2) return
  const m = ring.length
  for (let i = 0; i < m; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % m]
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue
    const k = edgeKey(a[0], a[1], b[0], b[1])
    if (!edgeOwners.has(k)) edgeOwners.set(k, new Set())
    edgeOwners.get(k).add(featureIndex)
  }
}

function addRingEdges(geom, featureIndex, edgeOwners) {
  if (!geom) return
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates || []) {
      addRingEdgesFromCoords(ring, featureIndex, edgeOwners)
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates || []) {
      for (const ring of poly || []) {
        addRingEdgesFromCoords(ring, featureIndex, edgeOwners)
      }
    }
  }
}

/**
 * Undirected adjacency: two states share at least one boundary segment (rounded coords).
 * Robust vs tiny topology gaps that break booleanTouches on Natural Earth admin-1.
 * @param {GeoJSON.Feature[]} features
 * @param {(f: GeoJSON.Feature) => string | null} getKey
 * @returns {Map<string, Set<string>>}
 */
export function buildUsStateAdjacency(features, getKey = getUsStateRegionKey) {
  const keys = features.map(getKey)
  const adj = new Map()
  for (const k of keys) {
    if (k && !adj.has(k)) adj.set(k, new Set())
  }

  const edgeOwners = new Map()
  for (let fi = 0; fi < features.length; fi++) {
    addRingEdges(features[fi].geometry, fi, edgeOwners)
  }

  for (const owners of edgeOwners.values()) {
    if (owners.size !== 2) continue
    const [ia, ib] = [...owners]
    const ka = keys[ia]
    const kb = keys[ib]
    if (!ka || !kb || ka === kb) continue
    adj.get(ka).add(kb)
    adj.get(kb).add(ka)
  }

  return adj
}

/**
 * @param {Map<string, Set<string>>} adj
 * @param {string[]} ids
 * @param {Map<string, number>} colorIndexById
 */
function verifyProperColoring(adj, ids, colorIndexById) {
  for (const u of ids) {
    const cu = colorIndexById.get(u)
    if (cu === undefined) return false
    for (const v of adj.get(u) || []) {
      if (colorIndexById.get(v) === cu) return false
    }
  }
  return true
}

function idsToIndexedAdjacency(ids, adjMap) {
  const idList = [...ids].sort()
  const idToIdx = new Map(idList.map((id, i) => [id, i]))
  const n = idList.length
  const adj = Array.from({ length: n }, () => new Set())
  for (const u of ids) {
    const iu = idToIdx.get(u)
    for (const v of adjMap.get(u) || []) {
      const iv = idToIdx.get(v)
      if (iv !== undefined && iv !== iu) {
        adj[iu].add(iv)
        adj[iv].add(iu)
      }
    }
  }
  return { idList, adj }
}

/** MRV + degree tie-break backtracking (same approach as scripts/precompute-map-coloring.mjs). */
function findKColoring(adj, n, k) {
  if (k <= 0) return n === 0 ? [] : null
  if (n === 0) return []
  const color = new Array(n).fill(-1)

  function legalCount(v) {
    const used = new Set()
    for (const u of adj[v] || []) {
      if (color[u] >= 0) used.add(color[u])
    }
    return k - used.size
  }

  function nextVertex() {
    let best = -1
    let bestLegal = k + 1
    let bestDeg = -1
    for (let v = 0; v < n; v++) {
      if (color[v] >= 0) continue
      const used = new Set()
      for (const u of adj[v] || []) {
        if (color[u] >= 0) used.add(color[u])
      }
      const lc = k - used.size
      const deg = adj[v]?.size || 0
      if (
        best < 0 ||
        lc < bestLegal ||
        (lc === bestLegal && deg > bestDeg) ||
        (lc === bestLegal && deg === bestDeg && v < best)
      ) {
        best = v
        bestLegal = lc
        bestDeg = deg
      }
    }
    return best
  }

  function backtrack() {
    let uncolored = 0
    for (let v = 0; v < n; v++) {
      if (color[v] < 0) uncolored++
    }
    if (uncolored === 0) return true
    const v = nextVertex()
    if (legalCount(v) <= 0) return false
    const used = new Set()
    for (const u of adj[v] || []) {
      if (color[u] >= 0) used.add(color[u])
    }
    for (let c = 0; c < k; c++) {
      if (used.has(c)) continue
      color[v] = c
      if (backtrack()) return true
      color[v] = -1
    }
    return false
  }

  if (!backtrack()) return null
  return color
}

/** Minimal-k proper coloring; ties broken by Welsh–Powell visit order for animation. */
function exactColorStepsForAnimation(adj, welshPowellOrderIds, palette, ids) {
  const { idList, adj: adjIdx } = idsToIndexedAdjacency(ids, adj)
  const n = idList.length
  let best = null
  let bestK = Infinity
  for (let k = 1; k <= Math.min(n, 12); k++) {
    const col = findKColoring(adjIdx, n, k)
    if (col) {
      best = col
      bestK = k
      break
    }
  }
  if (!best) return null

  const colorById = new Map(idList.map((id, i) => [id, best[i]]))
  let maxIdx = -1
  const steps = welshPowellOrderIds.map((regionId) => {
    const ci = colorById.get(regionId) ?? 0
    maxIdx = Math.max(maxIdx, ci)
    return {
      regionId,
      colorIndex: ci,
      colorHex: palette[ci % palette.length] ?? palette[0],
    }
  })
  return { steps, colorsUsed: maxIdx + 1 }
}

/**
 * Highest degree first (Welsh–Powell ordering).
 * @param {Map<string, Set<string>>} adj
 * @param {string[]} ids
 */
export function welshPowellOrder(adj, ids) {
  return [...ids].sort((a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0))
}

/**
 * Greedy coloring following Welsh–Powell vertex order.
 * @returns {{ steps: Array<{ regionId: string, colorIndex: number, colorHex: string }>, colorsUsed: number }}
 */
export function greedyColorStepsWelshPowell(adj, orderedIds, palette) {
  const colorOf = new Map()
  const steps = []
  let maxIdx = -1
  for (const v of orderedIds) {
    const used = new Set()
    for (const nb of adj.get(v) || []) {
      if (colorOf.has(nb)) used.add(colorOf.get(nb))
    }
    let c = 0
    while (used.has(c)) c++
    colorOf.set(v, c)
    maxIdx = Math.max(maxIdx, c)
    steps.push({
      regionId: v,
      colorIndex: c,
      colorHex: palette[c % palette.length] ?? palette[0],
    })
  }
  return { steps, colorsUsed: maxIdx + 1 }
}

/**
 * Prepare GeoJSON features (uncolored) + greedy step sequence for animation.
 * @param {GeoJSON.Feature[]} usStateFeaturesRaw — filtered US-only admin1 features
 * @param {string[]} palette — same ATLAS_COLORS as rest of map
 */
export function prepareUsGreedyColoringPresentation(usStateFeaturesRaw, palette) {
  const features = []
  for (const f of usStateFeaturesRaw) {
    const id = getUsStateRegionKey(f)
    if (!id) continue
    features.push({
      ...f,
      properties: {
        ...f.properties,
        atlas_color: US_STATES_UNCOLORED_FILL,
      },
    })
  }

  const ids = features.map(getUsStateRegionKey).filter(Boolean)
  const adj = buildUsStateAdjacency(features, getUsStateRegionKey)
  const order = welshPowellOrder(adj, ids)
  let { steps, colorsUsed } = greedyColorStepsWelshPowell(adj, order, palette)

  let coloringMode = 'greedy'

  const greedyColors = new Map(steps.map((s) => [s.regionId, s.colorIndex]))
  if (!verifyProperColoring(adj, ids, greedyColors)) {
    const fixed = exactColorStepsForAnimation(adj, order, palette, ids)
    if (fixed) {
      steps = fixed.steps
      colorsUsed = fixed.colorsUsed
      coloringMode = 'exactMinimal'
    }
  }

  const collection = { type: 'FeatureCollection', features }
  let edgePairs = 0
  for (const nb of adj.values()) edgePairs += nb.size
  edgePairs /= 2

  return {
    /** Initial GeoJSON for MapLibre `states` source (uncolored fills) */
    collection,
    steps,
    meta: {
      algorithm: 'Welsh–Powell + first-fit greedy',
      stateCount: ids.length,
      adjacencyUndirectedEdges: Math.round(edgePairs),
      greedyColorsUsed: colorsUsed,
      coloringMode,
    },
  }
}

/**
 * Apply one greedy step immutably (single-feature property update).
 * @param {GeoJSON.FeatureCollection} fc
 * @param {string} regionId
 * @param {string} colorHex
 */
export function applyGreedyStepToCollection(fc, regionId, colorHex) {
  return {
    ...fc,
    features: fc.features.map((f) => {
      if (getUsStateRegionKey(f) !== regionId) return f
      return {
        ...f,
        properties: { ...f.properties, atlas_color: colorHex },
      }
    }),
  }
}
