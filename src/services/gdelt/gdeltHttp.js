/**
 * Shared HTTP helpers for GDELT 2.0 REST APIs (DOC, GEO, Context, TV).
 *
 * GDELT returns an HTML error page (200 OK) when a query is malformed, so we
 * sniff the response body before parsing. All GDELT services in this project
 * go through this module so query encoding, error detection, and request
 * spacing stay consistent.
 */

/** Per their docs, GDELT asks for ≥5s between requests from the same origin. */
export const GDELT_REQUEST_GAP_MS = 5500

/**
 * Build a URL with query params. Values that are `null`/`undefined` are skipped
 * so callers can pass optional params as `undefined`.
 */
export function buildGdeltUrl(base, params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

function isHtmlLike(text) {
  const head = String(text || '').trimStart().slice(0, 32).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')
}

/** Fetch JSON from GDELT; throws Error with a human message when the API returns HTML. */
export async function fetchGdeltJson(url, { signal } = {}) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!text) return null
  if (ct.includes('text/html') || isHtmlLike(text)) {
    const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    throw new Error(snippet || 'GDELT returned HTML (invalid query?)')
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`GDELT JSON parse failed: ${e.message}`)
  }
}

/** Fetch GeoJSON/CSV/text body; throws when the response appears to be HTML. */
export async function fetchGdeltText(url, { signal } = {}) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
  const text = await res.text()
  if (isHtmlLike(text)) throw new Error('GDELT returned HTML (invalid query?)')
  return text
}

/** Small sleep helper. */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
