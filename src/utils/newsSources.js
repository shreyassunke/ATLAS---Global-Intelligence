const SOURCES_CACHE_KEY = 'atlas_source_catalog'
const SOURCES_CACHE_TTL = 24 * 60 * 60 * 1000

export const NEWS_SOURCES = [
  { id: 'cnn', name: 'CNN', country: 'US', region: 'us', category: 'general', url: 'https://cnn.com' },
  { id: 'fox-news', name: 'Fox News', country: 'US', region: 'us', category: 'general', url: 'https://foxnews.com' },
  { id: 'nbc-news', name: 'NBC News', country: 'US', region: 'us', category: 'general', url: 'https://nbcnews.com' },
  { id: 'abc-news', name: 'ABC News', country: 'US', region: 'us', category: 'general', url: 'https://abcnews.go.com' },
  { id: 'cbs-news', name: 'CBS News', country: 'US', region: 'us', category: 'general', url: 'https://cbsnews.com' },
  { id: 'the-washington-post', name: 'The Washington Post', country: 'US', region: 'us', category: 'general', url: 'https://washingtonpost.com' },
  { id: 'the-wall-street-journal', name: 'The Wall Street Journal', country: 'US', region: 'us', category: 'business', url: 'https://wsj.com' },
  { id: 'politico', name: 'Politico', country: 'US', region: 'us', category: 'general', url: 'https://politico.com' },
  { id: 'npr', name: 'NPR', country: 'US', region: 'us', category: 'general', url: 'https://npr.org' },
  { id: 'usa-today', name: 'USA Today', country: 'US', region: 'us', category: 'general', url: 'https://usatoday.com' },
  { id: 'axios', name: 'Axios', country: 'US', region: 'us', category: 'general', url: 'https://axios.com' },
  { id: 'bbc-news', name: 'BBC News', country: 'GB', region: 'europe', category: 'general', url: 'https://bbc.co.uk' },
  { id: 'reuters', name: 'Reuters', country: 'GB', region: 'europe', category: 'general', url: 'https://reuters.com' },
  { id: 'the-guardian-uk', name: 'The Guardian', country: 'GB', region: 'europe', category: 'general', url: 'https://theguardian.com' },
  { id: 'independent', name: 'The Independent', country: 'GB', region: 'europe', category: 'general', url: 'https://independent.co.uk' },
  { id: 'financial-times', name: 'Financial Times', country: 'GB', region: 'europe', category: 'business', url: 'https://ft.com' },
  { id: 'the-times-of-india', name: 'Times of India', country: 'IN', region: 'asia', category: 'general', url: 'https://timesofindia.indiatimes.com' },
  { id: 'the-hindu', name: 'The Hindu', country: 'IN', region: 'asia', category: 'general', url: 'https://thehindu.com' },
  { id: 'al-jazeera-english', name: 'Al Jazeera', country: 'QA', region: 'asia', category: 'general', url: 'https://aljazeera.com' },
  { id: 'abc-news-au', name: 'ABC News (AU)', country: 'AU', region: 'asia', category: 'general', url: 'https://abc.net.au' },
  { id: 'bloomberg', name: 'Bloomberg', country: 'US', region: 'business', category: 'business', url: 'https://bloomberg.com' },
  { id: 'business-insider', name: 'Business Insider', country: 'US', region: 'business', category: 'business', url: 'https://businessinsider.com' },
  { id: 'cnbc', name: 'CNBC', country: 'US', region: 'business', category: 'business', url: 'https://cnbc.com' },
  { id: 'fortune', name: 'Fortune', country: 'US', region: 'business', category: 'business', url: 'https://fortune.com' },
  { id: 'techcrunch', name: 'TechCrunch', country: 'US', region: 'tech', category: 'technology', url: 'https://techcrunch.com' },
  { id: 'the-verge', name: 'The Verge', country: 'US', region: 'tech', category: 'technology', url: 'https://theverge.com' },
  { id: 'ars-technica', name: 'Ars Technica', country: 'US', region: 'tech', category: 'technology', url: 'https://arstechnica.com' },
  { id: 'wired', name: 'Wired', country: 'US', region: 'tech', category: 'technology', url: 'https://wired.com' },
  { id: 'engadget', name: 'Engadget', country: 'US', region: 'tech', category: 'technology', url: 'https://engadget.com' },
  { id: 'associated-press', name: 'Associated Press', country: 'US', region: 'wire', category: 'general', url: 'https://apnews.com' },
]

