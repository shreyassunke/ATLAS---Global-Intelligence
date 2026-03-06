import { create } from 'zustand'
import { DEFAULT_SOURCES, NEWS_SOURCES } from '../utils/newsSources'
import { CATEGORY_KEYS } from '../utils/categoryColors'
import { loadQualitySettings, saveQualitySettings, loadGlobeMode, saveGlobeMode, QUALITY_TIERS } from '../config/qualityTiers'

const STORAGE_KEY_SOURCES = 'atlas_selected_sources'
const STORAGE_KEY_ONBOARDED = 'atlas_onboarded'

function migrateSources(raw) {
  if (!Array.isArray(raw)) return DEFAULT_SOURCES
  if (raw.length === 0) return DEFAULT_SOURCES

  if (typeof raw[0] === 'string') {
    const lookup = Object.fromEntries(NEWS_SOURCES.map((s) => [s.id, s.name]))
    return raw.map((id) => ({
      id,
      name: lookup[id] || id,
      type: 'source',
    }))
  }

  if (raw[0] && typeof raw[0] === 'object' && raw[0].id) return raw

  return DEFAULT_SOURCES
}

function loadSources() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SOURCES)
    if (!stored) return DEFAULT_SOURCES
    return migrateSources(JSON.parse(stored))
  } catch {
    return DEFAULT_SOURCES
  }
}

function loadOnboarded() {
  return localStorage.getItem(STORAGE_KEY_ONBOARDED) === 'true'
}

// Load persisted quality state
const savedQuality = loadQualitySettings()

export const useAtlasStore = create((set, get) => ({
  newsItems: [],
  activeCategories: new Set(CATEGORY_KEYS),
  selectedMarker: null,
  hoveredMarker: null,
  activeRegion: 'global',
  isLoading: false,
  lastUpdated: null,
  zoomLevel: 1,
  selectedSources: loadSources(),
  hasCompletedOnboarding: loadOnboarded(),
  sourceCatalog: [],
  streetViewLocation: null,
  isStreetViewOpen: false,
  manualRefreshUsedToday: false,
  triggerManualRefresh: null,
  launchTransitionActive: false,
  skipCesiumIntro: false,

  // ── Quality & Globe Renderer ──
  /** 'cesium' | 'globegl' | 'leaflet' */
  globeMode: loadGlobeMode(),
  /** 'auto' | 'high' | 'medium' | 'low' */
  qualityTier: savedQuality?.tier || 'auto',
  /** Resolved tier after auto-detection: 'high' | 'medium' | 'low' */
  resolvedTier: savedQuality?.resolved || 'high',
  /** Per-setting overrides (user toggled individual settings) */
  qualityOverrides: savedQuality?.overrides || {},
  /** Whether settings panel is open */
  settingsOpen: false,

  setNewsItems: (items) => set({ newsItems: items, lastUpdated: new Date(), isLoading: false }),
  setManualRefreshUsedToday: (used) => set({ manualRefreshUsedToday: used }),
  setTriggerManualRefresh: (fn) => set({ triggerManualRefresh: fn }),

  toggleCategory: (cat) => set((state) => {
    const next = new Set(state.activeCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    return { activeCategories: next }
  }),

  setAllCategories: (cats) => set({ activeCategories: new Set(cats) }),

  setSelectedMarker: (marker) => set({ selectedMarker: marker }),
  setHoveredMarker: (marker) => set({ hoveredMarker: marker }),
  setActiveRegion: (region) => set({ activeRegion: region }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  setSourceCatalog: (catalog) => set({ sourceCatalog: catalog }),

  setSelectedSources: (sources) => {
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(sources))
    set({ selectedSources: sources })
  },

  addSource: (source) => {
    const current = get().selectedSources
    if (current.some((s) => s.id === source.id)) return
    const next = [...current, source]
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(next))
    set({ selectedSources: next })
  },

  removeSource: (sourceId) => {
    const next = get().selectedSources.filter((s) => s.id !== sourceId)
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(next))
    set({ selectedSources: next })
  },

  completeOnboarding: () => {
    localStorage.setItem(STORAGE_KEY_ONBOARDED, 'true')
    set({ hasCompletedOnboarding: true })
  },

  startLaunchTransition: () => set({ launchTransitionActive: true }),
  endLaunchTransition: () => set({ launchTransitionActive: false }),
  setSkipCesiumIntro: (v) => set({ skipCesiumIntro: v }),

  reopenOnboarding: () => {
    set({ hasCompletedOnboarding: false })
    localStorage.removeItem(STORAGE_KEY_ONBOARDED)
  },

  onResetView: null,
  setOnResetView: (fn) => set({ onResetView: fn }),
  resetView: () => {
    const fn = get().onResetView
    if (fn) fn()
  },
  openStreetView: ({ lat, lng, source = 'globe', meta = null }) =>
    set(() => ({
      streetViewLocation: { lat, lng, source, meta },
      isStreetViewOpen: true,
    })),
  closeStreetView: () => set(() => ({ isStreetViewOpen: false })),

  // ── Quality & Globe Mode Setters ──
  setGlobeMode: (mode) => {
    saveGlobeMode(mode)
    set({ globeMode: mode })
  },

  setQualityTier: (tier) => {
    const state = get()
    const resolved = tier === 'auto' ? state.resolvedTier : tier
    saveQualitySettings({ tier, resolved, overrides: state.qualityOverrides })
    set({ qualityTier: tier, resolvedTier: resolved })
  },

  setResolvedTier: (resolved) => {
    const state = get()
    saveQualitySettings({ tier: state.qualityTier, resolved, overrides: state.qualityOverrides })
    set({ resolvedTier: resolved })
  },

  setQualityOverride: (key, value) => {
    const state = get()
    const overrides = { ...state.qualityOverrides, [key]: value }
    saveQualitySettings({ tier: state.qualityTier, resolved: state.resolvedTier, overrides })
    set({ qualityOverrides: overrides })
  },

  clearQualityOverrides: () => {
    const state = get()
    saveQualitySettings({ tier: state.qualityTier, resolved: state.resolvedTier, overrides: {} })
    set({ qualityOverrides: {} })
  },

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  /**
   * Get the effective value for a quality setting, accounting for user overrides.
   */
  getEffectiveSetting: (key) => {
    const state = get()
    if (key in state.qualityOverrides) return state.qualityOverrides[key]
    const tier = QUALITY_TIERS[state.resolvedTier] || QUALITY_TIERS.high
    return typeof tier[key] === 'function' ? tier[key]() : tier[key]
  },
}))
