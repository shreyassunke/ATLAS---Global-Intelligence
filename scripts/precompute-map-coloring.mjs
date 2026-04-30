/**
 * Offline: fetch Natural Earth 50m countries + US admin1, build boundary adjacency,
 * max clique (lower bound), exact χ via k-colorability backtracking, write
 * public/atlas-map-coloring.json
 *
 * Run from atlas/: npm run precompute-coloring
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'public/atlas-map-coloring.json')

const URL_COUNTRIES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson'
const URL_STATES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_1_states_provinces_shp.geojson'

function round4(n) {
  return Math.round(n * 1e4) / 1e4
}

function edgeKey(x1, y1, x2, y2) {
  const p1 = `${round4(x1)},${round4(y1)}`
  const p2 = `${round4(x2)},${round4(y2)}`
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`
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

/** @returns {string} stable id: ADM0_A3 for countries, US_XX for US admin1 */
function featureRegionId(feat, isAdmin1) {
  const p = feat.properties || {}
  if (isAdmin1) {
    const a2 = (p.iso_a2 || p.ISO_A2 || '').toString().toUpperCase()
    if (a2 !== 'US') return null
    const abbr = (p.postal || p.POSTAL || '').toString().toUpperCase()
    if (abbr.length === 2) return `US_${abbr}`
    const iso2 = (p.iso_3166_2 || p.ISO_3166_2 || '').toString().toUpperCase()
    const m = iso2.match(/^US-([A-Z]{2})$/i)
    if (m) return `US_${m[1].toUpperCase()}`
    return null
  }
  const a3 = (p.ADM0_A3 || p.adm0_a3 || '').toString()
  if (!a3) return null
  if (a3 === 'ATA' || a3 === '-99') return null
  return a3
}

function buildAdjacencyFromEdgeOwners(edgeOwners, featIndexToIdIndex, nIds) {
  const adj = Array.from({ length: nIds }, () => new Set())
  let pairCount = 0
  for (const owners of edgeOwners.values()) {
    if (owners.size !== 2) continue
    const [a, b] = [...owners]
    const ia = featIndexToIdIndex[a]
    const ib = featIndexToIdIndex[b]
    if (ia < 0 || ib < 0 || ia === ib) continue
    if (!adj[ia].has(ib)) {
      adj[ia].add(ib)
      adj[ib].add(ia)
      pairCount++
    }
  }
  return { adj, edgeCount: pairCount }
}

/** Bron–Kerbosch with Tomita pivot: pivot u maximizes |P ∩ N(u)| */
let bestCliqueSize = 0

/** Max clique only: branch + bound, does not enumerate all maximal cliques. */
function bronKerboschMaxClique(R, P, X, adj) {
  if (P.size === 0 && X.size === 0) {
    if (R.size > bestCliqueSize) bestCliqueSize = R.size
    return
  }
  if (R.size + P.size <= bestCliqueSize) return

  const union = [...P, ...X]
  let pivot = union[0] ?? 0
  let maxInP = -1
  for (const u of union) {
    const adjU = adj[u] || new Set()
    const countP = [...P].filter((v) => adjU.has(v)).length
    if (countP > maxInP) {
      maxInP = countP
      pivot = u
    }
  }
  const candidates = [...P].filter((v) => !((adj[pivot] && adj[pivot].has(v)) || false))
  for (const v of candidates) {
    if (R.size + P.size <= bestCliqueSize) return
    const Nv = adj[v] || new Set()
    const P2 = new Set([...P].filter((u) => Nv.has(u)))
    const X2 = new Set([...X].filter((u) => Nv.has(u)))
    bronKerboschMaxClique(new Set([...R, v]), P2, X2, adj)
    P.delete(v)
    X.add(v)
  }
}

function maxCliqueSize(adj, n) {
  if (n === 0) return 0
  bestCliqueSize = 0
  bronKerboschMaxClique(
    new Set(),
    new Set(Array.from({ length: n }, (_, i) => i)),
    new Set(),
    adj,
  )
  return bestCliqueSize
}

/**
 * MRV + degree tiebreak. @returns {number[] | null}
 */
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

function assertProperColoring(adj, n, color) {
  for (let u = 0; u < n; u++) {
    for (const v of adj[u] || []) {
      if (v > u && color[u] === color[v]) {
        throw new Error(`Improper: ${u} and ${v} both ${color[u]}`)
      }
    }
  }
}

async function main() {
  const [resC, resS] = await Promise.all([fetch(URL_COUNTRIES), fetch(URL_STATES)])
  if (!resC.ok) throw new Error(`Countries fetch ${resC.status}`)
  if (!resS.ok) throw new Error(`States fetch ${resS.status}`)

  const countries = await resC.json()
  const states = await resS.json()

  const cFeats = Array.isArray(countries.features) ? countries.features : []
  const sFeats = Array.isArray(states.features) ? states.features : []

  const usStates = sFeats.filter((f) => {
    const id = featureRegionId(f, true)
    return id != null
  })

  const allFeatures = [...cFeats, ...usStates]
  const nFeat = allFeatures.length

  const cCount = cFeats.length
  const featIndexToIdIndex = new Array(nFeat)
  const idList = []
  const idToIdx = new Map()

  for (let fi = 0; fi < cFeats.length; fi++) {
    const id = featureRegionId(cFeats[fi], false)
    if (!id) {
      featIndexToIdIndex[fi] = -1
      continue
    }
    let ii = idToIdx.get(id)
    if (ii === undefined) {
      ii = idList.length
      idToIdx.set(id, ii)
      idList.push(id)
    }
    featIndexToIdIndex[fi] = ii
  }

  for (let j = 0; j < usStates.length; j++) {
    const fi = cCount + j
    const id = featureRegionId(usStates[j], true)
    if (!id) {
      featIndexToIdIndex[fi] = -1
      continue
    }
    let ii = idToIdx.get(id)
    if (ii === undefined) {
      ii = idList.length
      idToIdx.set(id, ii)
      idList.push(id)
    }
    featIndexToIdIndex[fi] = ii
  }

  const n = idList.length
  const edgeOwners = new Map()
  for (let fi = 0; fi < nFeat; fi++) {
    if (featIndexToIdIndex[fi] < 0) continue
    const g = allFeatures[fi].geometry
    addRingEdges(g, fi, edgeOwners)
  }

  const { adj, edgeCount } = buildAdjacencyFromEdgeOwners(edgeOwners, featIndexToIdIndex, n)

  const omega = maxCliqueSize(adj, n)
  let chi = omega
  let bestColor = null
  for (let k = omega; k <= n; k++) {
    const col = findKColoring(adj, n, k)
    if (col) {
      chi = k
      bestColor = col
      break
    }
  }
  if (!bestColor) {
    throw new Error('No coloring found')
  }
  assertProperColoring(adj, n, bestColor)

  console.log(`Chromatic number χ(G) = ${chi}, Clique number ω(G) = ${omega}`)
  console.log(`${n} features, ${edgeCount} adjacency edges`)

  const colorAssignment = Object.fromEntries(idList.map((id, i) => [id, bestColor[i]]))
  for (const id of idList) {
    if (colorAssignment[id] === undefined) {
      throw new Error(`Missing assignment for ${id}`)
    }
  }

  const out = {
    meta: {
      chromaticNumber: chi,
      cliqueNumber: omega,
      totalFeatures: n,
      atlasColorsUsed: chi,
      generatedAt: new Date().toISOString(),
    },
    colorAssignment,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`Wrote ${path.relative(root, outPath)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
