/**
 * Multi-provider news fetcher with fallback on rate limit.
 * Combines results from NewsAPI, GNews, TheNewsAPI; dedupes by URL.
 *
 * OPTIMISED: launches all providers in parallel with Promise.allSettled
 * instead of sequential for-loop. Each provider handles its own rate-limit
 * logic internally. Total fetch time ≈ max(provider times) instead of sum.
 */

import { getAvailableProviders, USAGE_STORAGE_KEY } from '../../config/newsProviders'
import { fetchNewsApi } from './adapters/newsapi'
import { fetchGNews } from './adapters/gnews'
import { fetchTheNewsApi } from './adapters/thenewsapi'

function splitSourcesByType(selectedSources) {
  const standard = []
  const dimensions = []
  for (const s of selectedSources) {
    if (s.type === 'dimension') dimensions.push(s.id)
    else standard.push(s.id)
  }
  return { standard, dimensions }
}

function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    const today = new Date().toDateString()
    const out = {}
    for (const [providerId, v] of Object.entries(data)) {
      if (v?.date === today) out[providerId] = { date: today, count: v.count || 0 }
    }
    return out
  } catch {
    return {}
  }
}

function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage))
  } catch { /* quota */ }
}

function incrementUsage(providerId, dailyLimit) {
  const usage = loadUsage()
  const today = new Date().toDateString()
  const current = usage[providerId] || { date: today, count: 0 }
  if (current.date !== today) current.count = 0
  current.date = today
  current.count = (current.count || 0) + 1
  usage[providerId] = current
  saveUsage(usage)
  return current.count >= dailyLimit
}

function canUseProvider(providerId, dailyLimit) {
  const usage = loadUsage()
  const today = new Date().toDateString()
  const current = usage[providerId]
  if (!current || current.date !== today) return true
  return (current.count || 0) < dailyLimit
}

function dedupeByUrl(articles) {
  const seen = new Set()
  return articles.filter((a) => {
    if (!a?.url || seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
}

/** Map provider id → fetch function call */
function createProviderFetcher(provider, options) {
  const { standard, dimensions, targetArticles, newsApiPages, broaden } = options
  const keys = provider.getKeys()
  if (keys.length === 0) return null

  return async () => {
    for (const key of keys) {
      let result
      try {
        if (provider.id === 'newsapi') {
          result = await fetchNewsApi(key, { standardSources: standard, dimensions, pages: newsApiPages })
        } else if (provider.id === 'gnews') {
          result = await fetchGNews(key, {
            selectedSources: options.selectedSources,
            catalog: options.catalog,
            targetArticles: broaden ? 200 : 120,
            maxCountries: broaden ? 16 : 12,
            maxPerRequest: 10,
          })
        } else if (provider.id === 'thenewsapi') {
          result = await fetchTheNewsApi(key, {
            selectedSources: options.selectedSources,
            catalog: options.catalog,
            targetArticles: broaden ? 200 : 120,
            headlinesPerCategory: 15,
            maxLocaleRequests: broaden ? 4 : 3,
          })
        }
      } catch {
        continue
      }

      if (result && !result.rateLimited) {
        return { providerId: provider.id, articles: result.articles, rateLimited: false }
      }
      if (result?.rateLimited) continue // try next key
    }
    // All keys exhausted or rate limited
    return { providerId: provider.id, articles: [], rateLimited: true }
  }
}

/**
 * Fetch articles from all available providers IN PARALLEL, with fallback on rate limit.
 * Total time ≈ max(provider times) instead of sum of all providers.
 */
export async function fetchFromProviders({
  selectedSources,
  catalog,
  targetArticles = 260,
  newsApiPages = 1,
  broaden = false,
} = {}) {
  const providers = getAvailableProviders()
  const exhaustedProviders = []
  const { standard, dimensions } = splitSourcesByType(selectedSources || [])

  const options = { standard, dimensions, selectedSources, catalog, targetArticles, newsApiPages, broaden }

  // Build parallel fetch tasks for all available providers
  const tasks = []
  const taskProviders = []
  for (const provider of providers) {
    if (!canUseProvider(provider.id, provider.dailyLimit)) {
      exhaustedProviders.push(provider.id)
      continue
    }
    const fetcher = createProviderFetcher(provider, options)
    if (fetcher) {
      tasks.push(fetcher())
      taskProviders.push(provider)
    }
  }

  // Launch ALL providers in parallel
  const results = await Promise.allSettled(tasks)

  const allArticles = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const provider = taskProviders[i]

    if (result.status === 'rejected') continue

    const { articles, rateLimited } = result.value
    if (rateLimited) {
      exhaustedProviders.push(provider.id)
      continue
    }

    if (articles.length > 0) {
      allArticles.push(...articles)
      incrementUsage(provider.id, provider.dailyLimit)
    }
  }

  const deduped = dedupeByUrl(allArticles)
  return { articles: deduped, exhaustedProviders }
}
