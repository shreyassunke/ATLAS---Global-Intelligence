import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { MOCK_NEWS } from '../utils/mockData'
import { COUNTRY_COORDS } from '../utils/geo'
import { fetchAllSources } from '../utils/newsSources'
import { getAvailableProviders } from '../config/newsProviders'
import { fetchFromProviders } from '../services/newsAPI/fetcher'

const MIN_GLOBE_POINTS = 100
const NEWS_CACHE_KEY = 'atlas_cached_news_items'
const LAST_AUTO_REFRESH_DATE_KEY = 'atlas_last_auto_refresh_date'
const MANUAL_REFRESH_DATE_KEY = 'atlas_manual_refresh_date'

function getTodayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Source ID -> country code for fallback when title/description geocoding fails */
const SOURCE_TO_COUNTRY = {
  'bbc-news': 'gb', 'reuters': 'gb', 'the-guardian-uk': 'gb', 'independent': 'gb',
  'financial-times': 'gb', 'cnn': 'us', 'fox-news': 'us', 'nbc-news': 'us',
  'abc-news': 'us', 'cbs-news': 'us', 'the-washington-post': 'us', 'politico': 'us',
  'npr': 'us', 'usa-today': 'us', 'axios': 'us', 'associated-press': 'us',
  'bloomberg': 'us', 'business-insider': 'us', 'cnbc': 'us', 'techcrunch': 'us',
  'the-verge': 'us', 'ars-technica': 'us', 'wired': 'us', 'engadget': 'us',
  'the-wall-street-journal': 'us', 'al-jazeera-english': 'qa', 'the-times-of-india': 'in',
  'the-hindu': 'in', 'abc-news-au': 'au', 'nhk': 'jp', 'le-monde': 'fr',
  'der-spiegel': 'de', 'focus': 'de', 'ansa': 'it', 'el-mundo': 'es',
  'globo': 'br', 'infobae': 'ar', 'cnn-spanish': 'us', 'rt': 'ru',
  'xinhua': 'cn', 'scmp': 'hk', 'the-jakarta-post': 'id', 'straits-times': 'sg',
}
const GEOCODE_CACHE_KEY = 'atlas_geocode_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

