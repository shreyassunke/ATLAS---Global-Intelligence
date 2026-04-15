import React, {
  Component,
  createElement,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { getCategoryColor } from '../../utils/categoryColors'
import { getRegionKey, getTimezoneViewCenter } from '../../utils/geo'
import { detectQualityTier } from '../../config/qualityTiers'
import { DIMENSION_COLORS } from '../../core/eventSchema'
import { generateSprite, getAnimationState, getSeveritySize } from '../../core/visualGrammar'
import {
  MARITIME_CHOKEPOINTS,
  NUCLEAR_FACILITIES,
  SUBMARINE_CABLE_PATHS,
  clusterEvents,
} from '../../core/globeLayers'

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const ZOOMED_OUT_RANGE_M = 14_000_000
const MAX_PER_REGION_ZOOMED_OUT = 2
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

const NEWS_SPRITE_SIZE = 48
const NEWS_MARKER_PX = 20
const _newsSpriteCache = new Map()
const _newsDataUrlCache = new Map()

function makeNewsSpriteKey(cssColor, isVideo) {
  return `${cssColor}_${isVideo ? 'v' : 'a'}`
}

function generateNewsSprite(cssColor, isVideo) {
  const key = makeNewsSpriteKey(cssColor, isVideo)
  if (_newsSpriteCache.has(key)) return _newsSpriteCache.get(key)
  const s = NEWS_SPRITE_SIZE
  const h = s / 2
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')

  if (isVideo) {
    const r = h - 4
    const rx = h - r
    const ry = h - r * 0.75
    const rw = r * 2
    const rh = r * 1.5
    const rad = 4
    ctx.beginPath()
    ctx.moveTo(rx + rad, ry)
    ctx.lineTo(rx + rw - rad, ry)
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad)
    ctx.lineTo(rx + rw, ry + rh - rad)
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh)
    ctx.lineTo(rx + rad, ry + rh)
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad)
    ctx.lineTo(rx, ry + rad)
    ctx.quadraticCurveTo(rx, ry, rx + rad, ry)
    ctx.closePath()
    ctx.fillStyle = cssColor
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
    const triH = r * 0.6
    ctx.beginPath()
    ctx.moveTo(h - triH * 0.35, h - triH * 0.5)
    ctx.lineTo(h + triH * 0.55, h)
    ctx.lineTo(h - triH * 0.35, h + triH * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.arc(h, h, h - 4, 0, Math.PI * 2)
    ctx.fillStyle = cssColor
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    for (let i = -1; i <= 1; i++) {
      const y = h + i * 4.5
      ctx.beginPath()
      ctx.moveTo(h - 7, y)
      ctx.lineTo(h + 7, y)
      ctx.stroke()
    }
  }
  _newsSpriteCache.set(key, c)
  return c
}

function newsSpriteDataUrl(cssColor, isVideo) {
  const key = makeNewsSpriteKey(cssColor, isVideo)
  if (_newsDataUrlCache.has(key)) return _newsDataUrlCache.get(key)
  const canvas = generateNewsSprite(cssColor, isVideo)
  const url = canvas.toDataURL('image/png')
  _newsDataUrlCache.set(key, url)
  return url
}

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function approxInView(centerLat, centerLng, rangeM, lat, lng) {
  const dKm = haversineKm(centerLat, centerLng, lat, lng)
  const radiusKm = Math.min(6000, Math.max(120, (rangeM / 1_000_000) * 1400))
  return dKm <= radiusKm
}

