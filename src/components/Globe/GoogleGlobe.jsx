import React, {
  Component,
  createElement,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import {
  APIProvider,
  AltitudeMode,
  CollisionBehavior,
  Map3D,
  MapMode,
  Marker3D,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'

import { useAtlasStore } from '../../store/atlasStore'
import { requestSnapshot } from '../../core/eventBus'
import { getTimezoneViewCenter } from '../../utils/geo'
import { detectQualityTier } from '../../config/qualityTiers'
import { DIMENSION_COLORS } from '../../core/eventSchema'
import { generateSprite, getAnimationState, getSeveritySize } from '../../core/visualGrammar'
import {
  NUCLEAR_FACILITIES,
  SUBMARINE_CABLE_PATHS,
  clusterEvents,
  eventSourceToGlobeDataLayerKey,
} from '../../core/globeLayers'
import { buildGdeltDocQuery } from '../../services/gdelt/analyticsService'
import useGdeltGeoOverlay from '../../hooks/useGdeltGeoOverlay'
import { toneToChoroplethRgba } from '../../services/gdelt/geoService'

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const RANGE_MIN_M = 120
const RANGE_MAX_M = 35_000_000
/** Min interval between zoom writes to the global store while the camera moves (keeps UI off the critical path). */
const ZOOM_STORE_MIN_INTERVAL_MS = 100
const INTRO_FROM_RANGE_M = 50_000_000
/** End of intro / default orbit: far enough for a full-disk view at nadir tilt. */
const STARTUP_ORBIT_RANGE_M = 24_000_000
const INTRO_DURATION_MS = 3000
/** 0 = top-down (nadir), matching the in-app “globe disk” overview reference. */
const STARTUP_ORBIT_TILT = 0

/**
 * Max event age (ms) to plot on the globe for each HUD `timeFilter` tier.
 * Without this, events linger until their TTL expires (up to 24h for some
 * sources) and the globe ends up littered with stale single-dot markers.
 * `live` intentionally matches the "pulsing" recency window (2h) so the
 * globe reflects what the user reads as *live*, not a rolling 24h window.
 */
const TIME_FILTER_MAX_AGE_MS = {
  live: 2 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

/**
 * Hard cap on the number of individual `<Marker3D>` elements we mount at
 * once. With the GDELT firehose unleashed we can have 5-10k geocoded events
 * in-memory; Map3D handles overlap via `OPTIONAL_AND_HIDES_LOWER_PRIORITY`
 * but still pays a per-marker DOM cost. 2.5k is a good balance on the
 * modern browsers we target: dense enough to feel "populated" everywhere
 * there's news, cheap enough to keep the 60fps camera path responsive.
 * When the pool exceeds the cap we keep the highest-severity, most-recent
 * events (see `rankForGlobeRender`).
 */
const MAX_GLOBE_MARKERS = 2500

/**
 * O(n²) convex-hull clustering is fine up to ~2k events; beyond that we
 * down-sample the list we feed the clusterer so the main thread doesn't
 * stutter while the camera moves.
 */
const MAX_CLUSTER_INPUTS = 2000

function convexHull(points) {
  if (points.length < 3) return points
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function readMap3dCenterLiteral(center) {
  if (!center) return null
  const lat = typeof center.lat === 'function' ? center.lat() : center.lat
  const lng = typeof center.lng === 'function' ? center.lng() : center.lng
  const altitude =
    typeof center.altitude === 'function' ? center.altitude() : center.altitude ?? 0
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, altitude: Number.isFinite(altitude) ? altitude : 0 }
}

function wrapLng180(lng) {
  let x = lng
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

/**
 * Google Earth–style shortcuts on Map3DElement: arrows pan, +/- zoom,
 * Shift+arrows rotate heading / tilt. Returns true if the key was handled.
 */
function applyMap3dKeyboardShortcuts(ev, mapEl, rangeMinM, rangeMaxM) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false

  const { key, code } = ev
  const isArrow =
    key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
  const zoomIn =
    key === '+' || key === '=' || code === 'NumpadAdd' || code === 'Equal'
  const zoomOut =
    key === '-' || key === '_' || code === 'NumpadSubtract' || code === 'Minus'

  if (!isArrow && !zoomIn && !zoomOut) return false

  const c0 = readMap3dCenterLiteral(mapEl.center)
  if (!c0) return false

  let range = Number(mapEl.range)
  if (!Number.isFinite(range) || range <= 0) return false
  range = Math.max(rangeMinM, Math.min(rangeMaxM, range))

  if (zoomIn || zoomOut) {
    const factor = zoomIn ? 0.88 : 1 / 0.88
    mapEl.range = Math.max(rangeMinM, Math.min(rangeMaxM, range * factor))
    return true
  }

  const { lat, lng, altitude } = c0
  const baseDeg = Math.max(0.04, Math.min(3.2, (range / 9e6) * 0.35))
  const cosLat = Math.max(0.2, Math.abs(Math.cos((lat * Math.PI) / 180)))
  const dLng = baseDeg / cosLat

  if (ev.shiftKey) {
    const rotStep = Math.max(2.5, Math.min(12, (range / 12e6) * 8 + 2))
    const tiltStep = Math.max(2, Math.min(10, (range / 15e6) * 6 + 2))
    let heading = Number(mapEl.heading)
    if (!Number.isFinite(heading)) heading = 0
    let tilt = Number(mapEl.tilt)
    if (!Number.isFinite(tilt)) tilt = 0

    if (key === 'ArrowLeft') mapEl.heading = (heading - rotStep + 360) % 360
    else if (key === 'ArrowRight') mapEl.heading = (heading + rotStep) % 360
    else if (key === 'ArrowUp') mapEl.tilt = Math.min(90, tilt + tiltStep)
    else if (key === 'ArrowDown') mapEl.tilt = Math.max(0, tilt - tiltStep)
    else return false
    return true
  }

  let nlat = lat
  let nlng = lng
  if (key === 'ArrowLeft') nlng = wrapLng180(lng - dLng)
  else if (key === 'ArrowRight') nlng = wrapLng180(lng + dLng)
  else if (key === 'ArrowUp') nlat = Math.min(85, lat + baseDeg)
  else if (key === 'ArrowDown') nlat = Math.max(-85, lat - baseDeg)
  else return false

  mapEl.center = { lat: nlat, lng: nlng, altitude }
  return true
}

const _heatSpriteCache = new Map()
function heatSpriteDataUrl(alphaBin) {
  const key = `h_${alphaBin}`
  if (_heatSpriteCache.has(key)) return _heatSpriteCache.get(key)
  const s = 96
  const h = s / 2
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(h, h, 0, h, h, h)
  const peak = Math.max(0.18, Math.min(0.9, alphaBin))
  g.addColorStop(0, `rgba(255, 60, 60, ${peak})`)
  g.addColorStop(0.35, `rgba(255, 180, 50, ${peak * 0.55})`)
  g.addColorStop(0.7, `rgba(255, 240, 120, ${peak * 0.22})`)
  g.addColorStop(1, 'rgba(255, 240, 120, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const url = c.toDataURL('image/png')
  _heatSpriteCache.set(key, url)
  return url
}

/** Bin heatmap points into ~1.5° cells so the 3D globe renders ≤400 markers. */
function bucketHeatPoints(points, cellDeg = 1.5) {
  if (!Array.isArray(points) || points.length === 0) return []
  const bins = new Map()
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    const ix = Math.round(p.lat / cellDeg)
    const iy = Math.round(p.lng / cellDeg)
    const k = `${ix}|${iy}`
    const prev = bins.get(k)
    if (prev) {
      prev.w += p.weight || 1
      prev.n += 1
    } else {
      bins.set(k, { lat: ix * cellDeg, lng: iy * cellDeg, w: p.weight || 1, n: 1 })
    }
  }
  const out = [...bins.values()]
  let max = 0
  for (const b of out) if (b.w > max) max = b.w
  for (const b of out) b.norm = max > 0 ? b.w / max : 0
  out.sort((a, b) => b.w - a.w)
  return out.slice(0, 400)
}

/** Flatten GeoJSON Polygon / MultiPolygon geometry to an array of outer rings for Map3D. */
function geoJsonToOuterRings(geometry) {
  if (!geometry) return []
  const rings = []
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    if (geometry.coordinates[0]) rings.push(geometry.coordinates[0])
  } else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    for (const poly of geometry.coordinates) {
      if (poly && poly[0]) rings.push(poly[0])
    }
  }
  return rings
    .map((ring) =>
      ring
        .filter((pair) => Array.isArray(pair) && pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
        .map(([lng, lat]) => ({ lat, lng, altitude: 0 })),
    )
    .filter((ring) => ring.length >= 3)
}

/**
 * ATLAS place-mark head: a minimal HUD reticle — outer white ring,
 * inner faint ring, cyan accent dot. The sprite is perfectly symmetric
 * around the canvas center so `Marker3D` anchors it cleanly to its
 * 3D position. In-world it sits 140 m above the lat/lng with a cyan
 * stem linking it to the ground, so as the camera tilts/zooms/orbits
 * the whole assembly moves together and the user's eye always tracks
 * the stem's ground contact — no parallax swim like a sprite-only pin.
 */
let _searchMarkSprite = null
function searchMarkIconDataUrl() {
  if (_searchMarkSprite) return _searchMarkSprite
  const size = 64
  const dpr = 2
  const c = document.createElement('canvas')
  c.width = size * dpr
  c.height = size * dpr
  const ctx = c.getContext('2d')
  ctx.scale(dpr, dpr)

  const cx = size / 2
  const cy = size / 2

  // Outer cyan halo — soft glow so the head reads above the stem.
  ctx.beginPath()
  ctx.arc(cx, cy, 12, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 207, 255, 0.12)'
  ctx.fill()

  // Outer white ring — the primary visual anchor.
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)'
  ctx.lineWidth = 1.6
  ctx.stroke()

  // Inner faint ring — adds HUD depth without shouting.
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Center dot — ATLAS accent cyan, outlined for crispness on any basemap.
  ctx.beginPath()
  ctx.arc(cx, cy, 2.2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 207, 255, 1)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 0.7
  ctx.stroke()

  _searchMarkSprite = c.toDataURL('image/png')
  return _searchMarkSprite
}

function nuclearIconDataUrl() {
  const c = document.createElement('canvas')
  c.width = 20
  c.height = 20
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.arc(10, 10, 6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(220, 50, 50, 0.25)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(220, 50, 50, 0.4)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = 'rgba(220, 50, 50, 0.4)'
  ctx.font = '8px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('☢', 10, 10)
  return c.toDataURL('image/png')
}

function Polyline3D({ coordinates, strokeColor, strokeWidth, outerColor, outerWidth }) {
  return createElement('gmp-polyline-3d', {
    altitudeMode: AltitudeMode.ABSOLUTE,
    strokeColor,
    strokeWidth,
    outerColor,
    outerWidth,
    coordinates,
    drawsOccludedSegments: true,
  })
}

function Polygon3D({ outerCoordinates, fillColor, strokeColor, strokeWidth }) {
  return createElement('gmp-polygon-3d', {
    altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
    outerCoordinates,
    fillColor,
    strokeColor,
    strokeWidth,
    drawsOccludedSegments: true,
  })
}

function literalLatLng(pos) {
  if (!pos) return null
  const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat
  const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return { lat, lng }
}

function rgbaFromHex(hex, alpha) {
  let h = (hex || '#888888').replace('#', '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

class AtlasGlobeErrorBoundary extends Component {
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
          className="fixed inset-0 z-0 flex flex-col items-center justify-center gap-3 bg-[#05050c] px-6 text-center text-sm text-white/80"
          role="alert"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-white/40">Globe error</p>
          <p>The 3D map failed to load. Check the browser console and your Google Maps API key (Maps JavaScript API + 3D).</p>
          <pre className="max-w-lg overflow-auto rounded border border-white/10 bg-black/40 p-3 text-left text-[11px] text-red-200/90">
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function InnerMap({ onGlobeReady }) {
  const map3dRef = useRef(null)
  const globeWrapRef = useRef(null)
  const onGlobeReadyRef = useRef(onGlobeReady)
  onGlobeReadyRef.current = onGlobeReady

  const viewCenter = useMemo(() => getTimezoneViewCenter(), [])

  const defaultCenter = useMemo(
    () => ({ lat: viewCenter.lat, lng: viewCenter.lng, altitude: 0 }),
    [viewCenter.lat, viewCenter.lng],
  )

  const cameraRef = useRef({
    center: defaultCenter,
    range: STARTUP_ORBIT_RANGE_M,
    heading: 0,
    tilt: STARTUP_ORBIT_TILT,
    roll: 0,
  })

  const lastPointerRef = useRef({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  })
  const maps3dLib = useMapsLibrary('maps3d')
  const vectorLayersReady = Boolean(maps3dLib)

  const staticIcons = useMemo(
    () => ({
      nuclear: nuclearIconDataUrl(),
      searchPin: searchMarkIconDataUrl(),
    }),
    [],
  )

  const searchHighlight = useAtlasStore((s) => s.searchHighlight)
  const readyRef = useRef(false)
  const introStartedRef = useRef(false)
  const lastZoomEmitRef = useRef(0)
  const idleTimerRef = useRef(null)
  const effectiveAutoRotateRef = useRef(false)
  const idleSpinGateRef = useRef(false)
  const spinRafRef = useRef(null)
  const spriteCacheRef = useRef(new Map())

  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const setHoveredMarker = useAtlasStore((s) => s.setHoveredMarker)
  const openStreetView = useAtlasStore((s) => s.openStreetView)

  const events = useAtlasStore((s) => s.events)
  const dataLayers = useAtlasStore((s) => s.dataLayers)
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const priorityFilter = useAtlasStore((s) => s.priorityFilter)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const resolvedTier = useAtlasStore((s) => s.resolvedTier)
  const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)

  const globePlottedEvents = useMemo(() => {
    const list = []
    const maxAgeMs = TIME_FILTER_MAX_AGE_MS[timeFilter] ?? TIME_FILTER_MAX_AGE_MS.live
    const now = Date.now()
    for (const evt of events) {
      if (evt.lat == null || evt.lng == null) continue
      const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
      if (!layerKey) continue
      if (dataLayers[layerKey] === false) continue
      if (!activeDimensions.has(evt.dimension)) continue
      if (priorityFilter === 'p1' && evt.priority !== 'p1') continue
      if (priorityFilter === 'p1p2' && evt.priority === 'p3') continue
      // Drop markers older than the HUD time window so the globe reflects the
      // selected tier (Live / 24h / 7d / 30d) instead of the raw TTL buffer.
      // Use max(timestamp, fetchedAt) so low-precision upstream stamps (e.g.
      // CAMEO noon-UTC) cannot cull fresh ingests; TTL still governs true staleness.
      const tsMs = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
      const fMs = evt.fetchedAt ? new Date(evt.fetchedAt).getTime() : NaN
      const refMs = Math.max(
        Number.isFinite(tsMs) ? tsMs : -Infinity,
        Number.isFinite(fMs) ? fMs : -Infinity,
      )
      if (Number.isFinite(refMs) && refMs > -Infinity && now - refMs > maxAgeMs) continue
      list.push(evt)
    }

    if (list.length <= MAX_GLOBE_MARKERS) return list

    // Rank so the visible subset favours breaking + fresh signals over
    // dense old-news clutter. Score combines priority tier, severity, and
    // recency — all normalised so none dominates on its own.
    const priorityRank = { p1: 3, p2: 2, p3: 1 }
    const scored = list.map((evt) => {
      const tsRaw = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
      const fAt = evt.fetchedAt ? new Date(evt.fetchedAt).getTime() : NaN
      const ts = Math.max(
        Number.isFinite(tsRaw) ? tsRaw : -Infinity,
        Number.isFinite(fAt) ? fAt : -Infinity,
      )
      const tsForRank = Number.isFinite(ts) && ts > -Infinity ? ts : now
      const ageMin = Math.max(0, (now - tsForRank) / 60_000)
      // Exponential decay ~1h half-life.
      const recency = Math.exp(-ageMin / 60)
      const sev = (evt.severity || 1) / 5
      const pri = priorityRank[evt.priority] || 1
      return { evt, score: recency * 2 + sev * 1.5 + pri }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, MAX_GLOBE_MARKERS).map((s) => s.evt)
  }, [events, dataLayers, activeDimensions, priorityFilter, timeFilter])

  const clusterLayers = useMemo(() => {
    // Cap the clusterer input so the O(n²) pass stays bounded when the
    // worker has delivered a particularly rich export. The ranking already
    // front-loads the freshest/most-severe events, so a head-slice is a
    // faithful approximation of the dense pool.
    const clusterInput = globePlottedEvents.length > MAX_CLUSTER_INPUTS
      ? globePlottedEvents.slice(0, MAX_CLUSTER_INPUTS)
      : globePlottedEvents
    const clusters = clusterEvents(clusterInput, 200, 5)
    return clusters.map((cluster) => {
      const dimensionColor = DIMENSION_COLORS[cluster.dimension] || '#1a90ff'
      const points = cluster.events.map((e) => [e.lng, e.lat])
      const hull = convexHull(points)
      if (hull.length < 3) return null
      const ring = hull.map(([lng, lat]) => ({ lat, lng, altitude: 0 }))
      return {
        key: `cl-${cluster.dimension}-${cluster.centroid.lat}-${cluster.centroid.lng}`,
        ring,
        fill: rgbaFromHex(dimensionColor, 0.12),
        stroke: rgbaFromHex(dimensionColor, 0.55),
        count: cluster.count,
        centroid: cluster.centroid,
        strokeColorHex: dimensionColor,
      }
    }).filter(Boolean)
  }, [globePlottedEvents])

  const getSprite = useCallback((priority, dimension) => {
    const key = `${priority}_${dimension}`
    if (spriteCacheRef.current.has(key)) return spriteCacheRef.current.get(key)
    const canvas = generateSprite(priority, dimension, 64)
    const url = canvas.toDataURL('image/png')
    spriteCacheRef.current.set(key, url)
    return url
  }, [])

  const resetIdleTimer = useCallback(() => {
    if (!effectiveAutoRotateRef.current) return
    idleSpinGateRef.current = false
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      idleSpinGateRef.current = true
    }, 6000)
  }, [])

  const handleCameraChanged = useCallback(
    (ev) => {
      const d = ev.detail
      if (d.center) cameraRef.current.center = d.center
      if (typeof d.range === 'number') cameraRef.current.range = d.range
      if (typeof d.heading === 'number') cameraRef.current.heading = d.heading
      if (typeof d.tilt === 'number') cameraRef.current.tilt = d.tilt
      if (typeof d.roll === 'number') cameraRef.current.roll = d.roll

      const now = performance.now()
      if (typeof d.range === 'number') {
        const clamped = Math.max(RANGE_MIN_M, Math.min(RANGE_MAX_M, d.range))
        const zoom = (clamped - RANGE_MIN_M) / (RANGE_MAX_M - RANGE_MIN_M)
        if (now - lastZoomEmitRef.current >= ZOOM_STORE_MIN_INTERVAL_MS) {
          lastZoomEmitRef.current = now
          startTransition(() => setZoomLevel(zoom))
        }
      }

      resetIdleTimer()
    },
    [resetIdleTimer, setZoomLevel],
  )

  const flyToLngLat = useCallback((lat, lng, rangeFactor = 0.4) => {
    const map = map3dRef.current
    if (!map?.flyCameraTo) return
    const cam = cameraRef.current
    const nextRange = Math.max(200, (cam.range ?? STARTUP_ORBIT_RANGE_M) * rangeFactor)
    map.flyCameraTo({
      endCamera: {
        center: { lat, lng, altitude: 0 },
        range: nextRange,
        heading: cam.heading ?? 0,
        tilt: Math.min(65, Math.max(0, cam.tilt ?? STARTUP_ORBIT_TILT)),
        roll: 0,
      },
      durationMillis: 1400,
    })
  }, [])

  const handleMapClick = useCallback(
    (ev) => {
      const ll = literalLatLng(ev.detail?.position)
      if (!ll) return

      const store = useAtlasStore.getState()
      if (store.selectedMarker || store.selectedEvent) {
        setSelectedMarker(null)
        setSelectedEvent(null)
        return
      }

      openStreetView({ lat: ll.lat, lng: ll.lng, source: 'globe' })
    },
    [openStreetView, setSelectedEvent, setSelectedMarker],
  )

  const onEventClick = useCallback(
    (e, evt) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      const src = (evt.source || '').toLowerCase()
      if (src.includes('gdelt')) {
        setSelectedMarker(evt)
        setSelectedEvent(null)
      } else {
        setSelectedEvent(evt)
        setSelectedMarker(null)
      }
      flyToLngLat(evt.lat, evt.lng, 0.4)
    },
    [flyToLngLat, setSelectedEvent, setSelectedMarker],
  )

  const setPointerHover = useCallback(
    (obj, isEvent) => {
      const { x, y } = lastPointerRef.current
      if (!obj) {
        setHoveredMarker(null)
        return
      }
      setHoveredMarker(
        isEvent
          ? { ...obj, _screenX: x, _screenY: y, _isEvent: true }
          : { ...obj, _screenX: x, _screenY: y },
      )
    },
    [setHoveredMarker],
  )

  useEffect(() => {
    const ar = useAtlasStore.getState().getEffectiveSetting('autoRotate')
    effectiveAutoRotateRef.current = ar
    idleSpinGateRef.current = ar
    if (!ar) clearTimeout(idleTimerRef.current)
  }, [resolvedTier, qualityOverrides])

  useEffect(() => {
    const spin = () => {
      if (
        effectiveAutoRotateRef.current &&
        idleSpinGateRef.current &&
        map3dRef.current?.map3d
      ) {
        const el = map3dRef.current.map3d
        const h = Number(el.heading) || 0
        el.heading = (h + 0.08) % 360
      }
      spinRafRef.current = requestAnimationFrame(spin)
    }
    spinRafRef.current = requestAnimationFrame(spin)
    return () => {
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current)
    }
  }, [])

  useEffect(() => {
    const wrap = globeWrapRef.current
    if (!wrap) return

    let pointerOver = false
    const onEnter = () => {
      pointerOver = true
    }
    const onLeave = () => {
      pointerOver = false
    }

    const onKeyDown = (e) => {
      const active = document.activeElement
      const focusInsideGlobe =
        active instanceof Node && active !== document.body && wrap.contains(active)
      if (!pointerOver && !focusInsideGlobe) return
      if (useAtlasStore.getState().isStreetViewOpen) return

      const t = e.target
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ) {
        return
      }

      const api = map3dRef.current
      const el = api?.map3d
      if (!el) return

      if (applyMap3dKeyboardShortcuts(e, el, RANGE_MIN_M, RANGE_MAX_M)) {
        e.preventDefault()
        e.stopPropagation()
        resetIdleTimer()
      }
    }

    wrap.addEventListener('pointerenter', onEnter)
    wrap.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      wrap.removeEventListener('pointerenter', onEnter)
      wrap.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [resetIdleTimer])

  useEffect(() => {
    useAtlasStore.getState().setOnResetView(() => {
      const map = map3dRef.current
      const center = getTimezoneViewCenter()
      if (map?.flyCameraTo) {
        map.flyCameraTo({
          endCamera: {
            center: { lat: center.lat, lng: center.lng, altitude: 0 },
            range: STARTUP_ORBIT_RANGE_M,
            heading: 0,
            tilt: STARTUP_ORBIT_TILT,
            roll: 0,
          },
          durationMillis: 1500,
        })
      }
      idleSpinGateRef.current = useAtlasStore.getState().getEffectiveSetting('autoRotate')
      useAtlasStore.getState().setSelectedMarker(null)
      useAtlasStore.getState().clearSearchHighlight()
    })
    return () => {
      useAtlasStore.getState().setOnResetView(null)
    }
  }, [])

  // Bridge the header place-search to Map3D's camera path. The range is
  // derived from the returned viewport bbox (cities → ~20km, countries →
  // ~800km) so the framing matches what Google Earth shows for the same
  // query. No viewport → fall back to a modest city-level zoom.
  useEffect(() => {
    useAtlasStore.getState().setOnFlyToLocation((target) => {
      const map = map3dRef.current
      if (!map?.flyCameraTo || !target) return
      const { lat, lng, viewport } = target
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

      let range
      if (viewport) {
        const latSpanDeg = Math.abs(viewport.north - viewport.south)
        const lngSpanDeg = Math.abs(viewport.east - viewport.west)
        const cosLat = Math.max(0.15, Math.abs(Math.cos((lat * Math.PI) / 180)))
        // Convert the larger of the two spans to meters, then pad so the
        // bbox sits well inside the viewport at the chosen tilt.
        const latSpanM = latSpanDeg * 111_000
        const lngSpanM = lngSpanDeg * 111_000 * cosLat
        const maxSpanM = Math.max(latSpanM, lngSpanM)
        range = Math.max(1500, Math.min(RANGE_MAX_M * 0.5, maxSpanM * 2.3))
      } else {
        range = 22_000
      }

      idleSpinGateRef.current = false
      map.flyCameraTo({
        endCamera: {
          center: { lat, lng, altitude: 0 },
          range,
          heading: 0,
          tilt: 45,
          roll: 0,
        },
        durationMillis: 1500,
      })
    })
    return () => {
      useAtlasStore.getState().setOnFlyToLocation(null)
    }
  }, [])

  useEffect(() => {
    if (useAtlasStore.getState().qualityTier === 'auto') {
      detectQualityTier().then((detected) => {
        useAtlasStore.getState().setResolvedPriority(detected)
      })
    }
  }, [])

  const runIntro = useCallback(() => {
    if (introStartedRef.current) return
    const map = map3dRef.current
    if (!map?.flyCameraTo) return
    introStartedRef.current = true
    const center = { lat: defaultCenter.lat, lng: defaultCenter.lng, altitude: 0 }
    if (useAtlasStore.getState().skipCesiumIntro) {
      useAtlasStore.getState().setSkipCesiumIntro(false)
      map.flyCameraTo({
        endCamera: {
          center,
          range: STARTUP_ORBIT_RANGE_M,
          heading: 0,
          tilt: STARTUP_ORBIT_TILT,
          roll: 0,
        },
        durationMillis: 0,
      })
      return
    }
    map.flyCameraTo({
      endCamera: {
        center,
        range: INTRO_FROM_RANGE_M,
        heading: 0,
        tilt: STARTUP_ORBIT_TILT,
        roll: 0,
      },
      durationMillis: 0,
    })
    requestAnimationFrame(() => {
      map3dRef.current?.flyCameraTo?.({
        endCamera: {
          center,
          range: STARTUP_ORBIT_RANGE_M,
          heading: 0,
          tilt: STARTUP_ORBIT_TILT,
          roll: 0,
        },
        durationMillis: INTRO_DURATION_MS,
      })
    })
  }, [defaultCenter])

  const finalizeReady = useCallback(() => {
    if (readyRef.current) return
    readyRef.current = true
    if (map3dRef.current?.flyCameraTo) runIntro()
    const cb = onGlobeReadyRef.current
    if (typeof cb === 'function') cb()
    requestSnapshot()
  }, [runIntro])

  const onSteadyChange = useCallback(
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

  /**
   * Convert the stored Nominatim boundary GeoJSON into an array of
   * Map3D-ready rings (`Array<{lat,lng,altitude}>`). Matches Google
   * Earth's "official border" behaviour: only admin-area results carry
   * a `boundary`, so for landmarks / businesses this returns `null` and
   * nothing is drawn beyond the pin. No bbox rectangle is ever painted.
   */
  const searchHighlightRings = useMemo(() => {
    const boundary = searchHighlight?.boundary
    if (!boundary || !Array.isArray(boundary.coordinates)) return null

    const rings = []
    const pushRing = (ring) => {
      const pts = (ring || [])
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map(([rLng, rLat]) => ({ lat: rLat, lng: rLng, altitude: 40 }))
      if (pts.length >= 3) rings.push(pts)
    }

    if (boundary.type === 'Polygon') {
      for (const ring of boundary.coordinates) pushRing(ring)
    } else if (boundary.type === 'MultiPolygon') {
      for (const poly of boundary.coordinates) {
        for (const ring of poly || []) pushRing(ring)
      }
    }
    return rings.length > 0 ? { rings } : null
  }, [searchHighlight])

  const heatOn = dataLayers?.gdeltHeatmap !== false
  const choroOn = dataLayers?.gdeltChoropleth === true

  const { heatmapPoints, choroplethRows, toneRange } = useGdeltGeoOverlay()

  const heatBuckets = useMemo(() => {
    if (!heatOn) return []
    return bucketHeatPoints(heatmapPoints, 1.5)
  }, [heatmapPoints, heatOn])

  const choroPolygons = useMemo(() => {
    if (!choroOn) return []
    const min = toneRange?.min ?? -5
    const max = toneRange?.max ?? 5
    const list = []
    for (let i = 0; i < choroplethRows.length; i++) {
      const r = choroplethRows[i]
      const rings = geoJsonToOuterRings(r.geometry)
      const fill = toneToChoroplethRgba(r.tone, min, max)
      for (let j = 0; j < rings.length; j++) {
        list.push({
          key: `gdelt-choro-${i}-${j}`,
          ring: rings[j],
          fill,
          stroke: 'rgba(255,255,255,0.22)',
        })
      }
    }
    return list.slice(0, 220)
  }, [choroplethRows, choroOn, toneRange])

  return (
    <div
      ref={globeWrapRef}
      tabIndex={-1}
      aria-label="3D globe"
      className="fixed inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40"
      style={{ cursor: 'grab' }}
      onPointerDown={(e) => {
        resetIdleTimer()
        if (e.button === 0) e.currentTarget.focus({ preventScroll: true })
      }}
      onWheel={resetIdleTimer}
      onPointerMove={(e) => {
        lastPointerRef.current = { x: e.clientX, y: e.clientY }
      }}
    >
      <Map3D
        ref={map3dRef}
        mode={MapMode.HYBRID}
        defaultUIHidden
        // Suppress Google's baked-in POI dots / labels on the 3D tile layer.
        // Without this, HYBRID mode draws small non-interactive city /
        // landmark dots everywhere — users read them as stale Atlas markers
        // even though they're part of Google's base map.
        defaultLabelsDisabled
        defaultCenter={defaultCenter}
        defaultRange={STARTUP_ORBIT_RANGE_M}
        defaultTilt={STARTUP_ORBIT_TILT}
        defaultHeading={0}
        minAltitude={80}
        maxAltitude={42_000_000}
        gestureHandling="GREEDY"
        onCameraChanged={handleCameraChanged}
        onClick={handleMapClick}
        onSteadyChange={onSteadyChange}
      >
        {vectorLayersReady &&
          SUBMARINE_CABLE_PATHS.map((cable) => (
            <Polyline3D
              key={cable.name}
              coordinates={cable.points.map(([lng, lat]) => ({
                lat,
                lng,
                altitude: 5000,
              }))}
              strokeColor="rgba(0, 207, 255, 0.14)"
              strokeWidth={1}
              outerColor="rgba(0, 207, 255, 0.06)"
              outerWidth={1}
            />
          ))}

        {vectorLayersReady &&
          clusterLayers.map((cl) => (
            <Polygon3D
              key={cl.key}
              outerCoordinates={cl.ring}
            fillColor={cl.fill}
            strokeColor={cl.stroke}
            strokeWidth={1}
            />
          ))}

        {vectorLayersReady &&
          choroPolygons.map((cp) => (
            <Polygon3D
              key={cp.key}
              outerCoordinates={cp.ring}
              fillColor={cp.fill}
              strokeColor={cp.stroke}
              strokeWidth={0.6}
            />
          ))}

        {heatBuckets.map((b, i) => {
          const alpha = Math.max(0.22, Math.min(0.85, 0.28 + b.norm * 0.7))
          const size = Math.round(28 + b.norm * 44)
          return (
            <Marker3D
              key={`gdelt-heat-${i}`}
              position={{ lat: b.lat, lng: b.lng, altitude: 80 }}
              altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
              drawsWhenOccluded
              sizePreserved
              collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
              zIndex={-1}
            >
              <img
                src={heatSpriteDataUrl(Math.round(alpha * 10) / 10)}
                width={size}
                height={size}
                alt=""
                draggable={false}
                style={{ pointerEvents: 'none' }}
              />
            </Marker3D>
          )
        })}

        {clusterLayers.map((cl) => (
          <Marker3D
            key={`${cl.key}-badge`}
            position={{ lat: cl.centroid.lat, lng: cl.centroid.lng, altitude: 400 }}
            altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
            label={String(cl.count)}
            drawsWhenOccluded
            sizePreserved
            collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
            zIndex={2}
            onClick={(e) => {
              e?.stopPropagation?.()
              e?.preventDefault?.()
              const ev0 = cl.events?.[0]
              useAtlasStore.getState().openGdeltAnalytics({
                query: buildGdeltDocQuery({
                  title: ev0?.title || '',
                  dimension: cl.dimension,
                }),
                label: `Cluster · ${cl.count} signals`,
                dimension: cl.dimension,
              })
            }}
          />
        ))}

        {vectorLayersReady &&
          searchHighlightRings?.rings.map((ring, idx) => (
            <Polyline3D
              key={`atlas-search-highlight-ring-${idx}`}
              coordinates={ring}
              strokeColor="rgba(0, 207, 255, 0.9)"
              strokeWidth={2.5}
              outerColor="rgba(0, 207, 255, 0.18)"
              outerWidth={1}
            />
          ))}

        {searchHighlight && Number.isFinite(searchHighlight.lat) && Number.isFinite(searchHighlight.lng) && (
          <React.Fragment key="atlas-search-highlight-group">
            {/*
             * ATLAS place-mark is a head + stem. The stem is a real 3D
             * polyline from the terrain surface up to the reticle, both
             * endpoints using RELATIVE_TO_GROUND so the whole assembly
             * rides the terrain as tiles stream in — no parallax drift
             * like CLAMP_TO_GROUND would cause, and the user always sees
             * the stem touching the exact ground point under camera
             * tilt/zoom/orbit.
             */}
            {createElement('gmp-polyline-3d', {
              key: 'atlas-search-stem',
              altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
              strokeColor: 'rgba(0, 207, 255, 0.85)',
              strokeWidth: 2,
              outerColor: 'rgba(0, 207, 255, 0.18)',
              outerWidth: 1,
              drawsOccludedSegments: true,
              coordinates: [
                { lat: searchHighlight.lat, lng: searchHighlight.lng, altitude: 0 },
                { lat: searchHighlight.lat, lng: searchHighlight.lng, altitude: 140 },
              ],
            })}
            <Marker3D
              key="atlas-search-highlight-pin"
              position={{ lat: searchHighlight.lat, lng: searchHighlight.lng, altitude: 140 }}
              altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
              drawsWhenOccluded
              sizePreserved
              collisionBehavior={CollisionBehavior.REQUIRED}
              zIndex={1000}
            >
              <img
                src={staticIcons.searchPin}
                width={24}
                height={24}
                alt=""
                draggable={false}
                style={{ pointerEvents: 'none' }}
              />
            </Marker3D>
          </React.Fragment>
        )}

        {NUCLEAR_FACILITIES.map((nf) => (
          <Marker3D
            key={nf.name}
            position={{ lat: nf.lat, lng: nf.lng }}
            drawsWhenOccluded
            collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
            zIndex={0}
          >
            <img src={staticIcons.nuclear} width={12} height={12} alt="" draggable={false} />
          </Marker3D>
        ))}

        {globePlottedEvents.map((evt, idx) => {
          const sprite = getSprite(evt.priority, evt.dimension)
          const size = getSeveritySize(evt.severity)
          const anim = getAnimationState(evt.timestamp)
          const pulseClass =
            anim !== 'static' && idx < 20 ? 'atlas-globe-event-pulse' : ''
          return (
            <Marker3D
              key={evt.id}
              position={{ lat: evt.lat, lng: evt.lng, altitude: 800 }}
              altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
              drawsWhenOccluded
              sizePreserved
              collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
              title={evt.title}
              onClick={(e) => onEventClick(e, evt)}
            >
              <img
                src={sprite}
                width={size}
                height={size}
                alt=""
                className={pulseClass}
                style={{ opacity: evt.opacity ?? 1 }}
                onMouseEnter={() => setPointerHover(evt, true)}
                onMouseLeave={() => setHoveredMarker(null)}
              />
            </Marker3D>
          )
        })}
      </Map3D>
    </div>
  )
}

export default function GoogleGlobe({ onGlobeReady }) {
  if (!GOOGLE_API_KEY) {
    return (
      <div className="fixed inset-0 z-0 flex items-center justify-center bg-black text-white/70 text-sm px-6 text-center">
        Missing VITE_GOOGLE_MAPS_API_KEY — Map3D requires your Google Maps API key (Maps JavaScript API + 3D Maps).
      </div>
    )
  }

  return (
    <APIProvider
      apiKey={GOOGLE_API_KEY}
      version="weekly"
      libraries={['maps3d']}
      language="en-US"
      region="US"
    >
      <AtlasGlobeErrorBoundary>
        <InnerMap onGlobeReady={onGlobeReady} />
      </AtlasGlobeErrorBoundary>
    </APIProvider>
  )
}