const LOCATION_DB = {
  'united states': { lat: 39.83, lng: -98.58 }, 'us': { lat: 39.83, lng: -98.58 },
  'washington': { lat: 38.91, lng: -77.04 }, 'new york': { lat: 40.71, lng: -74.01 },
  'los angeles': { lat: 34.05, lng: -118.24 }, 'chicago': { lat: 41.88, lng: -87.63 },
  'london': { lat: 51.51, lng: -0.13 }, 'uk': { lat: 51.51, lng: -0.13 },
  'britain': { lat: 51.51, lng: -0.13 }, 'england': { lat: 51.51, lng: -0.13 },
  'paris': { lat: 48.86, lng: 2.35 }, 'france': { lat: 46.60, lng: 1.89 },
  'berlin': { lat: 52.52, lng: 13.41 }, 'germany': { lat: 51.17, lng: 10.45 },
  'moscow': { lat: 55.76, lng: 37.62 }, 'russia': { lat: 61.52, lng: 105.32 },
  'beijing': { lat: 39.90, lng: 116.40 }, 'china': { lat: 35.86, lng: 104.20 },
  'shanghai': { lat: 31.23, lng: 121.47 },
  'tokyo': { lat: 35.68, lng: 139.69 }, 'japan': { lat: 36.20, lng: 138.25 },
  'delhi': { lat: 28.61, lng: 77.21 }, 'india': { lat: 20.59, lng: 78.96 },
  'mumbai': { lat: 19.08, lng: 72.88 },
  'sydney': { lat: -33.87, lng: 151.21 }, 'australia': { lat: -25.27, lng: 133.78 },
  'cairo': { lat: 30.04, lng: 31.24 }, 'egypt': { lat: 26.82, lng: 30.80 },
  'dubai': { lat: 25.20, lng: 55.27 }, 'uae': { lat: 23.42, lng: 53.85 },
  'israel': { lat: 31.05, lng: 34.85 }, 'tel aviv': { lat: 32.09, lng: 34.78 },
  'jerusalem': { lat: 31.77, lng: 35.23 },
  'iran': { lat: 32.43, lng: 53.69 }, 'tehran': { lat: 35.69, lng: 51.39 },
  'iraq': { lat: 33.22, lng: 43.68 }, 'baghdad': { lat: 33.31, lng: 44.37 },
  'syria': { lat: 34.80, lng: 38.99 },
  'ukraine': { lat: 48.38, lng: 31.17 }, 'kyiv': { lat: 50.45, lng: 30.52 },
  'brazil': { lat: -14.24, lng: -51.93 }, 'sao paulo': { lat: -23.55, lng: -46.63 },
  'mexico': { lat: 23.63, lng: -102.55 }, 'mexico city': { lat: 19.43, lng: -99.13 },
  'canada': { lat: 56.13, lng: -106.35 }, 'toronto': { lat: 43.65, lng: -79.38 },
  'ottawa': { lat: 45.42, lng: -75.70 },
  'south korea': { lat: 35.91, lng: 127.77 }, 'seoul': { lat: 37.57, lng: 126.98 },
  'north korea': { lat: 40.34, lng: 127.51 },
  'taiwan': { lat: 23.70, lng: 120.96 }, 'taipei': { lat: 25.03, lng: 121.57 },
  'singapore': { lat: 1.35, lng: 103.82 },
  'hong kong': { lat: 22.40, lng: 114.11 },
  'pakistan': { lat: 30.38, lng: 69.35 }, 'islamabad': { lat: 33.69, lng: 73.04 },
  'afghanistan': { lat: 33.94, lng: 67.71 }, 'kabul': { lat: 34.53, lng: 69.17 },
  'africa': { lat: 1.65, lng: 17.78 },
  'south africa': { lat: -30.56, lng: 22.94 },
  'nigeria': { lat: 9.08, lng: 8.68 }, 'lagos': { lat: 6.45, lng: 3.40 },
  'kenya': { lat: -0.02, lng: 37.91 }, 'nairobi': { lat: -1.29, lng: 36.82 },
  'ethiopia': { lat: 9.15, lng: 40.49 },
  'sudan': { lat: 15.59, lng: 32.53 },
  'somalia': { lat: 5.15, lng: 46.20 },
  'europe': { lat: 54.53, lng: 15.26 },
  'eu': { lat: 50.85, lng: 4.35 },
  'nato': { lat: 50.85, lng: 4.35 },
  'un': { lat: 40.75, lng: -73.97 },
  'pentagon': { lat: 38.87, lng: -77.06 },
  'white house': { lat: 38.90, lng: -77.04 },
  'wall street': { lat: 40.71, lng: -74.01 },
  'silicon valley': { lat: 37.39, lng: -122.08 },
  'gaza': { lat: 31.35, lng: 34.31 },
  'palestine': { lat: 31.95, lng: 35.23 },
  'lebanon': { lat: 33.85, lng: 35.86 },
  'saudi arabia': { lat: 23.89, lng: 45.08 },
  'yemen': { lat: 15.55, lng: 48.52 },
  'libya': { lat: 26.34, lng: 17.23 },
  'argentina': { lat: -38.42, lng: -63.62 },
  'buenos aires': { lat: -34.60, lng: -58.38 },
  'colombia': { lat: 4.57, lng: -74.30 },
  'peru': { lat: -9.19, lng: -75.02 },
  'chile': { lat: -35.68, lng: -71.54 },
  'santiago': { lat: -33.45, lng: -70.67 },
}