export const FEATURED_SOURCE_IDS = [
  'associated-press', 'reuters', 'bbc-news', 'cnn', 'al-jazeera-english',
  'bloomberg', 'the-washington-post', 'the-guardian-uk', 'the-times-of-india',
  'abc-news', 'fox-news', 'nbc-news', 'financial-times', 'cnbc',
  'techcrunch', 'the-verge', 'npr', 'the-wall-street-journal', 'politico', 'usa-today',
]

export const REGION_LABELS = {
  wire: 'Wire Services',
  us: 'United States',
  europe: 'UK / Europe',
  asia: 'Asia-Pacific',
  africa: 'Africa',
  business: 'Business / Finance',
  tech: 'Technology',
  latam: 'Latin America',
  other: 'Other',
  custom: 'Custom Domains',
}

export const REGION_ORDER = ['wire', 'us', 'europe', 'asia', 'africa', 'business', 'tech', 'latam', 'other', 'custom']

/** Search terms that map to a region (e.g. "africa" → region "africa") */
export const REGION_SEARCH_TERMS = {
  africa: ['africa', 'african'],
  europe: ['europe', 'european', 'uk', 'britain', 'london'],
  asia: ['asia', 'asian', 'pacific', 'australia'],
  latam: ['latin america', 'latam', 'south america', 'central america', 'caribbean'],
  us: ['usa', 'united states', 'america', 'us'],
}

export const DEFAULT_SOURCES = [
  { id: 'reuters', name: 'Reuters', type: 'source' },
  { id: 'bbc-news', name: 'BBC News', type: 'source' },
  { id: 'cnn', name: 'CNN', type: 'source' },
  { id: 'associated-press', name: 'Associated Press', type: 'source' },
  { id: 'al-jazeera-english', name: 'Al Jazeera', type: 'source' },
  { id: 'bloomberg', name: 'Bloomberg', type: 'source' },
  { id: 'the-times-of-india', name: 'Times of India', type: 'source' },
]

export function getSourcesByRegion(catalog) {
  const list = catalog && catalog.length > 0 ? catalog : NEWS_SOURCES
  const grouped = {}
  for (const source of list) {
    const region = source.region || source.category || 'other'
    if (!grouped[region]) grouped[region] = []
    grouped[region].push(source)
  }
  return grouped
}

function loadCachedCatalog() {
  try {
    const raw = localStorage.getItem(SOURCES_CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts < SOURCES_CACHE_TTL && Array.isArray(data)) return data
  } catch { /* corrupt cache */ }
  return null
}

