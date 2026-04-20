/**
 * Shared HTTP helpers for GDELT 2.0 REST APIs (DOC, GEO, Context, TV).
 *
 * GDELT returns an HTML error page (200 OK) when a query is malformed, so we
 * sniff the response body before parsing. All GDELT services in this project
 * go through this module so query encoding, error detection, and request
 * spacing stay consistent.
 *
 * Rate limiting
 * -------------
 * api.gdeltproject.org enforces a strict "≥5s between requests" policy per
 * origin and responds with HTTP 429 (or a plain-text "Please limit requests
 * to one every 5 seconds" body) the moment it's crossed. Different Atlas
 * sources — the fetch worker's DOC chain, analytics panel queries, the geo
 * overlay hook, summary/context/TV services — all call GDELT concurrently,
 * so relying on per-call sleeps is not enough: a shared gate is required.
 *
 * `withGdeltGate` runs `fn` on a per-module queue that guarantees a minimum
 * spacing of `GDELT_REQUEST_GAP_MS` between *any* two GDELT REST calls made
 * in the current JS context (main thread or a worker). It also backs off
 * when GDELT reports a 429 so the next caller waits long enough for the
 * rate-limit window to clear instead of immediately retriggering it.
 */

/** Per their docs, GDELT asks for ≥5s between requests from the same origin. */
export const GDELT_REQUEST_GAP_MS = 5500

/** Extra wait after a 429 so the shared window is definitely clear. */
const GDELT_BACKOFF_AFTER_429_MS = 9000

let gdeltQueueTail = Promise.resolve()
let gdeltLastRequestAt = 0

/**
 * Serialize `fn` on the shared GDELT request queue, enforcing the minimum
 * inter-request gap. Errors from `fn` propagate; the gate timing is updated
 * regardless so a failed request still counts against the rate-limit window.
 */
async function withGdeltGate(fn) {
  const prev = gdeltQueueTail
  let release
  gdeltQueueTail = new Promise((r) => {
    release = r
  })
  try {
    await prev
    const now = Date.now()
    const wait = Math.max(0, gdeltLastRequestAt + GDELT_REQUEST_GAP_MS - now)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    try {
      return await fn()
    } finally {
      gdeltLastRequestAt = Date.now()
    }
  } finally {
    release()
  }
}

/**
 * After the server tells us we've hit the limit, push the next allowed request
 * out far enough that the GDELT server's counter fully resets before we try
 * again. Called from the error paths in `fetchGdeltJson` / `fetchGdeltText`.
 */
function markGdeltRateLimited() {
  gdeltLastRequestAt = Date.now() + GDELT_BACKOFF_AFTER_429_MS - GDELT_REQUEST_GAP_MS
}

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

/**
 * GDELT emits plain-text (not HTML) rate-limit messages with 200 or 429
 * depending on path, so we pattern-match the body as a second signal.
 */
function isGdeltRateLimitBody(text) {
  const s = String(text || '').trim().toLowerCase()
  return s.startsWith('please limit requests') || s.includes('one every 5 seconds')
}

/** Fetch JSON from GDELT; throws Error with a human message when the API returns HTML. */
export async function fetchGdeltJson(url, { signal } = {}) {
  return withGdeltGate(async () => {
    const res = await fetch(url, { signal })
    if (res.status === 429) {
      markGdeltRateLimited()
      throw new Error('GDELT HTTP 429 (rate-limited)')
    }
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    const text = await res.text()
    if (!text) return null
    if (isGdeltRateLimitBody(text)) {
      markGdeltRateLimited()
      throw new Error('GDELT rate-limited (please limit requests)')
    }
    if (ct.includes('text/html') || isHtmlLike(text)) {
      const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      throw new Error(snippet || 'GDELT returned HTML (invalid query?)')
    }
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`GDELT JSON parse failed: ${e.message}`)
    }
  })
}

/** Fetch GeoJSON/CSV/text body; throws when the response appears to be HTML. */
export async function fetchGdeltText(url, { signal } = {}) {
  return withGdeltGate(async () => {
    const res = await fetch(url, { signal })
    if (res.status === 429) {
      markGdeltRateLimited()
      throw new Error('GDELT HTTP 429 (rate-limited)')
    }
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
    const text = await res.text()
    if (isGdeltRateLimitBody(text)) {
      markGdeltRateLimited()
      throw new Error('GDELT rate-limited (please limit requests)')
    }
    if (isHtmlLike(text)) throw new Error('GDELT returned HTML (invalid query?)')
    return text
  })
}

/** Small sleep helper. */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