const CATEGORY_KEYWORDS = {
  // Hard news
  war_conflict: [
    'war', 'military', 'troops', 'sanctions', 'conflict', 'nato', 'airstrike', 'missile',
    'invasion', 'battle', 'frontline', 'ceasefire', 'shelling',
  ],
  politics_government: [
    'election', 'vote', 'parliament', 'senate', 'congress', 'lawmakers', 'campaign',
    'government', 'prime minister', 'president', 'minister', 'cabinet', 'policy', 'bill',
    'referendum', 'coalition', 'democracy',
  ],
  crime_justice: [
    'crime', 'murder', 'shooting', 'police', 'court', 'trial', 'lawsuit', 'verdict',
    'arrested', 'charged', 'indicted', 'sentenced', 'investigation',
  ],
  environment_climate: [
    'climate', 'emissions', 'carbon', 'renewable', 'wildfire', 'hurricane', 'cyclone',
    'flood', 'drought', 'storm', 'typhoon', 'heatwave', 'earthquake', 'tsunami',
  ],
  health_medicine: [
    'covid', 'vaccine', 'virus', 'disease', 'cancer', 'hospital', 'doctor', 'patients',
    'public health', 'pandemic', 'epidemic', 'outbreak', 'medicine', 'therapy',
  ],
  science_technology: [
    'ai', 'artificial intelligence', 'machine learning', 'nasa', 'research', 'study',
    'quantum', 'robot', 'chip', 'semiconductor', 'startup', 'innovation', 'tech',
  ],
  space_astronomy: [
    'space', 'orbit', 'astronaut', 'rocket', 'launch', 'spacecraft', 'moon', 'mars',
  ],
  business_economy: [
    'gdp', 'inflation', 'recession', 'economy', 'economic', 'fiscal', 'tariff', 'trade',
  ],
  finance_markets: [
    'market', 'stock', 'stocks', 'shares', 'ipo', 'bond', 'bonds', 'crypto', 'bitcoin',
    'ethereum', 'bank', 'banks', 'merger', 'acquisition', 'deal', 'earnings', 'investor',
  ],

  // Soft news
  sports: [
    'match', 'tournament', 'league', 'championship', 'cup', 'olympics', 'goal', 'score',
    'coach', 'player', 'team', 'season',
  ],
  entertainment_celebrity: [
    'celebrity', 'hollywood', 'movie star', 'actor', 'actress', 'festival', 'oscars',
    'emmys', 'box office',
  ],
  arts_music: [
    'album', 'song', 'concert', 'tour', 'artist', 'musician', 'band', 'museum', 'gallery',
    'exhibit',
  ],
  lifestyle_culture: [
    'lifestyle', 'culture', 'trend', 'social media', 'influencer', 'festival', 'holiday',
  ],
  food_travel: [
    'restaurant', 'cuisine', 'food', 'chef', 'travel', 'tourism', 'destination', 'flight',
    'hotel', 'resort',
  ],
  fashion_beauty: [
    'fashion', 'runway', 'collection', 'designer', 'makeup', 'beauty', 'style',
  ],
  human_interest: [
    'heartwarming', 'personal story', 'profile', 'community', 'kindness', 'volunteer',
    'charity', 'nonprofit',
  ],

  // Specialty
  real_estate: [
    'real estate', 'housing market', 'home prices', 'mortgage', 'property',
  ],
  automotive: [
    'car', 'cars', 'automaker', 'ev', 'electric vehicle', 'automotive', 'truck',
  ],
  agriculture: [
    'farm', 'farmer', 'agriculture', 'crop', 'harvest', 'soy', 'corn', 'wheat',
  ],
  energy: [
    'oil', 'gas', 'energy', 'power plant', 'nuclear plant', 'grid', 'pipeline',
  ],
  religion_faith: [
    'church', 'mosque', 'temple', 'religion', 'faith', 'pope', 'vatican',
  ],
  labor_workforce: [
    'union', 'strike', 'workers', 'wage', 'labor', 'employment', 'jobless',
  ],
  immigration: [
    'immigration', 'migrant', 'migrants', 'border crossing', 'asylum', 'refugee',
  ],

  // Local & opinion
  local_politics: [
    'mayor', 'city council', 'local election', 'county', 'municipal',
  ],
  community_events: [
    'parade', 'festival', 'fair', 'community event', 'local celebration',
  ],
  weather: [
    'forecast', 'temperatures', 'rain', 'snow', 'heatwave', 'storm warning',
  ],
  traffic_transportation: [
    'traffic', 'congestion', 'highway', 'commute', 'subway', 'metro', 'train', 'bus',
  ],
  obituaries: [
    'obituary', 'dies at', 'passes away', 'funeral', 'memorial',
  ],
  editorials: [
    'editorial', 'editorial board',
  ],
  op_eds: [
    'op-ed', 'op ed', 'opinion', 'columnist',
  ],
  fact_checks: [
    'fact check', 'fact-check', 'truth-o-meter',
  ],
  investigations: [
    'investigation', 'longform', 'in-depth', 'special report',
  ],
}

const HIGH_PROMINENCE_SOURCES = [
  'associated-press', 'reuters', 'bbc-news', 'cnn', 'bloomberg',
  'the-wall-street-journal', 'the-washington-post', 'al-jazeera-english',
]