function chokepointDiamondDataUrl() {
  const c = document.createElement('canvas')
  c.width = 24
  c.height = 24
  const ctx = c.getContext('2d')
  ctx.translate(12, 12)
  ctx.rotate(Math.PI / 4)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(-6, -6, 12, 12)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.strokeRect(-6, -6, 12, 12)
  return c.toDataURL('image/png')
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
      choke: chokepointDiamondDataUrl(),
      nuclear: nuclearIconDataUrl(),
    }),
    [],
  )
  const readyRef = useRef(false)
  const introStartedRef = useRef(false)
  const lastZoomEmitRef = useRef(0)
  const idleTimerRef = useRef(null)
  const effectiveAutoRotateRef = useRef(false)
  const idleSpinGateRef = useRef(false)
  const spinRafRef = useRef(null)
  const spriteCacheRef = useRef(new Map())
  const [visibilityEpoch, setVisibilityEpoch] = useState(0)

  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const setHoveredMarker = useAtlasStore((s) => s.setHoveredMarker)
  const openStreetView = useAtlasStore((s) => s.openStreetView)

  const newsItems = useAtlasStore((s) => s.newsItems)
  const events = useAtlasStore((s) => s.events)
  const activeCategories = useAtlasStore((s) => s.activeCategories)
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const priorityFilter = useAtlasStore((s) => s.priorityFilter)
  const resolvedTier = useAtlasStore((s) => s.resolvedTier)
  const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)

  const maxMarkers = useMemo(
    () => useAtlasStore.getState().getEffectiveSetting('maxMarkers') ?? 300,
    [resolvedTier, qualityOverrides],
  )

  const visibleNewsIds = useMemo(() => {
    const filtered = newsItems.filter(
      (item) => activeCategories.has(item.category) && item.lat != null && item.lng != null,
    )
    const cam = cameraRef.current
    const range = cam.range ?? STARTUP_ORBIT_RANGE_M
    const center = cam.center || defaultCenter

    let pool = filtered
    if (range > ZOOMED_OUT_RANGE_M) {
      const byRegion = {}
      for (const item of filtered) {
        const key = getRegionKey(item.lat, item.lng)
        if (!byRegion[key]) byRegion[key] = []
        byRegion[key].push(item)
      }
      const topIds = new Set()
      for (const regionItems of Object.values(byRegion)) {
        regionItems
          .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
          .slice(0, MAX_PER_REGION_ZOOMED_OUT)
          .forEach((item) => topIds.add(item.id))
      }
      pool = filtered.filter((i) => topIds.has(i.id))
    } else {
      pool = filtered.filter((item) =>
        approxInView(center.lat, center.lng, range, item.lat, item.lng),
      )
    }

    const sorted = [...pool].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    return new Set(sorted.slice(0, maxMarkers).map((i) => i.id))
  }, [
    newsItems,
    activeCategories,
    maxMarkers,
    defaultCenter,
    visibilityEpoch,
  ])

  const filteredEvents = useMemo(() => {
    const list = []
    for (const evt of events) {
      if (evt.lat == null || evt.lng == null) continue
      if (!activeDimensions.has(evt.dimension)) continue
      if (priorityFilter === 'p1' && evt.priority !== 'p1') continue
      if (priorityFilter === 'p1p2' && evt.priority === 'p3') continue
      list.push(evt)
    }
    return list
  }, [events, activeDimensions, priorityFilter])

  const clusterLayers = useMemo(() => {
    const clusters = clusterEvents(events, 200, 5)
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
  }, [events])

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

      // Marker visibility reads `cameraRef` inside `visibleNewsIds` — recomputing that graph on
      // every camera tick (or even a 150ms throttle) blocks the main thread during drags.
      // Refresh when the map reports steady instead; see `onSteadyChange`.

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

  const onNewsClick = useCallback(
    (e, item) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      setSelectedMarker(item)
      setSelectedEvent(null)
      flyToLngLat(item.lat, item.lng, 0.4)
    },
    [flyToLngLat, setSelectedEvent, setSelectedMarker],
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
    })
    return () => {
      useAtlasStore.getState().setOnResetView(null)
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
      startTransition(() => {
        setVisibilityEpoch((n) => n + 1)
      })
      finalizeReady()
    },
    [finalizeReady],
  )

  useEffect(() => {
    const t = setTimeout(() => finalizeReady(), 5000)
    return () => clearTimeout(t)
  }, [finalizeReady])

  const newsMarkers = useMemo(() => {
    const filtered = newsItems.filter(
      (item) => activeCategories.has(item.category) && item.lat != null && item.lng != null,
    )
    return filtered.filter((item) => visibleNewsIds.has(item.id))
  }, [newsItems, activeCategories, visibleNewsIds])

  return (
    <div
      className="fixed inset-0 z-0"
      style={{ cursor: 'grab' }}
      onPointerDown={resetIdleTimer}
      onWheel={resetIdleTimer}
      onPointerMove={(e) => {
        lastPointerRef.current = { x: e.clientX, y: e.clientY }
      }}
    >
      <Map3D
        ref={map3dRef}
        mode={MapMode.SATELLITE}
        defaultUIHidden
        defaultLabelsDisabled={false}
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
          />
        ))}

        {MARITIME_CHOKEPOINTS.map((cp) => (
          <Marker3D
            key={cp.name}
            position={{ lat: cp.lat, lng: cp.lng }}
            label={cp.name.toUpperCase()}
            drawsWhenOccluded
            sizePreserved
            collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
            zIndex={1}
          >
            <img src={staticIcons.choke} width={14} height={14} alt="" draggable={false} />
          </Marker3D>
        ))}

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

        {newsMarkers.map((item) => {
          const cssColor = getCategoryColor(item.category)
          const src = newsSpriteDataUrl(cssColor, item.mediaType === 'video')
          return (
            <Marker3D
              key={item.id}
              position={{ lat: item.lat, lng: item.lng, altitude: 1200 }}
              altitudeMode={AltitudeMode.RELATIVE_TO_GROUND}
              drawsWhenOccluded
              sizePreserved
              collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
              title={item.title}
              onClick={(e) => onNewsClick(e, item)}
            >
              <img
                src={src}
                width={NEWS_MARKER_PX}
                height={NEWS_MARKER_PX}
                alt=""
                className="atlas-globe-dot-pulse"
                style={{ opacity: 0.92 }}
                onMouseEnter={() => setPointerHover(item, false)}
                onMouseLeave={() => setHoveredMarker(null)}
              />
            </Marker3D>
          )
        })}

        {filteredEvents.map((evt, idx) => {
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
