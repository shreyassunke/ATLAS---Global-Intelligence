/**
 * POST /api/gdelt-query
 *
 * Body: { template: string, params?: object }
 *
 * Returns: { rows: any[], template, durationMs } | { error }
 *
 * Behaviour:
 *   - Accepts only POST (GET is used for a trivial health probe listing template names).
 *   - Rejects unknown templates and malformed payloads.
 *   - Applies a per-IP rate limit (see `_lib/rateLimiter.js`).
 *   - Sets `Cache-Control: s-maxage=3600, stale-while-revalidate=86400` so
 *     identical (template, params) pairs are served by Vercel's Edge Cache at
 *     zero BigQuery cost for an hour.
 *   - CORS is allow-any by default; set `ATLAS_ALLOWED_ORIGIN` in Vercel to
 *     restrict to a single origin (recommended once the app's URL is fixed).
 */

import { resolveTemplate, TEMPLATE_NAMES } from './_lib/queryTemplates.js'
import { runQuery } from './_lib/bigquery.js'
import { checkRateLimit, clientIpFromReq } from './_lib/rateLimiter.js'
import { estimateBytes, formatBytes } from './_lib/bytesGuard.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
}

function setCors(res, origin) {
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Vary', 'Origin')
  if (origin) {
    // no-op; kept for future per-origin logic
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 256 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve({})
      try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  setCors(res, req.headers?.origin)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return sendJson(res, 200, { ok: true, templates: TEMPLATE_NAMES })
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' })
  }

  const ip = clientIpFromReq(req)
  const rl = checkRateLimit(ip)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
    return sendJson(res, 429, { error: 'rate limited', retryAfterMs: rl.retryAfterMs })
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (e) {
    return sendJson(res, 400, { error: `invalid JSON body: ${e.message}` })
  }

  const template = typeof body?.template === 'string' ? body.template : null
  const params = body?.params && typeof body.params === 'object' ? body.params : {}
  if (!template) return sendJson(res, 400, { error: 'missing template' })
  if (!TEMPLATE_NAMES.includes(template)) {
    return sendJson(res, 400, { error: `unknown template '${template}'` })
  }

  let resolved
  try {
    resolved = resolveTemplate(template, params)
  } catch (e) {
    return sendJson(res, 400, { error: `template param error: ${e.message}` })
  }

  const started = Date.now()
  try {
    let estimate = null
    try {
      estimate = await estimateBytes({
        query: resolved.query,
        params: resolved.params,
        types: resolved.types,
      })
    } catch (e) {
      // Dry-run failures are non-fatal: fall through to the real query so a
      // transient control-plane hiccup doesn't block legitimate traffic.
      estimate = { bytes: null, limit: null, allowed: true, error: e.message }
    }

    if (estimate && estimate.allowed === false) {
      res.setHeader('Cache-Control', 'no-store')
      return sendJson(res, 413, {
        error: 'scan size exceeds ATLAS_MAX_SCAN_BYTES',
        detail: `template '${template}' would scan ${formatBytes(estimate.bytes)} (limit ${formatBytes(estimate.limit)}). Tighten time range or limit.`,
        bytes: estimate.bytes,
        limit: estimate.limit,
      })
    }

    const rows = await runQuery({
      query: resolved.query,
      params: resolved.params,
      types: resolved.types,
      maxRows: resolved.maxRows,
    })
    const durationMs = Date.now() - started
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    if (estimate?.bytes != null) {
      res.setHeader('x-atlas-estimated-bytes', String(estimate.bytes))
    }
    return sendJson(res, 200, {
      rows,
      template,
      durationMs,
      estimatedBytes: estimate?.bytes ?? null,
    })
  } catch (e) {
    const msg = e?.message || String(e)
    const isConfig = /credentials|project|not set/i.test(msg)
    return sendJson(res, isConfig ? 503 : 500, {
      error: isConfig ? 'backend not configured' : 'query failed',
      detail: msg.slice(0, 400),
    })
  }
}