const CATEGORY_WEIGHTS = {
  war_conflict: 5,
  politics_government: 4,
  world_international: 4,
  crime_justice: 4,
  finance_markets: 4,
  business_economy: 3,
  science_technology: 3,
  health_medicine: 3,
  environment_climate: 3,
  human_interest: 3,
  sports: 2,
  entertainment_celebrity: 2,
}

function categorizeArticle(article) {
  const text = `${article.title} ${article.description || ''}`.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return cat
  }
  const apiCat = article.source?.category?.toLowerCase()
  if (apiCat === 'business') return 'finance_markets'
  if (apiCat === 'technology' || apiCat === 'science') return 'science_technology'
  if (apiCat === 'health') return 'health_medicine'
  if (apiCat === 'sports') return 'sports'
  if (apiCat === 'entertainment') return 'entertainment_celebrity'
  // Default: treat as world/international hard news
  return 'world_international'
}

function scoreImportance(article, category) {
  let score = CATEGORY_WEIGHTS[category] || 2
  const age = Date.now() - new Date(article.publishedAt).getTime()
  if (age < 60 * 60 * 1000) score += 1
  const sourceId = article.source?.id || ''
  if (HIGH_PROMINENCE_SOURCES.includes(sourceId)) score += 1
  return Math.max(1, Math.min(5, score))
}

function extractLocation(text) {
  const lower = text.toLowerCase()
  for (const [key, coords] of Object.entries(LOCATION_DB)) {
    if (lower.includes(key)) return coords
  }
  return null
}

function hashToUnitFloat(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Map uint32 -> [0,1)
  return ((h >>> 0) % 1000000) / 1000000
}

function jitterCoords(coords, seed, maxDeltaDeg = 1.8) {
  const s = String(seed || '')
  const a = hashToUnitFloat(`${s}:a`) * 2 - 1
  const b = hashToUnitFloat(`${s}:b`) * 2 - 1
  const lat = Math.max(-85, Math.min(85, coords.lat + a * maxDeltaDeg))
  const lng = Math.max(-179, Math.min(179, coords.lng + b * maxDeltaDeg))
  return { lat, lng }
}

function loadGeocodeCache() {
  try {
    const data = JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || '{}')
    const now = Date.now()
    const valid = {}
    for (const [k, v] of Object.entries(data)) {
      if (now - v.ts < CACHE_TTL) valid[k] = v
    }
    return valid
  } catch {
    return {}
  }
}

function saveGeocodeCache(cache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache))
  } catch { /* quota exceeded */ }
}

function loadCachedNewsItems() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data) || data.length === 0) return null
    return data
  } catch {
    return null
  }
}

function saveNewsItemsToCache(items) {
  try {
    if (!Array.isArray(items) || items.length === 0) return
    const trimmed = items.slice(0, 600)
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

const NOMINATIM_TIMEOUT_MS = 3000

async function geocodeWithNominatim(query, cache) {
  if (cache[query]) return { lat: cache[query].lat, lng: cache[query].lng }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ATLAS-Globe/1.0' }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json()
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      cache[query] = { ...result, ts: Date.now() }
      return result
    }
  } catch {
    clearTimeout(timer)
  }
  return null
}

/**
 * Batch Nominatim lookups with staggered delays.
 * Instead of: sequential 1.1s sleep × N lookups = ~N*1.1s
 * Now: stagger launches 120ms apart, total ≈ max(response time) + 120ms*N
 * Nominatim rate limit is 1 req/s, but with stagger this stays under limit.
 */
async function batchGeocodeNominatim(queries, cache) {
  const results = new Map()
  const uncached = queries.filter((q) => {
    if (cache[q]) {
      results.set(q, { lat: cache[q].lat, lng: cache[q].lng })
      return false
    }
    return true
  })

  if (uncached.length === 0) return results

  const STAGGER_MS = 120
  const promises = uncached.map((query, i) =>
    new Promise((resolve) => setTimeout(resolve, i * STAGGER_MS))
      .then(() => geocodeWithNominatim(query, cache))
      .then((coords) => { if (coords) results.set(query, coords) }),
  )

  await Promise.allSettled(promises)
  saveGeocodeCache(cache)
  return results
}


