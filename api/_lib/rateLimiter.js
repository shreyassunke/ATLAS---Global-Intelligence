/**
 * Tiny in-memory IP rate limiter. Resets on cold start — good enough for a
 * public proxy that also has Vercel Edge Cache in front of it.
 *
 * Map<ip, { windowStart: number, count: number }>
 */

const buckets = new Map()
const LIMIT = Number(process.env.API_RATE_LIMIT || 30)
const WINDOW_MS = 60_000

// Bounded: evict when the map gets large, FIFO-ish since Map preserves insertion order.
const MAX_TRACKED = 5_000

export function checkRateLimit(ip) {
  if (!ip) return { allowed: true, remaining: LIMIT }
  const now = Date.now()
  let bucket = buckets.get(ip)
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, count: 0 }
  }
  bucket.count += 1
  buckets.set(ip, bucket)

  if (buckets.size > MAX_TRACKED) {
    const firstKey = buckets.keys().next().value
    if (firstKey) buckets.delete(firstKey)
  }

  const allowed = bucket.count <= LIMIT
  return {
    allowed,
    remaining: Math.max(0, LIMIT - bucket.count),
    retryAfterMs: allowed ? 0 : WINDOW_MS - (now - bucket.windowStart),
  }
}

export function clientIpFromReq(req) {
  const fwd = req.headers?.['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || ''
}
