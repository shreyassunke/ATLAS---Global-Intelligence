/**
 * Dry-run guard: ask BigQuery to estimate how many bytes a parameterized
 * query would scan, and reject anything that exceeds `ATLAS_MAX_SCAN_BYTES`
 * (default 500 MB). The single most important safeguard against runaway $.
 *
 * Dry runs are free — they do not actually execute the query — so every
 * request costs one extra (cached) control-plane round trip in exchange
 * for a hard ceiling on billable scans.
 */

import { getBigQueryClient } from './bigquery.js'

export const DEFAULT_MAX_SCAN_BYTES = 500_000_000 // 500 MB

export function configuredMaxScanBytes() {
  const raw = Number(process.env.ATLAS_MAX_SCAN_BYTES)
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw)
  return DEFAULT_MAX_SCAN_BYTES
}

/**
 * Estimate a query's bytes scanned. Returns `{ bytes, allowed, limit }`.
 * Throws only on BigQuery errors — policy decisions live in the caller.
 */
export async function estimateBytes({ query, params = {}, types = {} }) {
  const bq = await getBigQueryClient()
  const [job] = await bq.createQueryJob({
    query,
    params,
    types,
    dryRun: true,
    location: 'US',
  })

  const stats = job?.metadata?.statistics
  const bytes = Number(stats?.totalBytesProcessed || stats?.query?.totalBytesProcessed || 0)
  const limit = configuredMaxScanBytes()
  return {
    bytes,
    limit,
    allowed: bytes <= limit,
  }
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`
}