/** Build sourceId -> country from catalog (covers all 120+ sources, not just hardcoded) */
function buildSourceCountryMap(catalog) {
  const map = { ...SOURCE_TO_COUNTRY }
  if (catalog && Array.isArray(catalog)) {
    for (const s of catalog) {
      if (s.id && s.country) map[s.id] = String(s.country).toLowerCase()
    }
  }
  return map
}

async function processArticles(articles, sourceCatalog, { maxItems = 300, maxNominatimLookups = 10 } = {}) {
  const geocodeCache = loadGeocodeCache()
  const sourceCountryMap = buildSourceCountryMap(sourceCatalog)
  const seenUrls = new Set()

  // First pass: resolve local locations, collect Nominatim candidates
  const processed = []
  const nominatimCandidates = [] // { index, query }

  for (const article of articles) {
    if (processed.length >= maxItems) break
    if (!article.url || seenUrls.has(article.url)) continue
    seenUrls.add(article.url)

    const text = `${article.title} ${article.description || ''}`
    let coords = extractLocation(text)
    let fromCountryFallback = false

    if (!coords) {
      let countryCode = (article.source?.id && sourceCountryMap[article.source.id]) ||
        (article.source?.country && String(article.source.country).toLowerCase())
      if (countryCode && countryCode.includes(',')) {
        countryCode = countryCode.split(',')[0].trim()
      }
      if (countryCode && COUNTRY_COORDS[countryCode]) {
        coords = COUNTRY_COORDS[countryCode]
        fromCountryFallback = true
      }
    }

    // Mark for Nominatim batch if still no coords
    let needsNominatim = false
    if (!coords && nominatimCandidates.length < maxNominatimLookups) {
      const query = article.title?.split(' - ')[0] || ''
      if (query.trim().length > 2) {
        nominatimCandidates.push({ index: processed.length, query: query.trim() })
        needsNominatim = true
      }
    }

    processed.push({ article, coords, fromCountryFallback, needsNominatim })
  }

  // Batch Nominatim lookups (staggered, non-blocking)
  if (nominatimCandidates.length > 0) {
    const queries = nominatimCandidates.map((c) => c.query)
    const geocodeResults = await batchGeocodeNominatim(queries, geocodeCache)
    for (const { index, query } of nominatimCandidates) {
      const coords = geocodeResults.get(query)
      if (coords) {
        processed[index].coords = coords
        processed[index].fromCountryFallback = false
      }
    }
  }

  // Final pass: build items with resolved coords
  const items = []
  const locationCounts = {}

  for (let i = 0; i < processed.length; i++) {
    const entry = processed[i]
    const { article } = entry
    let coords = entry.coords

    // Hash-based fallback for articles still without coords
    if (!coords) {
      const countryKeys = Object.keys(COUNTRY_COORDS)
      const idx = Math.floor(hashToUnitFloat(article.url || article.title) * countryKeys.length)
      const fallbackCountry = countryKeys[idx] || 'us'
      coords = jitterCoords(COUNTRY_COORDS[fallbackCountry], article.url, 2.5)
    } else if (entry.fromCountryFallback) {
      coords = jitterCoords(coords, article.url)
    }

    const category = categorizeArticle(article)
    const importance = scoreImportance(article, category)

    const locKey = `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`
    locationCounts[locKey] = (locationCounts[locKey] || 0) + 1

    let normalizedUrl = article.url
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl.replace(/^\/+/, '')}`
    }

    items.push({
      id: article.url || `${Date.now()}-${items.length}`,
      title: article.title,
      url: normalizedUrl,
      lat: coords.lat,
      lng: coords.lng,
      category,
      importance,
      magnitude: locationCounts[locKey],
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt,
      description: article.description,
    })
  }

  return items
}

export function useNewsData() {
  const selectedSources = useAtlasStore((s) => s.selectedSources)
  const sourceCatalog = useAtlasStore((s) => s.sourceCatalog)
  const setNewsItems = useAtlasStore((s) => s.setNewsItems)
  const setIsLoading = useAtlasStore((s) => s.setIsLoading)
  const setManualRefreshUsedToday = useAtlasStore((s) => s.setManualRefreshUsedToday)
  const setTriggerManualRefresh = useAtlasStore((s) => s.setTriggerManualRefresh)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)

  useEffect(() => {
    if (!hasCompletedOnboarding) return

    const today = getTodayLocal()
    const lastAuto = localStorage.getItem(LAST_AUTO_REFRESH_DATE_KEY)
    const lastManual = localStorage.getItem(MANUAL_REFRESH_DATE_KEY)
    setManualRefreshUsedToday(lastManual === today)

    async function fetchNews() {
      const providers = getAvailableProviders()
      if (providers.length === 0 || selectedSources.length === 0) {
        const cached = loadCachedNewsItems()
        if (cached && cached.length > 0) {
          setNewsItems(cached)
        } else {
          setNewsItems(MOCK_NEWS)
        }
        return
      }

      setIsLoading(true)

      try {
        let catalog = sourceCatalog
        if (catalog.length === 0) {
          const newsApiKey = import.meta.env.VITE_NEWS_API_KEY || providers.find((p) => p.id === 'newsapi')?.getKeys()?.[0]
          catalog = await fetchAllSources(newsApiKey)
          useAtlasStore.getState().setSourceCatalog(catalog)
        }

        const { articles: allArticles } = await fetchFromProviders({
          selectedSources,
          catalog,
          targetArticles: 400,
          newsApiPages: 2,
          broaden: true,
        })

        if (allArticles.length === 0) {
          const cached = loadCachedNewsItems()
          if (cached && cached.length > 0) {
            setNewsItems(cached)
          } else {
            setNewsItems(MOCK_NEWS)
          }
          return
        }

        let items = await processArticles(allArticles, catalog, { maxItems: 500, maxNominatimLookups: 18 })

        if (items.length < MIN_GLOBE_POINTS) {
          const { articles: moreArticles } = await fetchFromProviders({
            selectedSources,
            catalog,
            targetArticles: 500,
            newsApiPages: 2,
            broaden: true,
          })

          if (moreArticles.length > 0) {
            const byUrl = new Map()
            for (const a of allArticles) if (a?.url) byUrl.set(a.url, a)
            for (const a of moreArticles) if (a?.url) byUrl.set(a.url, a)
            const merged = Array.from(byUrl.values())
            items = await processArticles(merged, catalog, { maxItems: 500, maxNominatimLookups: 12 })
          }
        }

        if (items.length > 0 && items.length < MIN_GLOBE_POINTS) {
          const needed = MIN_GLOBE_POINTS - items.length
          const supplement = MOCK_NEWS.slice(0, needed).map((m, i) => ({
            ...m,
            id: `supplement-${i}-${Date.now()}`,
          }))
          items = [...items, ...supplement]
        }

        if (items.length > 0) {
          saveNewsItemsToCache(items)
          setNewsItems(items)
        } else {
          const cached = loadCachedNewsItems()
          if (cached && cached.length > 0) {
            setNewsItems(cached)
          } else {
            setNewsItems(MOCK_NEWS)
          }
        }
      } catch {
        const cached = loadCachedNewsItems()
        if (cached && cached.length > 0) {
          setNewsItems(cached)
        } else {
          setNewsItems(MOCK_NEWS)
        }
      } finally {
        setIsLoading(false)
      }
    }

    // Daily auto: run once per day on first load
    if (lastAuto !== today) {
      fetchNews().then(() => {
        try {
          localStorage.setItem(LAST_AUTO_REFRESH_DATE_KEY, today)
        } catch { /* quota */ }
      })
    } else {
      const cached = loadCachedNewsItems()
      if (cached && cached.length > 0) {
        setNewsItems(cached)
      } else {
        setNewsItems(MOCK_NEWS)
      }
    }

    function doManualRefresh() {
      const nowToday = getTodayLocal()
      if (localStorage.getItem(MANUAL_REFRESH_DATE_KEY) === nowToday) return
      setIsLoading(true)
      fetchNews().then(() => {
        try {
          localStorage.setItem(MANUAL_REFRESH_DATE_KEY, nowToday)
          setManualRefreshUsedToday(true)
        } catch { /* quota */ }
      })
    }

    setTriggerManualRefresh(doManualRefresh)

    return () => setTriggerManualRefresh(null)
  }, [hasCompletedOnboarding, selectedSources, sourceCatalog, setNewsItems, setIsLoading, setManualRefreshUsedToday, setTriggerManualRefresh])
}
