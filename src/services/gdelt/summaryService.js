/**
 * GDELT 2.0 Summarization API — AI-generated summary of global coverage for
 * a query. Free, rate-limited, returns JSON/HTML; we parse the JSON form.
 *
 * https://blog.gdeltproject.org/
 *
 * We cache aggressively (5-min TTL) because Trends tab headers hit the same
 * `(query, timespan)` pair repeatedly when a user flips between tabs.
 */

import { buildGdeltUrl, fetchGdeltJson } from './gdeltHttp.js'

export const GDELT_SUMMARY_BASE = 'https://api.gdeltproject.org/api/v2/summary/summary'

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map()

function cacheKey(query, timespan) {
  return `${query || ''}|${timespan || ''}`
}

export function clearSummaryCache() {
  cache.clear()
}

/**
 * Fetch a generated summary for `query` over `timespan`.
 *
 * Returns `{ summary: string, sources: Array<{ title, url, domain, seendate }> }`
 * or `null` when the GDELT service doesn't have enough coverage to respond.
 */
export async function fetchGdeltSummary(query, { timespan = '24h', signal } = {}) {
  const key = cacheKey(query, timespan)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data

  const url = buildGdeltUrl(GDELT_SUMMARY_BASE, {
    query: String(query || '').trim(),
    mode: 'summary',
    format: 'json',
    timespan,
    maxrecords: 15,
    sort: 'hybridrel',
  })

  let json
  try {
    json = await fetchGdeltJson(url, { signal })
  } catch {
    // Summary API is best-effort — don't surface an error banner, just return null.
    return null
  }

  const summary = (
    json?.summary ||
    json?.Summary ||
    json?.abstract ||
    json?.text ||
    ''
  ).toString().trim()

  const rawSources =
    [json?.sources, json?.Sources, json?.articles, json?.citations].find((x) => Array.isArray(x)) ||
    []

  const sources = rawSources
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const url = row.url || row.URL || row.link || ''
      if (!url) return null
      const title = row.title || row.Title || row.headline || ''
      const domain = row.domain || row.Domain || row.sourceCommonName || ''
      const seendate = row.seendate || row.date || row.Date || ''
      return {
        title: String(title || url),
        url: String(url),
        domain: String(domain || ''),
        seendate: String(seendate || ''),
      }
    })
    .filter(Boolean)
    .slice(0, 12)

  const data = summary || sources.length ? { summary, sources } : null
  cache.set(key, { data, ts: Date.now() })
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  return data
}
