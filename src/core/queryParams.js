// ═══════════════════════════════════════════════════════════════════════════
//  ATLAS Query Parameters — URL-serializable filter state
//
//  Scaffolds the full query schema for future NLP integration:
//    "Show me regions with rising protest activity and economic
//     deterioration in the last 30 days"
//      → ?dim=people,economy&tone=negative&time=30d
//
//  Phase 1: serializeFilters / deserializeFilters work with the URL.
//  Phase 2+: NLP layer parses natural language → calls these same helpers.
// ═══════════════════════════════════════════════════════════════════════════

import { DIMENSION_KEYS } from './eventSchema'

export const QUERY_SCHEMA = {
  dimensions: DIMENSION_KEYS,
  priority: ['p1', 'p1p2', 'all'],
  timespan: ['live', '24h', '7d', '30d', 'custom'],
  toneFilter: ['negative', 'neutral', 'positive'],
  region: null, // { lat, lng, radiusKm } — for NLP "show me regions..."
}

/**
 * Serialize current filter state to URL search parameters.
 *
 * @param {Object} state
 * @param {Set|Array} state.activeDimensions - Active dimension keys
 * @param {string} state.priorityFilter - 'p1' | 'p1p2' | 'all'
 * @param {string} state.timeFilter - 'live' | '24h' | '7d' | '30d' | 'custom'
 * @param {string} [state.toneFilter] - 'negative' | 'neutral' | 'positive'
 * @param {{ lat: number, lng: number, radiusKm: number }} [state.region]
 * @returns {URLSearchParams}
 */
export function serializeFilters(state) {
  const params = new URLSearchParams()

  // Dimensions — only serialize if not all-active (save URL space)
  const dims = Array.isArray(state.activeDimensions)
    ? state.activeDimensions
    : [...state.activeDimensions]
  if (dims.length < DIMENSION_KEYS.length) {
    params.set('dim', dims.join(','))
  }

  // Priority
  if (state.priorityFilter && state.priorityFilter !== 'p1') {
    params.set('pri', state.priorityFilter)
  }

  // Time
  if (state.timeFilter && state.timeFilter !== 'live') {
    params.set('time', state.timeFilter)
  }

  // Tone (optional, future)
  if (state.toneFilter) {
    params.set('tone', state.toneFilter)
  }

  // Region (optional, future NLP)
  if (state.region && state.region.lat != null) {
    params.set('region', `${state.region.lat},${state.region.lng},${state.region.radiusKm || 500}`)
  }

  return params
}

/**
 * Deserialize URL search parameters back to filter state.
 *
 * @param {URLSearchParams|string} searchParams
 * @returns {Object} Partial state object to merge into store
 */
export function deserializeFilters(searchParams) {
  const params = typeof searchParams === 'string'
    ? new URLSearchParams(searchParams)
    : searchParams

  const state = {}

  // Dimensions
  if (params.has('dim')) {
    const dims = params.get('dim').split(',').filter(d => DIMENSION_KEYS.includes(d))
    if (dims.length > 0) {
      state.activeDimensions = new Set(dims)
    }
  }

  // Priority
  if (params.has('pri')) {
    const pri = params.get('pri')
    if (QUERY_SCHEMA.priority.includes(pri)) {
      state.priorityFilter = pri
    }
  }

  // Time
  if (params.has('time')) {
    const time = params.get('time')
    if (QUERY_SCHEMA.timespan.includes(time)) {
      state.timeFilter = time
    }
  }

  // Tone
  if (params.has('tone')) {
    const tone = params.get('tone')
    if (QUERY_SCHEMA.toneFilter.includes(tone)) {
      state.toneFilter = tone
    }
  }

  // Region
  if (params.has('region')) {
    const parts = params.get('region').split(',').map(Number)
    if (parts.length >= 2 && parts.every(n => !Number.isNaN(n))) {
      state.region = {
        lat: parts[0],
        lng: parts[1],
        radiusKm: parts[2] || 500,
      }
    }
  }

  return state
}
