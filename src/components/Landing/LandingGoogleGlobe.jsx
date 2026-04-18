/**
 * Landing hero — Google Map3D (photorealistic / Earth-like) with the same feature markers
 * as the former globe.gl demo. No news feed, events, or Street View; map clicks clear cards only.
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  APIProvider,
  AltitudeMode,
  CollisionBehavior,
  Map3D,
  MapMode,
  Marker3D,
} from '@vis.gl/react-google-maps'
import { getCategoryColor } from '../../utils/categoryColors'
import { LANDING_GLOBE_MARKERS } from './landingGlobeMarkers'

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

/**
 * Same geographic POV as `LandingGlobeDemo` globe.gl:
 * `.pointOfView({ lat: 24, lng: 12, altitude: 2.35 })` — keep in sync when adjusting either hero.
 */
const LANDING_VIEW_CENTER = { lat: 24, lng: 12, altitude: 0 }

/** Tuned with `.landing-google-globe--elevated` so Map3D fills the fold like globe.gl altitude 2.35 */
const RANGE_INTRO_FROM_M = 34_000_000
const RANGE_INTRO_TO_M = 18_200_000
const LANDING_TILT = 46
const INTRO_MS = 2600
const IDLE_RESUME_MS = 6500
const MARKER_ALT_M = 1400
const MARKER_PX = 22

const _dotUrlCache = new Map()

function categoryDotDataUrl(category) {
  const css = getCategoryColor(category)
  if (_dotUrlCache.has(css)) return _dotUrlCache.get(css)
  const s = 48
  const h = s / 2
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.arc(h, h, h - 6, 0, Math.PI * 2)
  ctx.fillStyle = css
  ctx.globalAlpha = 0.88
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  const url = c.toDataURL('image/png')
  _dotUrlCache.set(css, url)
  return url
}

class LandingGlobeErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="landing-globe-demo landing-globe-demo--immersive landing-google-globe--elevated flex items-center justify-center"
          role="alert"
        >
          <div className="landing-globe-demo--immersive__host flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/75">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Preview unavailable</p>
            <p>The 3D map could not load. Check the console and your Google Maps key (Maps JavaScript API + Map Tiles API / 3D).</p>
            <pre className="max-w-md overflow-auto rounded border border-white/10 bg-black/40 p-2 text-left text-[10px] text-red-200/90">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function InnerLandingMap() {
  const viewCenter = useMemo(() => LANDING_VIEW_CENTER, [])

  const map3dRef = useRef(null)
  const cameraRef = useRef({
    center: viewCenter,
    range: RANGE_INTRO_TO_M,
    heading: 0,
    tilt: LANDING_TILT,
    roll: 0,
  })
  const [selected, setSelected] = useState(null)
  const readyRef = useRef(false)
  const introStartedRef = useRef(false)
  const idleTimerRef = useRef(null)
  const idleSpinGateRef = useRef(true)
  const spinRafRef = useRef(null)
  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const clearSelection = useCallback(() => setSelected(null), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const resetIdleSpin = useCallback(() => {
    if (reduceMotion) return
    idleSpinGateRef.current = false
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      idleSpinGateRef.current = true
    }, IDLE_RESUME_MS)
  }, [reduceMotion])

  const handleCameraChanged = useCallback(
    (ev) => {
      const d = ev.detail
      if (d.center) cameraRef.current.center = d.center
      if (typeof d.range === 'number') cameraRef.current.range = d.range
      if (typeof d.heading === 'number') cameraRef.current.heading = d.heading
      if (typeof d.tilt === 'number') cameraRef.current.tilt = d.tilt
      resetIdleSpin()
    },
    [resetIdleSpin],
  )

  const flyToMarker = useCallback((lat, lng) => {
    const map = map3dRef.current
    if (!map?.flyCameraTo) return
    const cam = cameraRef.current
    const nextRange = Math.max(180_000, Math.min(4_500_000, (cam.range ?? RANGE_INTRO_TO_M) * 0.42))
    map.flyCameraTo({
      endCamera: {
        center: { lat, lng, altitude: 0 },
        range: nextRange,
        heading: cam.heading ?? 0,
        tilt: Math.min(62, Math.max(28, cam.tilt ?? LANDING_TILT)),
        roll: 0,
      },
      durationMillis: 1300,
    })
  }, [])

  const handleMapClick = useCallback(() => {
    setSelected(null)
  }, [])

  const onMarkerClick = useCallback(
    (e, m) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      setSelected(m)
      flyToMarker(m.lat, m.lng)
      resetIdleSpin()
    },
    [flyToMarker, resetIdleSpin],
  )

  const runIntro = useCallback(() => {
    if (introStartedRef.current || reduceMotion) return
    const map = map3dRef.current
    if (!map?.flyCameraTo) return
    introStartedRef.current = true
    const center = viewCenter
    map.flyCameraTo({
      endCamera: {
        center,
        range: RANGE_INTRO_FROM_M,
        heading: 0,
        tilt: LANDING_TILT,
        roll: 0,
      },
      durationMillis: 0,
    })
    requestAnimationFrame(() => {
      map3dRef.current?.flyCameraTo?.({
        endCamera: {
          center,
          range: RANGE_INTRO_TO_M,
          heading: 0,
          tilt: LANDING_TILT,
          roll: 0,
        },
        durationMillis: INTRO_MS,
      })
    })
  }, [reduceMotion, viewCenter])

  const finalizeReady = useCallback(() => {
    if (readyRef.current) return
    readyRef.current = true
    if (map3dRef.current?.flyCameraTo) runIntro()
  }, [runIntro])

  const onFirstSteady = useCallback(
    (ev) => {
      if (!ev.detail?.isSteady) return
      finalizeReady()
    },
    [finalizeReady],
  )

  useEffect(() => {
    const t = setTimeout(() => finalizeReady(), 5000)
    return () => clearTimeout(t)
  }, [finalizeReady])

  useEffect(() => {
    if (reduceMotion) return
    const spin = () => {
      if (idleSpinGateRef.current && map3dRef.current?.map3d) {
        const el = map3dRef.current.map3d
        const h = Number(el.heading) || 0
        el.heading = (h + 0.06) % 360
      }
      spinRafRef.current = requestAnimationFrame(spin)
    }
    spinRafRef.current = requestAnimationFrame(spin)
    return () => {
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current)
      clearTimeout(idleTimerRef.current)
    }
  }, [reduceMotion])

  return (
    <div
      className="absolute inset-0 z-0"
      style={{ cursor: 'grab' }}
      onPointerDown={resetIdleSpin}
      onWheel={resetIdleSpin}
    >
      <Map3D
        ref={map3dRef}
        mode={MapMode.HYBRID}
        defaultUIHidden
        // Suppress Google's baked-in POI dots / labels on the 3D tile layer
        // so only Atlas's own landing markers are visible.
        defaultLabelsDisabled
        defaultCenter={viewCenter}
        defaultRange={reduceMotion ? RANGE_INTRO_TO_M : RANGE_INTRO_FROM_M}
        defaultTilt={LANDING_TILT}
        defaultHeading={0}
        minAltitude={80}
        maxAltitude={42_000_000}
        gestureHandling="GREEDY"
        onCameraChanged={handleCameraChanged}
        onClick={handleMapClick}
        onSteadyChange={onFirstSteady}
      >
        {LANDING_GLOBE_MARKERS.map((m) => (
          <Marker3D
            key={m.id}
            position={{ lat: m.lat, lng: m.lng, altitude: MARKER_ALT_M }}
            altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
            drawsWhenOccluded
            sizePreserved
            collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
            title={m.title}
            onClick={(e) => onMarkerClick(e, m)}
          >
            <img
              src={categoryDotDataUrl(m.category)}
              width={MARKER_PX}
              height={MARKER_PX}
              alt=""
              draggable={false}
              className="atlas-globe-dot-pulse"
              style={{ opacity: 0.95 }}
            />
          </Marker3D>
        ))}
      </Map3D>

      {selected ? (
        <div className="landing-globe-demo__card-wrap landing-globe-demo__card-wrap--immersive pointer-events-auto">
          <article
            className="landing-globe-demo__card font-[family-name:var(--font-ui)]"
            style={{ borderColor: `${getCategoryColor(selected.category)}55` }}
          >
            <button type="button" className="landing-globe-demo__card-close" onClick={clearSelection} aria-label="Close">
              ×
            </button>
            <p
              className="landing-globe-demo__card-kicker font-[family-name:var(--font-data)]"
              style={{ color: getCategoryColor(selected.category) }}
            >
              {selected.kind === 'use_case' ? 'Use case' : 'Feature'}
            </p>
            <h3 className="landing-globe-demo__card-title">{selected.title}</h3>
            <p className="landing-globe-demo__card-body">{selected.body}</p>
            {selected.kind === 'use_case' && selected.stat ? (
              <p className="landing-globe-demo__card-stat font-[family-name:var(--font-data)]">{selected.stat}</p>
            ) : null}
          </article>
        </div>
      ) : null}
    </div>
  )
}

export default function LandingGoogleGlobe() {
  if (!GOOGLE_API_KEY) {
    return (
      <div
        className="landing-globe-demo landing-globe-demo--immersive landing-google-globe--elevated"
        aria-label="ATLAS marketing globe preview"
      >
        <div className="landing-globe-demo--immersive__host flex items-center justify-center px-6 text-center text-sm text-white/65">
          Add <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">VITE_GOOGLE_MAPS_API_KEY</code> to enable
          the photorealistic 3D globe on this page (Maps JavaScript API + 3D / Map Tiles).
        </div>
      </div>
    )
  }

  return (
    <div
      className="landing-globe-demo landing-globe-demo--immersive landing-google-globe--elevated"
      aria-label="Interactive photorealistic 3D globe: drag to orbit, click markers for features and use cases"
    >
      <div className="landing-globe-demo--immersive__host relative min-h-0">
        <div className="absolute inset-0 min-h-[100dvh] min-w-0">
          <APIProvider
            apiKey={GOOGLE_API_KEY}
            version="weekly"
            libraries={['maps3d']}
            language="en-US"
            region="US"
          >
            <LandingGlobeErrorBoundary>
              <InnerLandingMap />
            </LandingGlobeErrorBoundary>
          </APIProvider>
        </div>
      </div>
    </div>
  )
}
