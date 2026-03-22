import { create } from 'zustand'
import { DEFAULT_SOURCES, NEWS_SOURCES } from '../utils/newsSources'
import { CATEGORY_KEYS } from '../utils/categoryColors'
import { loadQualitySettings, saveQualitySettings, loadGlobeMode, saveGlobeMode, QUALITY_TIERS } from '../config/qualityTiers'
import { initEventBus, startFetching, stopFetching, subscribeToBatchUpdates, subscribeToSourceStatus, destroyEventBus } from '../core/eventBus'
import { supabase } from '../services/supabase'
import { loadPersistedBgmTrackId, persistBgmTrackId, BGM_AMBIENT_TRACKS } from '../config/bgmTracks'

const STORAGE_KEY_SOURCES = 'atlas_selected_sources'
const STORAGE_KEY_ONBOARDED = 'atlas_onboarded'
const STORAGE_KEY_BGM_VOL = 'atlas_bgm_volume'

function loadPersistedBgmVolume() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BGM_VOL)
    if (raw != null) {
      const n = parseFloat(raw)
      if (!Number.isNaN(n)) return Math.max(0, Math.min(1, n))
    }
  } catch {
    /* ignore */
  }
  return 0.65
}

function persistBgmVolume(v) {
  try {
    localStorage.setItem(STORAGE_KEY_BGM_VOL, String(v))
  } catch {
    /* ignore */
  }
}

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
  /** { videoId, title, url, isLive } | null — when set, YouTube embed overlay is shown */
  youtubeEmbed: null,

  /** Background music: ambient loop track id (see `config/bgmTracks.js`) */
  bgmAmbientTrackId: loadPersistedBgmTrackId(),
  /** `{ x, y }` client coords — null when the track picker is closed */
  bgmTrackMenu: null,
  /** Background music output level 0–1 (intro + ambient), persisted */
  bgmVolume: loadPersistedBgmVolume(),
  manualRefreshUsedToday: false,
  triggerManualRefresh: null,
  launchTransitionActive: false,
  skipCesiumIntro: false,

  // ── EventBus / Intel Events ──
  events: [],
  eventMap: {},
  tierCounts: { latent: 0, active: 0, critical: 0 },
  selectedEvent: null,
  sourceStatuses: {},
  eventBusReady: false,
  severityFloor: 1,
  activeDomains: new Set(['conflict', 'cyber', 'natural', 'humanitarian', 'economic', 'signals', 'hazard']),
  focusedEventId: null,
  anomalies: [],
  colorblindMode: localStorage.getItem('atlas_colorblind') === 'true',
  mobileMode: false,
  lowBandwidthMode: false,

  // ── Auth / User ──
  user: null,
  /** 'auth' | 'sources' — tracks which sub-step of onboarding the user is on */
  onboardingStep: 'auth',

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
      youtubeEmbed: null,
    })),
  closeStreetView: () => set(() => ({ isStreetViewOpen: false })),

  openYouTubeEmbed: ({ videoId, title = '', url = '', isLive = false }) =>
    set(() => ({
      youtubeEmbed: { videoId, title, url, isLive },
      isStreetViewOpen: false,
    })),
  closeYouTubeEmbed: () => set({ youtubeEmbed: null }),

  setBgmAmbientTrackId: (id) => {
    if (!BGM_AMBIENT_TRACKS.some((t) => t.id === id)) return
    persistBgmTrackId(id)
    set({ bgmAmbientTrackId: id })
  },

  openBgmTrackMenu: (x, y) => set({ bgmTrackMenu: { x, y } }),
  closeBgmTrackMenu: () => set({ bgmTrackMenu: null }),

  setBgmVolume: (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v)
    if (Number.isNaN(n)) return
    const clamped = Math.max(0, Math.min(1, n))
    persistBgmVolume(clamped)
    set({ bgmVolume: clamped })
  },

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

  getEffectiveSetting: (key) => {
    const state = get()
    if (key in state.qualityOverrides) return state.qualityOverrides[key]
    const tier = QUALITY_TIERS[state.resolvedTier] || QUALITY_TIERS.high
    return typeof tier[key] === 'function' ? tier[key]() : tier[key]
  },

  // ── EventBus Actions ──
  _eventBusUnsub: null,
  _sourceStatusUnsub: null,

  initEventBusSystem: () => {
    const state = get()
    if (state.eventBusReady) return

    initEventBus()

    const unsub = subscribeToBatchUpdates((diff) => {
      set((s) => {
        if (diff.snapshot) {
          const map = {}
          for (const e of diff.snapshot) map[e.id] = e
          return { events: diff.snapshot, eventMap: map }
        }

        const nextEvents = [...s.events]
        const nextMap = { ...s.eventMap }

        if (diff.added) {
          for (const e of diff.added) {
            if (!nextMap[e.id]) {
              nextEvents.push(e)
              nextMap[e.id] = e
            }
          }
        }

        if (diff.updated) {
          for (const e of diff.updated) {
            nextMap[e.id] = e
            const idx = nextEvents.findIndex(x => x.id === e.id)
            if (idx !== -1) nextEvents[idx] = e
          }
        }

        if (diff.removed) {
          for (const id of diff.removed) {
            delete nextMap[id]
          }
          const removeSet = new Set(diff.removed)
          const filtered = nextEvents.filter(e => !removeSet.has(e.id))

          const counts = { latent: 0, active: 0, critical: 0 }
          for (const e of filtered) {
            if (counts[e.tier] !== undefined) counts[e.tier]++
          }
          return { events: filtered, eventMap: nextMap, tierCounts: counts }
        }

        const counts = { latent: 0, active: 0, critical: 0 }
        for (const e of nextEvents) {
          if (counts[e.tier] !== undefined) counts[e.tier]++
        }

        const anomalyUpdates = diff.anomalies?.length > 0
          ? { anomalies: [...s.anomalies, ...diff.anomalies].slice(-100) }
          : {}

        return { events: nextEvents, eventMap: nextMap, tierCounts: counts, ...anomalyUpdates }
      })
    })

    const sourceUnsub = subscribeToSourceStatus((statuses) => {
      set({ sourceStatuses: statuses })
    })

    set({ eventBusReady: true, _eventBusUnsub: unsub, _sourceStatusUnsub: sourceUnsub })

    startFetching()
  },

  destroyEventBusSystem: () => {
    const state = get()
    if (state._eventBusUnsub) state._eventBusUnsub()
    if (state._sourceStatusUnsub) state._sourceStatusUnsub()
    stopFetching()
    destroyEventBus()
    set({
      eventBusReady: false,
      events: [],
      eventMap: {},
      tierCounts: { latent: 0, active: 0, critical: 0 },
      sourceStatuses: {},
    })
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setSeverityFloor: (v) => {
    localStorage.setItem('atlas_severity_floor', String(v))
    set({ severityFloor: v })
  },
  setFocusedEventId: (id) => set({ focusedEventId: id }),
  clearFocus: () => set({ focusedEventId: null }),

  toggleDomain: (domain) => set((s) => {
    const next = new Set(s.activeDomains)
    if (next.has(domain)) next.delete(domain)
    else next.add(domain)
    return { activeDomains: next }
  }),

  toggleColorblindMode: () => set((s) => {
    const next = !s.colorblindMode
    localStorage.setItem('atlas_colorblind', String(next))
    document.body.setAttribute('data-colorblind', String(next))
    return { colorblindMode: next }
  }),

  setMobileMode: (v) => set({ mobileMode: v }),
  setLowBandwidthMode: (v) => set({ lowBandwidthMode: v }),

  // ── Auth Actions ──
  setUser: (user) => set({ user }),
  setOnboardingStep: (step) => set({ onboardingStep: step }),

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set({ user: null })
  },
}))
