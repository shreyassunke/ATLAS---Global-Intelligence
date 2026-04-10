import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from './store/atlasStore'
import { useNewsData } from './hooks/useNewsData'
import Onboarding from './components/Onboarding/Onboarding'
import CesiumStarfieldBackground from './components/Onboarding/CesiumStarfieldBackground'
import BackgroundAudio from './components/Audio/BackgroundAudio'
import SpotifyOAuthCallback from './components/Audio/SpotifyOAuthCallback'
import SpotifyBgmController from './components/Audio/SpotifyBgmController'
import YouTubeBgmPlayer from './components/Audio/YouTubeBgmPlayer'
import Header from './components/UI/Header'
import FilterPanel from './components/UI/FilterPanel'
import NewsCard from './components/UI/NewsCard'
import EventPanel from './components/UI/EventPanel'
import LiveTicker from './components/Feed/LiveTicker'
import HoverLabel from './components/UI/RegionRing'
import StreetViewOverlay from './components/UI/StreetViewOverlay'
import YouTubeEmbedOverlay from './components/UI/YouTubeEmbedOverlay'
import SettingsPanel from './components/UI/SettingsPanel'
import DimensionFilters from './components/UI/DimensionFilters'
import { usePreferencesSync } from './hooks/usePreferencesSync'
import LandingPage from './components/Landing/LandingPage'

// Lazy-load heavy 3D components — Cesium (~4MB) and globe.gl/Three.js (~1MB) don't
// need to be in the initial bundle since they're only rendered after onboarding.
const CesiumGlobe = lazy(() => import('./components/Globe/CesiumGlobe'))
const GlobeGLView = lazy(() => import('./components/Globe/GlobeGLView'))
const FlatMap = lazy(() => import('./components/Globe/FlatMap'))
const ParticleEarthTransition = lazy(() => import('./components/Transition/ParticleEarthTransition'))

const SUN_ANGLE_THROTTLE_MS = 50

