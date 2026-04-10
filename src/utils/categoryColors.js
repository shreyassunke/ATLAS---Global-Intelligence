// Unified category system for globe, filters, ticker, and legends.
// Keys are internal; labels and icons are user-facing.
export const CATEGORIES = {
  // --- Hard News ---
  politics_government: {
    color: '#f97373',
    label: 'Politics & Government',
    icon: '🔴', // U+1F534
  },
  world_international: {
    color: '#22c55e',
    label: 'World / International',
    icon: '🌍', // U+1F30D
  },
  business_economy: {
    color: '#facc15',
    label: 'Business & Economy',
    icon: '💹', // U+1F4B9
  },
  science_technology: {
    color: '#0ea5e9',
    label: 'Science & Technology',
    icon: '🔬', // U+1F52C
  },
  health_medicine: {
    color: '#22d3ee',
    label: 'Health & Medicine',
    icon: '🏥', // U+1F3E5
  },
  environment_climate: {
    color: '#4ade80',
    label: 'Environment & Climate',
    icon: '🌿', // U+1F33F
  },
  crime_justice: {
    color: '#f97316',
    label: 'Crime & Justice',
    icon: '⚖️', // U+2696
  },
  war_conflict: {
    color: '#ef4444',
    label: 'War & Conflict',
    icon: '💣', // U+1F4A3
  },
  education: {
    color: '#38bdf8',
    label: 'Education',
    icon: '🎓', // U+1F393
  },

  // --- Soft News ---
  entertainment_celebrity: {
    color: '#e879f9',
    label: 'Entertainment & Celebrity',
    icon: '🎬', // U+1F3AC
  },
  sports: {
    color: '#22c55e',
    label: 'Sports',
    icon: '🏆', // U+1F3C6
  },
  lifestyle_culture: {
    color: '#a855f7',
    label: 'Lifestyle & Culture',
    icon: '✨', // U+2728
  },
  food_travel: {
    color: '#f97316',
    label: 'Food & Travel',
    icon: '🍽️', // U+1F37D
  },
  fashion_beauty: {
    color: '#ec4899',
    label: 'Fashion & Beauty',
    icon: '👗', // U+1F457
  },
  arts_music: {
    color: '#6366f1',
    label: 'Arts & Music',
    icon: '🎵', // U+1F3B5
  },
  human_interest: {
    color: '#facc15',
    label: 'Human Interest',
    icon: '💛', // U+1F49B
  },

  // --- Specialty ---
  finance_markets: {
    color: '#22c55e',
    label: 'Finance & Markets',
    icon: '📈', // U+1F4C8
  },
  real_estate: {
    color: '#60a5fa',
    label: 'Real Estate',
    icon: '🏠', // U+1F3E0
  },
  automotive: {
    color: '#f97316',
    label: 'Automotive',
    icon: '🚗', // U+1F697
  },
  space_astronomy: {
    color: '#38bdf8',
    label: 'Space & Astronomy',
    icon: '🚀', // U+1F680
  },
  agriculture: {
    color: '#84cc16',
    label: 'Agriculture',
    icon: '🌾', // U+1F33E
  },
  religion_faith: {
    color: '#f5a623',
    label: 'Religion & Faith',
    icon: '✝️', // U+271D
  },
  labor_workforce: {
    color: '#fb923c',
    label: 'Labor & Workforce',
    icon: '👷', // U+1F477
  },
  immigration: {
    color: '#06b6d4',
    label: 'Immigration',
    icon: '🛂', // U+1F6C2
  },
  energy: {
    color: '#facc15',
    label: 'Energy',
    icon: '⚡', // U+26A1
  },

  // --- Local ---
  local_politics: {
    color: '#f97373',
    label: 'Local Politics',
    icon: '📍', // U+1F4CD
  },
  community_events: {
    color: '#22c55e',
    label: 'Community Events',
    icon: '🎪', // U+1F3AA
  },
  weather: {
    color: '#38bdf8',
    label: 'Weather',
    icon: '🌤️', // U+1F324
  },
  traffic_transportation: {
    color: '#f97316',
    label: 'Traffic & Transportation',
    icon: '🚦', // U+1F6A6
  },
  obituaries: {
    color: '#9ca3af',
    label: 'Obituaries',
    icon: '🕯️', // U+1F56F
  },

  // --- Opinion & Analysis ---
  editorials: {
    color: '#a3e635',
    label: 'Editorials',
    icon: '💬', // U+1F4AC
  },
  op_eds: {
    color: '#fb7185',
    label: 'Op-Eds',
    icon: '✍️', // U+270D
  },
  fact_checks: {
    color: '#22c55e',
    label: 'Fact Checks',
    icon: '✅', // U+2705
  },
  investigations: {
    color: '#e5e7eb',
    label: 'Investigations / Longform',
    icon: '🔍', // U+1F50D
  },
}

export const CATEGORY_KEYS = Object.keys(CATEGORIES)

export function getCategoryColor(category) {
  return CATEGORIES[category]?.color ?? '#FFFFFF'
}

// ── Legacy category → Dimension mapping ──
// Maps the 30+ news taxonomy to the 6 civilian dimensions.
// This supports news items during transition while GDELT becomes primary.
import { DIMENSION_COLORS } from '../core/eventSchema'
export { DIMENSION_COLORS }

const CATEGORY_TO_DIMENSION = {
  // → SAFETY
  war_conflict: 'safety',
  crime_justice: 'safety',

  // → GOVERNANCE
  politics_government: 'governance',
  local_politics: 'governance',

  // → ECONOMY
  business_economy: 'economy',
  finance_markets: 'economy',
  real_estate: 'economy',
  energy: 'economy',
  labor_workforce: 'economy',
  automotive: 'economy',
  agriculture: 'economy',

  // → PEOPLE
  health_medicine: 'people',
  education: 'people',
  human_interest: 'people',
  immigration: 'people',
  religion_faith: 'people',
  community_events: 'people',
  obituaries: 'people',

  // → ENVIRONMENT
  environment_climate: 'environment',
  weather: 'environment',
  space_astronomy: 'environment',

  // → NARRATIVE
  science_technology: 'narrative',
  world_international: 'narrative',
  entertainment_celebrity: 'narrative',
  sports: 'narrative',
  lifestyle_culture: 'narrative',
  food_travel: 'narrative',
  fashion_beauty: 'narrative',
  arts_music: 'narrative',
  editorials: 'narrative',
  op_eds: 'narrative',
  fact_checks: 'narrative',
  investigations: 'narrative',
  traffic_transportation: 'narrative',
}

/**
 * Map a legacy news category to a civilian dimension.
 * Falls back to 'narrative' for unknown categories.
 * @param {string} category — legacy category key
 * @returns {string} dimension key
 */
export function legacyCategoryToDimension(category) {
  return CATEGORY_TO_DIMENSION[category] || 'narrative'
}

