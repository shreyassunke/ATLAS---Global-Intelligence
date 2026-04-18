/**
 * Client-side caller for the ATLAS Vercel BigQuery proxy (`/api/gdelt-query`).
 *
 * Responsibilities:
 *   - Pick the correct backend origin for dev vs. prod.
 *   - Normalise responses into shapes the UI can render directly.
 *   - In-memory TTL cache keyed by `(template, params)` to avoid duplicate
 *     requests from fast tab switches.
 *   - Distil arbitrary GDELT boolean queries to a single theme token for
 *     templates that expect one.
 *
 * No secrets live in this module — the serverless function owns credentials.
 */

import { tokenizeTitle } from './gdeltQueries.js'

const API_BASE = (() => {
  if (typeof window !== 'undefined') {
    const override = import.meta?.env?.VITE_ATLAS_API_BASE
    if (override) return override.replace(/\/$/, '')
  }
  return ''
})()

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map()

function cacheKey(template, params) {
  return `${template}|${JSON.stringify(params || {})}`
}

function getCached(key) {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.data
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() })
  if (cache.size > 200) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
}

/**
 * Turn a GDELT boolean query (e.g. `(flood OR storm OR climate)`) into a
 * single ALLCAPS theme token suitable for BigQuery GKG lookups. Falls back to
 * the raw string stripped of parentheses/operators.
 */
export function queryToThemeToken(query) {
  const keywords = tokenizeTitle(query, 3)
  const token = (keywords[0] || String(query || '').replace(/[()\s]+/g, '_'))
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
  return token || 'WORLD'
}

/**
 * Low-level: post to the proxy. Throws on network / 4xx / 5xx with the
 * server's detail message when available. Pass `bust: true` to skip the
 * in-memory cache (used by the "Refresh" button on every historical surface).
 */
export async function postTemplate(template, params, { signal, bust = false } = {}) {
  const key = cacheKey(template, params)
  if (!bust) {
    const cached = getCached(key)
    if (cached) return cached
  } else {
    cache.delete(key)
  }

  const url = `${API_BASE}/api/gdelt-query`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ template, params }),
    signal,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.detail || body?.error || detail
    } catch { /* ignore */ }
    const err = new Error(detail)
    err.status = res.status
    throw err
  }

  const json = await res.json()
  const rows = Array.isArray(json?.rows) ? json.rows : []
  setCached(key, rows)
  return rows
}

// ── Typed convenience wrappers ──

/**
 * Average Goldstein + event volume per country over the last N years.
 * @param {string|null} country ISO2 code, or null for the full global list.
 */
export async function fetchCountryStability(country, { years = 5, limit = 50, signal } = {}) {
  return postTemplate(
    'countryStability',
    { country: country || undefined, years, limit },
    { signal },
  )
}

/**
 * Monthly theme frequency over the last N months. Accepts a free-text query
 * (extracted to a theme token) or an explicit theme.
 */
export async function fetchThemeTimeline(queryOrTheme, { months = 60, limit = 500, signal } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate('themeTimeline', { theme, months, limit }, { signal })
}

export async function fetchActorNetwork({ months = 6, minMentions = 10, limit = 100, signal } = {}) {
  return postTemplate('actorNetwork', { months, minMentions, limit }, { signal })
}

export async function fetchToneByCountry(queryOrTheme, { months = 12, limit = 120, signal } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate('toneByCountry', { theme, months, limit }, { signal })
}

export async function fetchEventSurge(country, { limit = 50, signal } = {}) {
  return postTemplate('eventSurge', { country, limit }, { signal })
}

/** Returns top persons/organisations co-occurring with a theme. */
export async function fetchGkgEntities(queryOrTheme, { field = 'persons', months = 3, limit = 60, signal, bust } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate('gkgEntities', { theme, field, months, limit }, { signal, bust })
}

/**
 * Per-event mention cadence over the last N days — powers the "How this
 * story spread" card.
 */
export async function fetchMentionsProgression(globalEventId, { days = 14, limit = 500, signal, bust } = {}) {
  return postTemplate(
    'mentionsProgression',
    { globalEventId, days, limit },
    { signal, bust },
  )
}

/**
 * CAMEO QuadClass (1-4) breakdown per country over the last N months.
 * Pass an ISO2/ISO3 country code to restrict to a single territory.
 */
export async function fetchQuadClassBreakdown({ country = null, months = 6, limit = 250, signal, bust } = {}) {
  return postTemplate(
    'quadClassBreakdown',
    { country: country || undefined, months, limit },
    { signal, bust },
  )
}

/** Top Cloud Vision labels for a VGKG theme (and optional country). */
export async function fetchVisualGkgLabels(queryOrTheme, { months = 3, country = null, limit = 60, signal, bust } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate(
    'visualGkgLabels',
    { theme, months, limit, ...(country ? { country } : {}) },
    { signal, bust },
  )
}

/** Top GCAM emotion codes + average values for a theme. */
export async function fetchGcamEmotions(queryOrTheme, { months = 3, limit = 40, signal, bust } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate('gcamEmotions', { theme, months, limit }, { signal, bust })
}

/** Top source domains + activity for a theme (co-citation network). */
export async function fetchSourceDomainNetwork(queryOrTheme, { months = 3, limit = 150, signal, bust } = {}) {
  const theme = queryOrTheme && queryOrTheme === queryOrTheme.toUpperCase()
    ? queryOrTheme
    : queryToThemeToken(queryOrTheme)
  return postTemplate('sourceDomainNetwork', { theme, months, limit }, { signal, bust })
}

/** Long-range TV mention trend (IA TV News Archive, via BigQuery). */
export async function fetchTvTimelineBq(keyword, { months = 24, limit = 500, signal, bust } = {}) {
  return postTemplate('tvTimeline', { keyword, months, limit }, { signal, bust })
}

/** Clears the in-memory result cache (useful for a "force refresh" button). */
export function clearBigQueryCache() {
  cache.clear()
}