export default function App() {
  const [pathTick, setPathTick] = useState(0)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)
  const landingAcknowledged = useAtlasStore((s) => s.landingAcknowledged)
  const launchTransitionActive = useAtlasStore((s) => s.launchTransitionActive)
  const [hudHidden, setHudHidden] = useState(false)
  const [sunAngle, setSunAngle] = useState(0)
  const [globeReady, setGlobeReady] = useState(false)
  const lastSunAngleRef = useRef(0)
  const globeMode = useAtlasStore((s) => s.globeMode)
  const initEventBusSystem = useAtlasStore((s) => s.initEventBusSystem)
  const isCesium = globeMode === 'cesium'
  const filterParams = useAtlasStore((s) => s.filterParams)
  const colorblindMode = useAtlasStore((s) => s.colorblindMode)
  const [filtersOpen, setFiltersOpen] = useState(false)
  useNewsData()
  usePreferencesSync()

  useEffect(() => {
    document.body.setAttribute('data-colorblind', String(colorblindMode))
  }, [colorblindMode])

  useEffect(() => {
    const onHistory = () => setPathTick((t) => t + 1)
    window.addEventListener('atlas-history', onHistory)
    return () => window.removeEventListener('atlas-history', onHistory)
  }, [])

  useEffect(() => {
    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window
    useAtlasStore.getState().setMobileMode(isMobile)

    const resizeHandler = () => {
      useAtlasStore.getState().setMobileMode(window.innerWidth < 768)
    }
    window.addEventListener('resize', resizeHandler)

    if (navigator.connection) {
      const checkBandwidth = () => {
        const conn = navigator.connection
        const slow = conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || (conn.downlink && conn.downlink < 1.5)
        useAtlasStore.getState().setLowBandwidthMode(slow)
      }
      checkBandwidth()
      navigator.connection.addEventListener('change', checkBandwidth)
      return () => {
        window.removeEventListener('resize', resizeHandler)
        navigator.connection.removeEventListener('change', checkBandwidth)
      }
    }

    return () => window.removeEventListener('resize', resizeHandler)
  }, [])

  const pathname = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    return window.location.pathname.replace(/\/$/, '') || '/'
  }, [pathTick])

  const isSpotifyOAuthReturn = pathname.endsWith('/spotify-callback')

  const showLandingLayer = !landingAcknowledged && !isSpotifyOAuthReturn

  /** Intro + ambient BGM only on the main ATLAS tool (globe), not landing, setup, or transition */
  const bgmToolSurfaceActive =
    !showLandingLayer && !launchTransitionActive && hasCompletedOnboarding

  const onGlobeView = hasCompletedOnboarding && !launchTransitionActive
  const showStarfield =
    isSpotifyOAuthReturn ||
    showLandingLayer ||
    !hasCompletedOnboarding ||
    launchTransitionActive ||
    (onGlobeView && !globeReady)

  useEffect(() => {
    if (!onGlobeView) setGlobeReady(false)
  }, [onGlobeView])

  // Initialize EventBus when globe view is active
  useEffect(() => {
    if (onGlobeView) {
      initEventBusSystem()
    }
  }, [onGlobeView]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSunAngle = useCallback((angleRad) => {
    const now = Date.now()
    if (now - lastSunAngleRef.current >= SUN_ANGLE_THROTTLE_MS) {
      lastSunAngleRef.current = now
      setSunAngle(angleRad)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        setHudHidden(false)
        useAtlasStore.getState().setSelectedEvent(null)
        useAtlasStore.getState().setSelectedMarker(null)
        return
      }

      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setHudHidden((v) => !v)
      }

      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        const state = useAtlasStore.getState()
        const sorted = [...state.events]
          .sort((a, b) => b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp))
        if (sorted.length === 0) return

        e.preventDefault()
        const currentId = state.selectedEvent?.id
        const currentIdx = sorted.findIndex(ev => ev.id === currentId)
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? sorted.length - 1 : currentIdx - 1)
          : (currentIdx + 1) % sorted.length
        state.setSelectedEvent(sorted[nextIdx])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <SpotifyOAuthCallback />
      <BackgroundAudio toolSurfaceActive={bgmToolSurfaceActive} />
      <SpotifyBgmController toolSurfaceActive={bgmToolSurfaceActive} />
      <YouTubeBgmPlayer toolSurfaceActive={bgmToolSurfaceActive} />
      {/* Persistent starfield: same instance from setup through transition. Never unmounts until globe. */}
      {showStarfield && (
        <div className="fixed inset-0 z-0" aria-hidden>
          <CesiumStarfieldBackground onSunAngle={onSunAngle} />
        </div>
      )}
      <AnimatePresence mode="wait">
        {showLandingLayer ? (
          <LandingPage key="atlas-landing" />
        ) : launchTransitionActive ? (
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-10"
          >
            <Suspense fallback={null}>
              <ParticleEarthTransition />
            </Suspense>
          </motion.div>
        ) : !hasCompletedOnboarding ? (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50"
          >
            <Onboarding sunAngle={sunAngle} />
          </motion.div>
        ) : (
          <motion.div
            key="globe-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.2 }}
            className="fixed inset-0"
          >
            <Suspense fallback={null}>
              {globeMode === 'globegl' ? (
                <GlobeGLView onGlobeReady={() => setGlobeReady(true)} />
              ) : globeMode === 'leaflet' ? (
                <FlatMap onGlobeReady={() => setGlobeReady(true)} />
              ) : (
                <CesiumGlobe onGlobeReady={() => setGlobeReady(true)} />
              )}
            </Suspense>
            <AnimatePresence>
              {!hudHidden && (
                <motion.div
                  key="hud-layer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <Header
                    hudHidden={hudHidden}
                    onToggleHud={() => setHudHidden((v) => !v)}
                    onToggleFilters={() => setFiltersOpen((v) => !v)}
                    filtersOpen={filtersOpen}
                  />

                  <AnimatePresence>
                    {filtersOpen && (
                      <motion.div
                        className="hud-filters-sidebar"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <DimensionFilters />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <EventPanel />
                  <NewsCard />
                  <StreetViewOverlay />
                  <YouTubeEmbedOverlay />
                  <HoverLabel />
                  <LiveTicker />
                  <SettingsPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
