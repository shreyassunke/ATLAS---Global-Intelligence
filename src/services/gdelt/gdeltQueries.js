/**
 * Shared GDELT query vocabulary — OR-blocks per ATLAS dimension, keyword
 * extraction for event-derived queries, and the HUD `timeFilter → timespan`
 * mapping. Every GDELT service (DOC, GEO, Context, TV, BigQuery) reads from
 * this module so a single change propagates everywhere.
 */

/** OR-blocks aligned with worker GEO/DOC breadth (six ATLAS dimensions). */
export const DIMENSION_GDELT_QUERIES = {
  safety: '(conflict OR war OR military OR terror OR attack OR violence OR protest)',
  governance: '(election OR parliament OR law OR court OR sanctions OR diplomacy OR treaty OR government OR corruption)',
  economy: '(economy OR trade OR market OR inflation OR GDP OR tariff OR recession OR bank)',
  people: '(humanitarian OR migration OR refugee OR health OR disease OR hospital OR hunger OR strike OR labor)',
  environment: '(climate OR environment OR pollution OR wildfire OR flood OR storm OR earthquake OR disaster OR renewable)',
  narrative: '(media OR censorship OR journalist OR press OR disinformation OR narrative OR broadcast)',
}

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'their', 'they', 'about', 'into', 'than',
  'then', 'what', 'when', 'where', 'which', 'while', 'after', 'before', 'between', 'through', 'during',
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day',
  'its', 'who', 'may', 'now', 'how', 'his', 'has', 'had', 'any', 'new', 'way', 'she', 'him', 'two',
])

/** Pull up to `max` meaningful lowercase keywords out of a headline. */
export function tokenizeTitle(title, max = 5) {
  const raw = String(title || '').toLowerCase()
  const words = raw.match(/[a-z][a-z0-9-]{2,}/g) || []
  const out = []
  for (const w of words) {
    if (STOPWORDS.has(w)) continue
    if (!out.includes(w)) out.push(w)
    if (out.length >= max) break
  }
  return out
}

/**
 * Build a compact OR-block from an event title with graceful fallback to the
 * dimension's OR-block vocabulary.
 */
export function buildGdeltDocQuery({ title = '', dimension = 'narrative' } = {}) {
  const base = DIMENSION_GDELT_QUERIES[dimension] || DIMENSION_GDELT_QUERIES.narrative
  const keywords = tokenizeTitle(title, 5)
  if (keywords.length >= 2) return `(${keywords.join(' OR ')})`
  if (keywords.length === 1) return `(${keywords[0]})`
  return base
}

/**
 * Build an OR-block spanning the active ATLAS dimensions. Falls back to all
 * six dimensions when none are active.
 */
export function buildGdeltQueryFromDimensions(activeDimensions) {
  const dims = activeDimensions instanceof Set
    ? [...activeDimensions]
    : Array.isArray(activeDimensions) ? activeDimensions : []
  const parts = dims
    .map((d) => DIMENSION_GDELT_QUERIES[d])
    .filter(Boolean)
    .map((q) => `(${q})`)
  if (parts.length === 0) {
    return Object.values(DIMENSION_GDELT_QUERIES).map((q) => `(${q})`).join(' OR ')
  }
  return parts.join(' OR ')
}

/** Maps HUD `timeFilter` → GDELT `timespan` (DOC/GEO/Context/TV share this). */
export function timespanFromTimeFilter(timeFilter) {
  switch (timeFilter) {
    case '24h': return '1440min'
    case '7d':  return '7d'
    case '30d': return '30d'
    case 'live':
    default:    return '1440min'
  }
}

/**
 * Parse a GDELT date-key of shape YYYYMM / YYYYMMDD / YYYYMMDDHHMMSS into a
 * readable tick label (`YYYY-MM` or `YYYY-MM-DD`). Passes through anything
 * that doesn't match.
 */
export function formatGdeltDateTick(s) {
  const str = String(s || '')
  if (str.length >= 8) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
  if (str.length === 6 && /^\d{6}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}`
  return str
}
