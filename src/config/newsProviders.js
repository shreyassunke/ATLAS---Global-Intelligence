/**
 * News API provider configuration.
 * Each provider has independent quotas; combining them maximizes coverage.
 */

function parseKeys(envValue) {
  if (!envValue || typeof envValue !== 'string') return []
  return envValue.split(',').map((k) => k.trim()).filter(Boolean)
}

export const NEWS_PROVIDERS = [
  {
    id: 'newsapi',
    name: 'NewsAPI',
    envKey: 'VITE_NEWS_API_KEY',
    envKeysMulti: 'VITE_NEWS_API_KEYS',
    getKeys: () => {
      const multi = parseKeys(import.meta.env.VITE_NEWS_API_KEYS)
      if (multi.length > 0) return multi
      const single = import.meta.env.VITE_NEWS_API_KEY
      return single ? [single] : []
    },
    baseUrl: 'https://newsapi.org/v2',
    dailyLimit: 100,
    supportsSources: true,
    supportsDomains: true,
  },
  {
    id: 'gnews',
    name: 'GNews',
    envKey: 'VITE_GNEWS_KEY',
    envKeysMulti: 'VITE_GNEWS_KEYS',
    getKeys: () => {
      const multi = parseKeys(import.meta.env.VITE_GNEWS_KEYS)
      if (multi.length > 0) return multi
      const single = import.meta.env.VITE_GNEWS_KEY
      return single ? [single] : []
    },
    baseUrl: 'https://gnews.io/api/v4',
    dailyLimit: 100,
    supportsSources: false,
    supportsCountry: true,
    supportsCategory: true,
  },
  {
    id: 'thenewsapi',
    name: 'TheNewsAPI',
    envKey: 'VITE_THENEWS_API_KEY',
    envKeysMulti: 'VITE_THENEWS_API_KEYS',
    getKeys: () => {
      const multi = parseKeys(import.meta.env.VITE_THENEWS_API_KEYS)
      if (multi.length > 0) return multi
      const single = import.meta.env.VITE_THENEWS_API_KEY
      return single ? [single] : []
    },
    baseUrl: 'https://api.thenewsapi.com/v1',
    dailyLimit: 50,
    supportsSources: false,
    supportsCountry: true,
  },
]

export const USAGE_STORAGE_KEY = 'atlas_provider_usage'

export function getAvailableProviders() {
  return NEWS_PROVIDERS.filter((p) => p.getKeys().length > 0)
}
