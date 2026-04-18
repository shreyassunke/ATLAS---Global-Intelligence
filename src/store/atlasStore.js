import { create } from 'zustand'
import { DEFAULT_SOURCES, NEWS_SOURCES } from '../utils/newsSources'
import { CATEGORY_KEYS } from '../utils/categoryColors'
import { loadQualitySettings, saveQualitySettings, loadGlobeMode, saveGlobeMode, QUALITY_TIERS } from '../config/qualityTiers'
import { initEventBus, startFetching, stopFetching, subscribeToBatchUpdates, subscribeToSourceStatus, destroyEventBus } from '../core/eventBus'
import { supabase } from '../services/supabase'
import { loadPersistedBgmTrackId, persistBgmTrackId, BGM_AMBIENT_TRACKS } from '../config/bgmTracks'
import {
  loadPersistedBgmProvider,
  persistBgmProvider,
  loadPersistedSpotifyContextUri,
  persistSpotifyContextUri,
  loadPersistedBgmYoutube,
  persistBgmYoutube,
} from '../config/bgmMusicState'
import { loadSpotifyAuthFromStorage, persistSpotifyAuth } from '../music/spotifyTokens'

const STORAGE_KEY_SOURCES = 'atlas_selected_sources'
const STORAGE_KEY_ONBOARDED = 'atlas_onboarded'
const STORAGE_KEY_BGM_VOL = 'atlas_bgm_volume'
const STORAGE_KEY_DATA_LAYERS = 'atlas_data_layers'
/** Legacy key — cleared on reopen so returning users see the landing page first again */
const STORAGE_KEY_LANDING = 'atlas_landing_ack_v1'

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

const DEFAULT_DATA_LAYERS = {
  gdelt: true,           // Geopolitical events from GDELT 2.0
  firms: true,           // NASA FIRMS active fires
  usgs: true,            // USGS earthquakes
  news: true,            // News articles from commercial APIs
  gdacs: true,           // GDACS disasters
  eonet: true,           // NASA EONET natural events
  gdeltHeatmap: true,    // GDELT GEO PointHeatmap density overlay
  gdeltChoropleth: false,// GDELT GEO per-country tone choropleth
}

function loadDataLayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA_LAYERS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const { labels: _legacyLabels, ...rest } = parsed
        return { ...DEFAULT_DATA_LAYERS, ...rest }
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_DATA_LAYERS }
}

function persistDataLayers(layers) {
  try {
    localStorage.setItem(STORAGE_KEY_DATA_LAYERS, JSON.stringify(layers))
  } catch { /* ignore */ }
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

const DEFAULT_DIMENSIONS = ['safety', 'governance', 'economy', 'people', 'environment', 'narrative']
function loadActiveDimensions() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('dim')) {
      return new Set(params.get('dim').split(',').filter(d => DEFAULT_DIMENSIONS.includes(d)))
    }
    const legacy = localStorage.getItem('atlas_active_dimensions')
    if (legacy) {
      localStorage.removeItem('atlas_active_dimensions')
      const legacyMap = {
        'conflict': 'safety', 'cyber': 'narrative', 'natural': 'environment',
        'humanitarian': 'people', 'economic': 'economy', 'signals': 'narrative', 'hazard': 'environment'
      }
      const parsed = JSON.parse(legacy)
      const migrated = Array.isArray(parsed) ? parsed.map(d => legacyMap[d] || d) : DEFAULT_DIMENSIONS
      localStorage.setItem('atlas_active_dimensions', JSON.stringify(migrated))
      return new Set(migrated)
    }
    const current = localStorage.getItem('atlas_active_dimensions')
    if (current) return new Set(JSON.parse(current))
  } catch { /* ignore */ }
  return new Set(DEFAULT_DIMENSIONS)
}

function loadFilters() {
  const params = new URLSearchParams(window.location.search)
  return {
    priority: params.get('pri') || localStorage.getItem('atlas_priority_filter') || 'p1',
    time: params.get('time') || localStorage.getItem('atlas_time_filter') || 'live'
  }
}

