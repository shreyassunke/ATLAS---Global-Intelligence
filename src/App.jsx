import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from './store/atlasStore'
import { useNewsData } from './hooks/useNewsData'
import Onboarding from './components/Onboarding/Onboarding'
import CesiumStarfieldBackground from './components/Onboarding/CesiumStarfieldBackground'
import BackgroundAudio from './components/Audio/BackgroundAudio'
import Header from './components/UI/Header'
import FilterPanel from './components/UI/FilterPanel'
import NewsCard from './components/UI/NewsCard'
import LiveTicker from './components/Feed/LiveTicker'
import HoverLabel from './components/UI/RegionRing'
import ClockOverlay from './components/UI/ClockOverlay'
import StreetViewOverlay from './components/UI/StreetViewOverlay'
import SettingsPanel from './components/UI/SettingsPanel'

// Lazy-load heavy 3D components — Cesium (~4MB) and globe.gl/Three.js (~1MB) don't
// need to be in the initial bundle since they're only rendered after onboarding.
const CesiumGlobe = lazy(() => import('./components/Globe/CesiumGlobe'))
const GlobeGLView = lazy(() => import('./components/Globe/GlobeGLView'))
const FlatMap = lazy(() => import('./components/Globe/FlatMap'))
const ParticleEarthTransition = lazy(() => import('./components/Transition/ParticleEarthTransition'))

const SUN_ANGLE_THROTTLE_MS = 50

export default function App() {
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)
  const launchTransitionActive = useAtlasStore((s) => s.launchTransitionActive)
  const [hudHidden, setHudHidden] = useState(false)
  const [sunAngle, setSunAngle] = useState(0)
  const [globeReady, setGlobeReady] = useState(false)
  const lastSunAngleRef = useRef(0)
  const globeMode = useAtlasStore((s) => s.globeMode)
  useNewsData()

  const onGlobeView = hasCompletedOnboarding && !launchTransitionActive
  const showStarfield =
    !hasCompletedOnboarding ||
    launchTransitionActive ||
    (onGlobeView && !globeReady)

  useEffect(() => {
    if (!onGlobeView) setGlobeReady(false)
  }, [onGlobeView])
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
        return
      }

      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setHudHidden((v) => !v)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <BackgroundAudio />
      <div className="scanline-overlay" />
      {/* Persistent starfield: same instance from setup through transition. Never unmounts until globe. */}
      {showStarfield && (
        <div className="fixed inset-0 z-0" aria-hidden>
          <CesiumStarfieldBackground onSunAngle={onSunAngle} />
        </div>
      )}
      <AnimatePresence mode="wait">
        {launchTransitionActive ? (
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
                  />
                  <ClockOverlay />
                  <FilterPanel />
                  <NewsCard />
                  <StreetViewOverlay />
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
