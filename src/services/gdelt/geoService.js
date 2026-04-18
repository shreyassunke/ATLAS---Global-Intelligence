/**
 * GDELT GEO 2.0 API — PointHeatmap, Country, ADM1 GeoJSON.
 * https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/
 */

import { buildGdeltUrl, fetchGdeltText, delay, GDELT_REQUEST_GAP_MS } from './gdeltHttp.js'
import { buildGdeltQueryFromDimensions, timespanFromTimeFilter } from './gdeltQueries.js'

export const GDELT_GEO_BASE = 'https://api.gdeltproject.org/api/v2/geo/geo'

/** Keep re-export so existing imports don't break. */
export { GDELT_REQUEST_GAP_MS as GDELT_GEO_REQUEST_GAP_MS, timespanFromTimeFilter as geoTimespanFromTimeFilter }

/** Build a GEO query OR-block from the active ATLAS dimensions. */
export function buildGdeltGeoQueryFromDimensions(activeDimensions) {
  return buildGdeltQueryFromDimensions(activeDimensions)
}

export async function fetchGdeltGeoJson(query, mode, { timespan = '1440min', maxpoints = 500, signal } = {}) {
  const m = String(mode || '').toLowerCase()
  const isPointMode = m.includes('point') || m.includes('heatmap')
  const url = buildGdeltUrl(GDELT_GEO_BASE, {
    query: String(query || '').trim(),
    mode,
    format: 'GeoJSON',
    timespan,
    maxpoints: isPointMode && maxpoints != null ? Number(maxpoints) : null,
  })
  const text = await fetchGdeltText(url, { signal })
  return JSON.parse(text)
}

function pickHeatWeight(p) {
  const candidates = [
    p.intensity, p.Intensity, p.count, p.Count, p.NumMentions,
    p.coverage, p.score, p.Score, p.value, p.Value, p.hits, p.Hits,
  ]
  for (const c of candidates) {
    const n = typeof c === 'string' ? parseFloat(String(c).replace(/,/g, '')) : Number(c)
    if (Number.isFinite(n) && n > 0) return Math.min(120, Math.max(0.25, n))
  }
  return 1
}

/** @returns {{ lat: number, lng: number, weight: number }[]} */
export function parsePointHeatmapGeoJson(geojson) {
  const feats = geojson?.features
  if (!Array.isArray(feats)) return []
  const out = []
  for (const f of feats) {
    const g = f.geometry
    const p = f.properties || {}
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue
    const [lng, lat] = g.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({ lat, lng, weight: pickHeatWeight(p) })
  }
  return out
}

function pickToneAndCount(props) {
  let tone = NaN
  const toneRaw = props.tone ?? props.Tone ?? props.AvgTone ?? props.AVGTONEC ?? props.avgTone
  if (typeof toneRaw === 'string') {
    tone = parseFloat(toneRaw.split(',')[0])
  } else if (toneRaw != null) {
    tone = parseFloat(toneRaw)
  }
  const c = props.count ?? props.Count ?? props.NumArticles ?? props.Hits ?? props.mentions ?? props.Mentions
  let count = 0
  if (c != null) count = parseFloat(String(c).replace(/,/g, '')) || 0
  if (!Number.isFinite(tone)) tone = 0
  return { tone, count }
}

/**
 * @returns {Array<{ geometry: object, tone: number, count: number, name: string, iso: string, props: object }>}
 */
export function extractChoroplethRows(geojson) {
  const feats = geojson?.features
  if (!Array.isArray(feats)) return []
  const rows = []
  for (const f of feats) {
    const g = f.geometry
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
    const props = f.properties || {}
    const { tone, count } = pickToneAndCount(props)
    const name = props.name || props.NAME || props.Name || props.country || props.Country || props.label || props.ADMIN1 || ''
    const iso = props.code || props.ISO || props.iso || props.cc || props.ISO2 || ''
    rows.push({ geometry: g, tone, count, name: String(name), iso: String(iso), props })
  }
  return rows
}

export function choroplethToneRange(rows) {
  const tones = rows.map((r) => r.tone).filter((t) => Number.isFinite(t))
  if (!tones.length) return { min: -5, max: 5 }
  let min = Math.min(...tones)
  let max = Math.max(...tones)
  if (min === max) {
    min -= 1
    max += 1
  }
  return { min, max }
}

export function toneToChoroplethRgba(t, min, max) {
  const norm = max === min ? 0.5 : (t - min) / (max - min)
  const r = Math.round(30 + norm * 210)
  const g = Math.round(140 - Math.abs(norm - 0.5) * 160)
  const b = Math.round(220 * (1 - norm) + 40 * norm)
  return `rgba(${r},${g},${b},0.48)`
}

/**
 * Sequential GEO requests (rate-friendly).
 * @param {{ query: string, timespan?: string, wantHeatmap?: boolean, wantPolygons?: boolean, adm1Near?: { lat: number, lng: number } | null, signal?: AbortSignal, maxHeatPoints?: number }} opts
 */
export async function fetchGdeltGeoOverlaySequential(opts) {
  const {
    query,
    timespan = '1440min',
    wantHeatmap = true,
    wantPolygons = true,
    adm1Near = null,
    signal,
    maxHeatPoints = 450,
  } = opts

  const result = {
    heatmapPoints: [],
    choroplethRows: [],
    errors: [],
  }

  const aborted = () => Boolean(signal?.aborted)

  if (wantHeatmap && query) {
    try {
      const j = await fetchGdeltGeoJson(query, 'PointHeatmap', { timespan, maxpoints: maxHeatPoints, signal })
      if (aborted()) return result
      result.heatmapPoints = parsePointHeatmapGeoJson(j)
    } catch (e) {
      result.errors.push(String(e?.message || e))
    }
    await delay(GDELT_REQUEST_GAP_MS)
    if (aborted()) return result
  }

  if (wantPolygons && query) {
    try {
      const mode = adm1Near ? 'ADM1' : 'Country'
      const q =
        adm1Near && Number.isFinite(adm1Near.lat) && Number.isFinite(adm1Near.lng)
          ? `(${query}) near:${adm1Near.lat.toFixed(2)},${adm1Near.lng.toFixed(2)},1200km`
          : query
      const j = await fetchGdeltGeoJson(q, mode, { timespan, maxpoints: null, signal })
      if (aborted()) return result
      result.choroplethRows = extractChoroplethRows(j)
    } catch (e) {
      result.errors.push(String(e?.message || e))
    }
  }

  return result
}
