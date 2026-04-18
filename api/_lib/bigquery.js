/**
 * Lazy-initialised BigQuery client singleton. Reused across warm serverless
 * invocations so we don't re-parse credentials on every request.
 *
 * Credentials come from environment variables (never from code):
 *   GOOGLE_CLOUD_PROJECT     — GCP project that will be billed for queries
 *   GOOGLE_CLOUD_CREDENTIALS — base64-encoded service-account JSON key
 *
 * The service account only needs `roles/bigquery.jobUser` — the public GDELT
 * dataset is readable without additional grants.
 */

let cachedClient = null
let cachedCtor = null

function decodeCredentials() {
  const raw = process.env.GOOGLE_CLOUD_CREDENTIALS
  if (!raw) {
    throw new Error('GOOGLE_CLOUD_CREDENTIALS env var is not set')
  }
  const trimmed = raw.trim()
  const jsonStr = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8')
  try {
    return JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`GOOGLE_CLOUD_CREDENTIALS is not valid JSON: ${e.message}`)
  }
}

async function loadBigQueryCtor() {
  if (cachedCtor) return cachedCtor
  const mod = await import('@google-cloud/bigquery')
  cachedCtor = mod.BigQuery
  return cachedCtor
}

export async function getBigQueryClient() {
  if (cachedClient) return cachedClient
  const BigQuery = await loadBigQueryCtor()
  const credentials = decodeCredentials()
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT env var is not set')
  cachedClient = new BigQuery({ projectId, credentials })
  return cachedClient
}

/**
 * Run a parameterized query. Enforces `maximumBytesBilled` and row cap server-side.
 * @param {{ query: string, params?: object, types?: object, maxRows?: number, maxBytesBilled?: number }} opts
 */
export async function runQuery(opts) {
  const {
    query,
    params = {},
    types = {},
    maxRows = 10_000,
    maxBytesBilled = 5_000_000_000, // 5 GB guard; GDELT partitioned tables are small per query
  } = opts

  const bq = await getBigQueryClient()
  const [rows] = await bq.query({
    query,
    params,
    types,
    maximumBytesBilled: String(maxBytesBilled),
    location: 'US', // gdelt-bq lives in the US multi-region
  })
  return Array.isArray(rows) && rows.length > maxRows ? rows.slice(0, maxRows) : rows
}
