/**
 * Normalizes article responses from different news APIs to a common shape.
 * Used by processArticles in useNewsData.
 *
 * Normalized shape:
 * { title, description, url, publishedAt, source: { id, name, country } }
 *
 * OPTIMISED: consolidated 3 near-identical functions into a single core
 * normalizer. Per-provider wrappers remain for backwards compatibility.
 */

const NOW_ISO = () => new Date().toISOString()

/** Core normalizer — handles all provider shapes */
function normalizeCore(raw, { publishedAtKey = 'publishedAt', descriptionKeys = ['description'], extractSource } = {}) {
  if (!raw || !raw.url) return null

  // Resolve description from possible keys
  let description = ''
  for (const key of descriptionKeys) {
    if (raw[key]) { description = raw[key]; break }
  }

  const source = extractSource ? extractSource(raw) : {
    id: raw.source?.id || raw.source?.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
    name: raw.source?.name || 'Unknown',
    country: (raw.source?.country || '').toLowerCase(),
  }

  return {
    title: raw.title || '',
    description,
    url: raw.url,
    publishedAt: raw[publishedAtKey] || NOW_ISO(),
    source,
  }
}

export function normalizeNewsApiArticle(raw) {
  const result = normalizeCore(raw)
  if (result && raw.source?.category) {
    result.source.category = raw.source.category
  }
  return result
}

export function normalizeGNewsArticle(raw) {
  return normalizeCore(raw)
}

export function normalizeTheNewsApiArticle(raw) {
  return normalizeCore(raw, {
    publishedAtKey: 'published_at',
    descriptionKeys: ['description', 'snippet'],
    extractSource: (r) => {
      const sourceDimension = r.source || 'unknown'
      const sourceName = sourceDimension.replace(/\.(com|org|net|co\.\w+)$/, '').replace(/\./g, ' ')
      return {
        id: sourceDimension.replace(/\./g, '-'),
        name: sourceName,
        country: (r.locale || '').toLowerCase(),
      }
    },
  })
}