const filters = loadFilters()

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
  /** Marketing / explainer screen — not persisted; every fresh load starts here until dismissed */
  landingAcknowledged: false,
  sourceCatalog: [],
  streetViewLocation: null,
  isStreetViewOpen: false,
  /** { videoId, title, url, isLive } | null — when set, YouTube embed overlay is shown */
  youtubeEmbed: null,

  /** Background music: ambient loop track id (see `config/bgmTracks.js`) */
  bgmAmbientTrackId: loadPersistedBgmTrackId(),
  /** `atlas` | `spotify` | `youtube` | `apple_music` */
  bgmProvider: loadPersistedBgmProvider(),
  /** After intro.mp3 ends — external providers wait for this before starting */
  bgmIntroComplete: false,
  /** Spotify OAuth tokens (see `music/spotifyTokens.js`) */
  spotifyAuth: loadSpotifyAuthFromStorage(),
  /** e.g. spotify:playlist:abc — used with Web Playback SDK */
  spotifyPlayContextUri: loadPersistedSpotifyContextUri(),
  /** YouTube / YouTube Music background: video or playlist */
  bgmYoutube: loadPersistedBgmYoutube(),
  /** Last Spotify / YouTube error for the ambient menu */
  bgmExternalMessage: null,
  /** `{ x, y }` client coords — null when the track picker is closed */
  bgmTrackMenu: null,
  /** Background music output level 0–1 (intro + ambient), persisted */
  bgmVolume: loadPersistedBgmVolume(),
  manualRefreshUsedToday: false,
  triggerManualRefresh: null,
  launchTransitionActive: false,
  /** Skip the next globe intro fly-in (used after transition / dev) */
  skipCesiumIntro: false,
  // ── EventBus / Intel Events ──
  events: [],
  eventMap: {},
  priorityCounts: { p1: 0, p2: 0, p3: 0 },
  selectedEvent: null,
  /** `{ query, label?, dimension? }` — GDELT DOC analytics HUD; null when closed */
  gdeltAnalytics: null,
  sourceStatuses: {},
  eventBusReady: false,
  priorityFilter: filters.priority,
  timeFilter: filters.time,
  activeDimensions: loadActiveDimensions(),
  focusedEventId: null,
  anomalies: [],
  colorblindMode: localStorage.getItem('atlas_colorblind') === 'true',
  mobileMode: false,
  lowBandwidthMode: false,

  // ── Data Layers (globe visualization toggles) ──
  dataLayers: loadDataLayers(),

  // ── Auth / User ──
  user: null,
  /** 'auth' | 'sources' — tracks which sub-step of onboarding the user is on */
  onboardingStep: 'auth',

  // ── UI State ──
  settingsOpen: false,

  // ── Quality & Globe Renderer ──
  /** 'cesium' | 'globegl' | 'leaflet' */
  globeMode: loadGlobeMode(),
  /** 'auto' | 'high' | 'medium' | 'low' */
  qualityTier: savedQuality?.tier || savedQuality?.priority || 'auto',
  /** Resolved priority after auto-detection: 'high' | 'medium' | 'low' */
  resolvedTier: savedQuality?.resolved || 'high',
  /** Per-setting overrides (user toggled individual settings) */
  qualityOverrides: savedQuality?.overrides || {},

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

  acknowledgeLanding: () => set({ landingAcknowledged: true }),

  reopenLanding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_LANDING)
    } catch {
      /* ignore */
    }
    set({ landingAcknowledged: false })
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

  setBgmProvider: (provider) => {
    const allowed = ['atlas', 'spotify', 'youtube', 'apple_music']
    if (!allowed.includes(provider)) return
    persistBgmProvider(provider)
    set({ bgmProvider: provider, bgmExternalMessage: null })
  },

  setBgmIntroComplete: (v) => set({ bgmIntroComplete: !!v }),

  setSpotifyAuth: (auth) => {
    persistSpotifyAuth(auth)
    set({ spotifyAuth: auth })
  },

  setSpotifyPlayContextUri: (uri) => {
    persistSpotifyContextUri(uri)
    set({ spotifyPlayContextUri: uri || '', bgmExternalMessage: null })
  },

  setBgmYoutube: (spec) => {
    persistBgmYoutube(spec)
    set({ bgmYoutube: spec, bgmExternalMessage: null })
  },

  setBgmExternalMessage: (msg) => set({ bgmExternalMessage: msg || null }),

  disconnectSpotifySession: () => {
    persistSpotifyAuth(null)
    persistSpotifyContextUri('')
    set({
      spotifyAuth: null,
      spotifyPlayContextUri: '',
      bgmProvider: 'atlas',
      bgmExternalMessage: null,
    })
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

  setQualityTier: (priority) => {
    const state = get()
    const resolved = priority === 'auto' ? state.resolvedTier : priority
    saveQualitySettings({ priority, resolved, overrides: state.qualityOverrides })
    set({ qualityTier: priority, resolvedTier: resolved })
  },

  setResolvedPriority: (resolved) => {
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
    const priority = QUALITY_TIERS[state.resolvedTier] || QUALITY_TIERS.high
    return typeof priority[key] === 'function' ? priority[key]() : priority[key]
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

          const counts = { p3: 0, p2: 0, p1: 0 }
          for (const e of filtered) {
            const pri = e.priority || e.priority || 'p3'
            if (counts[pri] !== undefined) counts[pri]++
          }
          return { events: filtered, eventMap: nextMap, priorityCounts: counts }
        }

        const counts = { p3: 0, p2: 0, p1: 0 }
        for (const e of nextEvents) {
          const pri = e.priority || e.priority || 'p3'
          if (counts[pri] !== undefined) counts[pri]++
        }

        const anomalyUpdates = diff.anomalies?.length > 0
          ? { anomalies: [...s.anomalies, ...diff.anomalies].slice(-100) }
          : {}

        return { events: nextEvents, eventMap: nextMap, priorityCounts: counts, ...anomalyUpdates }
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
      priorityCounts: { p1: 0, p2: 0, p3: 0 },
      sourceStatuses: {},
    })
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  openGdeltAnalytics: (payload) => {
    if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) return
    set({
      gdeltAnalytics: {
        query: payload.query.trim(),
        label: payload.label || '',
        dimension: payload.dimension || 'narrative',
      },
    })
  },
  closeGdeltAnalytics: () => set({ gdeltAnalytics: null }),
  setPriorityFilter: (v) => {
    localStorage.setItem('atlas_priority_filter', v)
    set({ priorityFilter: v })
  },
  setTimeFilter: (v) => {
    localStorage.setItem('atlas_time_filter', v)
    set({ timeFilter: v })
  },
  setFocusedEventId: (id) => set({ focusedEventId: id }),
  clearFocus: () => set({ focusedEventId: null }),

  toggleDimension: (dimension) => set((s) => {
    const next = new Set(s.activeDimensions)
    if (next.has(dimension)) next.delete(dimension)
    else next.add(dimension)
    return { activeDimensions: next }
  }),

  toggleColorblindMode: () => set((s) => {
    const next = !s.colorblindMode
    localStorage.setItem('atlas_colorblind', String(next))
    document.body.setAttribute('data-colorblind', String(next))
    return { colorblindMode: next }
  }),

  setMobileMode: (v) => set({ mobileMode: v }),
  setLowBandwidthMode: (v) => set({ lowBandwidthMode: v }),

  // ── Data Layer Toggles ──
  toggleDataLayer: (layerId) => {
    const current = get().dataLayers
    const next = { ...current, [layerId]: !current[layerId] }
    persistDataLayers(next)
    set({ dataLayers: next })
  },
  setDataLayer: (layerId, enabled) => {
    const current = get().dataLayers
    const next = { ...current, [layerId]: enabled }
    persistDataLayers(next)
    set({ dataLayers: next })
  },

  // ── Auth Actions ──
  setUser: (user) => set({ user }),
  setOnboardingStep: (step) => set({ onboardingStep: step }),

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set({ user: null })
  },
}))