function saveCatalogCache(data) {
  try {
    localStorage.setItem(SOURCES_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* quota */ }
}

function regionFromCountry(country) {
  const map = {
    us: 'us', gb: 'europe', de: 'europe', fr: 'europe', it: 'europe', nl: 'europe',
    at: 'europe', be: 'europe', ch: 'europe', se: 'europe', no: 'europe', ie: 'europe',
    pl: 'europe', ru: 'europe', ua: 'europe', es: 'europe', pt: 'europe', tr: 'europe',
    in: 'asia', au: 'asia', jp: 'asia', kr: 'asia', cn: 'asia', tw: 'asia', sg: 'asia',
    hk: 'asia', ph: 'asia', my: 'asia', th: 'asia', id: 'asia', qa: 'asia', ae: 'asia',
    il: 'asia', sa: 'asia', pk: 'asia', nz: 'asia',
    za: 'africa', ng: 'africa', eg: 'africa', ke: 'africa', gh: 'africa', et: 'africa',
    ma: 'africa', dz: 'africa', tn: 'africa', zw: 'africa', tz: 'africa', ug: 'africa',
    br: 'latam', mx: 'latam', ar: 'latam', co: 'latam', ve: 'latam', cu: 'latam',
    cl: 'latam', pe: 'latam', ec: 'latam', ca: 'us',
  }
  return map[(country || '').toLowerCase()] || 'other'
}

export async function fetchAllSources(apiKey) {
  const cached = loadCachedCatalog()
  if (cached) return cached

  if (!apiKey) return NEWS_SOURCES

  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines/sources?apiKey=${apiKey}`,
    )
    const data = await res.json()

    if (data.status !== 'ok' || !Array.isArray(data.sources)) return NEWS_SOURCES

    const catalog = data.sources.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      country: (s.country || '').toUpperCase(),
      category: s.category || 'general',
      language: s.language || 'en',
      url: s.url || '',
      region: regionFromCountry(s.country),
    }))

    saveCatalogCache(catalog)
    return catalog
  } catch {
    return NEWS_SOURCES
  }
}

export function scoreMatch(query, source) {
  const q = query.toLowerCase()
  const name = (source.name || '').toLowerCase()
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  if (source.description?.toLowerCase().includes(q)) return 40
  if (source.url?.toLowerCase().includes(q)) return 30
  if (source.country?.toLowerCase().includes(q)) return 20
  if (source.category?.toLowerCase().includes(q)) return 10
  return 0
}

export function searchSources(query, catalog) {
  if (!query || query.length < 2) return []
  const results = catalog
    .map((s) => ({ ...s, _score: scoreMatch(query, s) }))
    .filter((s) => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 20)
  return results
}

/** Get region from search query if it matches a known region term */
function getRegionFromQuery(query) {
  const q = (query || '').toLowerCase().trim()
  for (const [region, terms] of Object.entries(REGION_SEARCH_TERMS)) {
    if (terms.some((t) => q === t || q.includes(t))) return region
  }
  return null
}

/**
 * Search sources by text, region name, or city/location (geocoded).
 * Returns sources matching name/description OR in the queried region/country.
 */
export async function searchSourcesByLocation(query, catalog) {
  if (!query || query.trim().length < 2) return []
  const q = query.trim()
  const list = catalog && catalog.length > 0 ? catalog : NEWS_SOURCES

  // 1. Text match (name, description, url, etc.)
  const textMatches = searchSources(q, list)
  const byId = new Map(textMatches.map((s) => [s.id, { ...s, _score: s._score }]))

  // 2. Region name match (e.g. "africa" → all sources in africa)
  const region = getRegionFromQuery(q)
  if (region) {
    for (const s of list) {
      if ((s.region || 'other') === region && !byId.has(s.id)) {
        byId.set(s.id, { ...s, _score: 50, _locationMatch: true })
      }
    }
  }

  // 3. Geocode as city/location → filter by country
  const { geocodePlace } = await import('./geo')
  const geo = await geocodePlace(q)
  if (geo?.countryCode) {
    const country = geo.countryCode.toUpperCase()
    for (const s of list) {
      if ((s.country || '').toUpperCase() === country && !byId.has(s.id)) {
        byId.set(s.id, { ...s, _score: 60, _locationMatch: true, _placeName: geo.displayName })
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
    .slice(0, 25)
}

export function getSourceMeta(selectedSource, catalog) {
  if (selectedSource.type === 'domain') {
    return { region: 'custom', country: '—', name: selectedSource.name }
  }
  const found = catalog.find((s) => s.id === selectedSource.id)
  if (found) {
    return {
      region: found.region || 'other',
      country: found.country || '—',
      name: found.name,
    }
  }
  return { region: 'other', country: '—', name: selectedSource.name }
}

export function groupSelectedByRegion(selectedSources, catalog) {
  const groups = {}
  for (const s of selectedSources) {
    const meta = getSourceMeta(s, catalog)
    const region = meta.region || 'other'
    if (!groups[region]) groups[region] = []
    groups[region].push({ ...s, ...meta })
  }
  return groups
}
