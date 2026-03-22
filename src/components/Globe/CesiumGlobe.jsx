import { useEffect, useRef, useMemo } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES, getCategoryColor } from '../../utils/categoryColors'
import { getRegionKey, getTimezoneViewCenter } from '../../utils/geo'
import { QUALITY_TIERS, detectQualityTier } from '../../config/qualityTiers'
import { TIER_COLORS, SEVERITY_SIZES } from '../../core/eventSchema'
import { generateSprite, getAnimationState, getSeveritySize } from '../../core/visualGrammar'
import { MARITIME_CHOKEPOINTS, NUCLEAR_FACILITIES, SUBMARINE_CABLE_PATHS, clusterEvents } from '../../core/globeLayers'

// Cesium ion token from .env — used for World Imagery, World Terrain, Black Marble (3812), Photorealistic 3D Tiles
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ''

const ZOOMED_OUT_HEIGHT = 12_000_000
const MAX_PER_REGION_ZOOMED_OUT = 2

// Minimal particle-style pulse for dots (no glow, just subtle breathing)
const DOT_PULSE_SPEED = (2 * Math.PI) / 1.8
const DOT_SIZE_MIN = 6.5
const DOT_SIZE_MAX = 9.0
const DOT_ALPHA_MIN = 0.35
const DOT_ALPHA_MAX = 0.75

/**
 * Cesium billboards anchored at lat/lng must depth-test against the globe.
 * - `0` = always depth-test → back-side markers are hidden (correct).
 * - `Number.POSITIVE_INFINITY` = never depth-test → markers draw through Earth (“hollow Earth”).
 * Use this for ALL globe markers (news, events, entities). Do not switch to POSITIVE_INFINITY
 * to “fix” terrain clipping — raise altitude or adjust terrain instead.
 * @see https://cesium.com/learn/cesiumjs/ref-doc/Billboard.html#disableDepthTestDistance
 */
const GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE = 0

// Billboard sprite sizes for news markers (article vs video distinction)
const NEWS_SPRITE_SIZE = 48
const NEWS_MARKER_PX = 20
const _newsSpriteCache = new Map()

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
    // Rounded-rect play button (avoid ctx.roundRect — not in all browsers)
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
    // play triangle
    const triH = r * 0.6
    ctx.beginPath()
    ctx.moveTo(h - triH * 0.35, h - triH * 0.5)
    ctx.lineTo(h + triH * 0.55, h)
    ctx.lineTo(h - triH * 0.35, h + triH * 0.5)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()
  } else {
    // Circle with tiny "article lines" icon
    ctx.beginPath()
    ctx.arc(h, h, h - 4, 0, Math.PI * 2)
    ctx.fillStyle = cssColor
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    // three horizontal lines (article glyph)
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

// Throttle intervals (ms) for expensive per-frame work
const VISIBILITY_THROTTLE_MS = 150
const PULSE_THROTTLE_MS = 50

function pointInRectangle(lat, lng, rect) {
  if (!rect) return false
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return lngRad >= rect.west && lngRad <= rect.east && latRad >= rect.south && latRad <= rect.north
}

function getNewsContentSignature(items) {
  if (!items?.length) return '0'
  const ids = items.map((i) => String(i.id)).sort()
  return `${items.length}:${ids.join('|')}`
}

function getActiveCategoriesSignature(activeCategories) {
  return [...activeCategories].sort().join(',')
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

export default function CesiumGlobe({ onGlobeReady }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  /** Mirrors Settings → Features → Auto-Rotate (quality tier + overrides) */
  const effectiveAutoRotateRef = useRef(false)
  /** When true, idle timeout has passed since last interaction — may spin if setting is on */
  const idleSpinGateRef = useRef(false)
  const idleTimer = useRef(null)
  const onGlobeReadyRef = useRef(onGlobeReady)
  onGlobeReadyRef.current = onGlobeReady

  // BillboardCollection refs for news markers (article / video distinction)
  const pointCollectionRef = useRef(null)
  const pointMapRef = useRef(new Map()) // id -> { billboard, item, baseColor }
  /** Content signature of `newsItems` (ids) — stable even if the store reuses the same array reference */
  const lastNewsContentSigRef = useRef('')
  const lastActiveCategoriesSigRef = useRef('')
  const allItemsRef = useRef([]) // filtered snapshot from last rebuildMarkers (debug / legacy)

  // BillboardCollection refs (event markers — v4 visual grammar)
  const eventBillboardsRef = useRef(null)
  const eventBillboardMapRef = useRef(new Map()) // id -> { billboard, event }
  const spriteCacheRef = useRef(new Map())

  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const setHoveredMarker = useAtlasStore((s) => s.setHoveredMarker)
  const newsItems = useAtlasStore((s) => s.newsItems)
  const events = useAtlasStore((s) => s.events)
  const activeCategories = useAtlasStore((s) => s.activeCategories)
  const activeDomains = useAtlasStore((s) => s.activeDomains)
  const severityFloor = useAtlasStore((s) => s.severityFloor)
  const openStreetView = useAtlasStore((s) => s.openStreetView)

  // Quality tier state
  const qualityTier = useAtlasStore((s) => s.qualityTier)
  const resolvedTier = useAtlasStore((s) => s.resolvedTier)
  const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)
  const setResolvedTier = useAtlasStore((s) => s.setResolvedTier)

  // Refs for layers that can be toggled by quality settings
  const layerRefs = useRef({
    bloom: null,
    vignette: null,
    lightsLayer: null,
    labelsLayer: null,
    tiles3d: null,
    terrainProvider: null,
  })

  // Convert CSS color to Cesium Color (cached)
  const colorCache = useRef(new Map())
  function toCesiumColor(cssColor) {
    let c = colorCache.current.get(cssColor)
    if (!c) {
      const base = Cesium.Color.fromCssColorString(cssColor)
      c = Cesium.Color.multiplyByScalar(base, 0.85, new Cesium.Color())
      colorCache.current.set(cssColor, c)
    }
    return c
  }

  function rebuildMarkers(viewer, items) {
    if (pointCollectionRef.current) {
      viewer.scene.primitives.remove(pointCollectionRef.current)
    }
    pointMapRef.current.clear()
    allItemsRef.current = items

    const collection = new Cesium.BillboardCollection({ scene: viewer.scene })
    const altitude = 15_000

    for (const item of items) {
      if (item.lat == null || item.lng == null) continue

      const cssColor = getCategoryColor(item.category)
      const baseColor = toCesiumColor(cssColor)
      const isVideo = item.mediaType === 'video'
      const sprite = generateNewsSprite(cssColor, isVideo)

      const billboard = collection.add({
        position: Cesium.Cartesian3.fromDegrees(item.lng, item.lat, altitude),
        image: sprite,
        width: NEWS_MARKER_PX,
        height: NEWS_MARKER_PX,
        color: Cesium.Color.WHITE.withAlpha(DOT_ALPHA_MIN),
        show: true,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 35_000_000),
      })

      pointMapRef.current.set(item.id, { billboard, item, baseColor })
    }

    viewer.scene.primitives.add(collection)
    pointCollectionRef.current = collection

    updateVisibility(viewer)
  }

  function updateVisibility(viewer) {
    if (!viewer || viewer.isDestroyed()) return
    const height = viewer.camera.positionCartographic?.height ?? 25_000_000
    const zoomedOut = height > ZOOMED_OUT_HEIGHT
    const map = pointMapRef.current
    if (map.size === 0) return

    if (zoomedOut) {
      const items = Array.from(map.values())
        .map(({ item }) => item)
        .filter((x) => x && x.lat != null && x.lng != null)
      const byRegion = {}
      for (const item of items) {
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
      for (const [id, { billboard }] of map) {
        billboard.show = topIds.has(id)
      }
    } else {
      let viewRect = null
      try {
        viewRect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid)
      } catch {
        viewRect = null
      }
      const inView = viewRect != null
      for (const { billboard, item } of map.values()) {
        billboard.show = inView ? pointInRectangle(item.lat, item.lng, viewRect) : true
      }
    }
  }

  function getSprite(shape, tier, domain) {
    const key = `${shape}_${tier}_${domain}`
    if (spriteCacheRef.current.has(key)) return spriteCacheRef.current.get(key)
    const canvas = generateSprite(shape, tier, domain, 64)
    spriteCacheRef.current.set(key, canvas)
    return canvas
  }

  function rebuildEventMarkers(viewer, eventList) {
    if (!viewer || viewer.isDestroyed()) return

    if (eventBillboardsRef.current) {
      viewer.scene.primitives.remove(eventBillboardsRef.current)
    }
    eventBillboardMapRef.current.clear()

    const billboards = new Cesium.BillboardCollection({ scene: viewer.scene })
    // Markers should read as projected onto the globe surface.
    const altitude = 2_000

    for (const evt of eventList) {
      if (evt.lat == null || evt.lng == null) continue
      if (!activeDomains.has(evt.domain)) continue
      if (evt.severity < severityFloor) continue

      const sprite = getSprite(evt.shape, evt.tier, evt.domain)
      const size = getSeveritySize(evt.severity)

      const billboard = billboards.add({
        image: sprite,
        position: Cesium.Cartesian3.fromDegrees(evt.lng, evt.lat, altitude),
        width: size,
        height: size,
        color: Cesium.Color.WHITE.withAlpha(evt.opacity),
        disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(400_000, 35_000_000),
      })

      eventBillboardMapRef.current.set(evt.id, { billboard, event: evt, baseSize: size })
    }

    viewer.scene.primitives.add(billboards)
    eventBillboardsRef.current = billboards
    viewer.scene.requestRender()
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let destroyed = false

    async function init() {
      if (ION_TOKEN) {
        Cesium.Ion.defaultAccessToken = ION_TOKEN
      }

      // ── Get effective quality setting (overrides > tier default) ──
      const eff = (key) => {
        const st = useAtlasStore.getState()
        if (key in st.qualityOverrides) return st.qualityOverrides[key]
        const tier = QUALITY_TIERS[st.resolvedTier] || QUALITY_TIERS.high
        return typeof tier[key] === 'function' ? tier[key]() : tier[key]
      }

      const viewer = new Cesium.Viewer(container, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        creditContainer: document.createElement('div'),
        scene3DOnly: true,
        shouldAnimate: true,
        msaaSamples: eff('msaa'),
        useBrowserRecommendedResolution: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      })

      if (destroyed) {
        viewer.destroy()
        return
      }
      viewerRef.current = viewer

      // Auto-rotate: respect Settings → Auto-Rotate (not a hard-coded default)
      {
        const ar = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        effectiveAutoRotateRef.current = ar
        idleSpinGateRef.current = ar
      }

      // Sync clock to current time so sun/terminator match real world (and Mission Time)
      viewer.clock.currentTime = Cesium.JulianDate.now()
      viewer.clock.shouldAnimate = true

      // --- Base imagery: Cesium ion for photorealistic globe, or fallback ---
      if (ION_TOKEN) {
        try {
          viewer.imageryLayers.removeAll()
          const worldImagery = await Cesium.createWorldImageryAsync({
            style: Cesium.IonWorldImageryStyle.AERIAL,
          })
          if (!destroyed) viewer.imageryLayers.addImageryProvider(worldImagery)
        } catch {
          if (!destroyed) viewer.imageryLayers.addImageryProvider(await Cesium.createWorldImageryAsync())
        }
      } else {
        try {
          viewer.imageryLayers.removeAll()
          const provider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          )
          if (!destroyed) viewer.imageryLayers.addImageryProvider(provider)
        } catch {
          viewer.imageryLayers.addImageryProvider(
            new Cesium.TileMapServiceImageryProvider({
              url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
            }),
          )
        }
      }

      // --- Terrain (quality-dependent) ---
      if (ION_TOKEN && eff('terrain')) {
        try {
          const terrain = await Cesium.createWorldTerrainAsync({
            requestWaterMask: true,
            requestVertexNormals: true,
          })
          if (!destroyed) {
            viewer.terrainProvider = terrain
            layerRefs.current.terrainProvider = terrain
          }
        } catch {
          /* ellipsoid fallback */
        }
      }

      if (destroyed) return

      // ---------------------------------------------------------------
      //  Globe rendering
      // ---------------------------------------------------------------
      const { scene } = viewer
      const globe = scene.globe

      globe.enableLighting = true
      globe.showGroundAtmosphere = true
      // Ensure globe occlusion works for markers/labels.
      globe.depthTestAgainstTerrain = true
      globe.backFaceCulling = true

      // Softer limb: lower intensity and scale heights for gradual fade into space (globe.gl-style)
      globe.atmosphereLightIntensity = 12.0
      globe.atmosphereRayleighScaleHeight = 12000
      globe.atmosphereMieScaleHeight = 5000

      // ---------------------------------------------------------------
      //  Sun — drives day/night; position follows viewer.clock (shouldAnimate: true)
      // ---------------------------------------------------------------
      scene.light = new Cesium.SunLight({
        color: Cesium.Color.fromCssColorString('#fffaf5'),
        intensity: 1.7,
      })
      if (scene.sun) {
        scene.sun.show = true
        scene.sun.glowFactor = 0.95
      }
      if (scene.moon) {
        scene.moon.show = true
      }

      // Sky atmosphere — softer edge, seamless transition into space
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = true
        scene.skyAtmosphere.perFragmentAtmosphere = eff('atmosphere') === 'fragment'
        scene.skyAtmosphere.brightnessShift = -0.08
        scene.skyAtmosphere.saturationShift = 0.0
        scene.skyAtmosphere.atmosphereLightIntensity = 28.0
        scene.skyAtmosphere.atmosphereRayleighScaleHeight = 14000
        scene.skyAtmosphere.atmosphereMieScaleHeight = 5000
      }

      // ---------------------------------------------------------------
      //  Space background — Cesium default starfield (Tycho-based)
      // ---------------------------------------------------------------
      viewer.scene.skyBox = Cesium.SkyBox.createEarthSkyBox()

      // ---------------------------------------------------------------
      //  Atmosphere — ground/sky (softer limb, less contrast at edge)
      // ---------------------------------------------------------------
      scene.atmosphere.dynamicLighting =
        Cesium.DynamicAtmosphereLightingType.SUNLIGHT
      scene.atmosphere.lightIntensity = 6.0
      scene.atmosphere.rayleighCoefficient = new Cesium.Cartesian3(4.0e-6, 10.0e-6, 22.0e-6)
      scene.atmosphere.rayleighScaleHeight = 12000.0
      scene.atmosphere.mieCoefficient = new Cesium.Cartesian3(8e-6, 8e-6, 8e-6)
      scene.atmosphere.mieScaleHeight = 4000.0
      scene.atmosphere.mieAnisotropy = 0.76
      scene.atmosphere.hueShift = 0.0
      scene.atmosphere.brightnessShift = -0.06
      scene.atmosphere.saturationShift = 0.0

      // ---------------------------------------------------------------
      //  Fog — blends distant terrain into the atmosphere (horizon haze)
      // ---------------------------------------------------------------
      scene.fog.enabled = eff('fog')
      scene.fog.density = 0.0006
      scene.fog.maxHeight = 60_000_000.0
      // Slightly higher floor so the night limb isn’t a pure black smear next to space
      scene.fog.minimumBrightness = 0.045
      scene.fog.heightScalar = 0.001
      scene.fog.heightFalloff = 0.59
      scene.fog.visualDensityScalar = 0.15
      scene.fog.screenSpaceErrorFactor = 2.0
      scene.fog.renderable = true

      scene.highDynamicRange = true

      // ---------------------------------------------------------------
      //  Resolution & quality
      // ---------------------------------------------------------------
      globe.maximumScreenSpaceError = eff('maxScreenSpaceError')
      globe.tileCacheSize = 1000
      globe.preloadAncestors = true
      viewer.resolutionScale = eff('resolutionScale')

      // ---------------------------------------------------------------
      //  Photorealistic 3D Tiles (ion) — lazy-loaded via requestIdleCallback
      // ---------------------------------------------------------------
      let photorealisticTilesetRef = null
      if (ION_TOKEN && eff('tiles3d')) {
        const loadTiles = async () => {
          try {
            const photorealisticTileset = await Cesium.createGooglePhotorealistic3DTileset()
            if (!destroyed) {
              photorealisticTileset.maximumScreenSpaceError = 16
              photorealisticTileset.show = false
              photorealisticTilesetRef = photorealisticTileset
              layerRefs.current.tiles3d = photorealisticTileset
              viewer.scene.primitives.add(photorealisticTileset)
              scene.requestRender()
            }
          } catch {
            /* Photorealistic 3D Tiles unavailable */
          }
        }
        // Defer to after interactive
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(loadTiles)
        } else {
          setTimeout(loadTiles, 2000)
        }
      }

      // ---------------------------------------------------------------
      //  Labels overlay — cities, countries, oceans
      // ---------------------------------------------------------------
      let labelsLayerRef = null
      if (eff('labels')) {
        try {
          const labelsProvider = new Cesium.UrlTemplateImageryProvider({
            url: 'https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}@2x.png',
            maximumLevel: 18,
            credit: 'CartoDB',
          })
          const labelsLayer =
            viewer.imageryLayers.addImageryProvider(labelsProvider)
          labelsLayer.alpha = 1.0
          labelsLayer.brightness = 2.0
          labelsLayer.contrast = 1.5
          labelsLayer.dayAlpha = 1.0
          labelsLayer.nightAlpha = 0.55
          labelsLayerRef = labelsLayer
          layerRefs.current.labelsLayer = labelsLayer
        } catch {
          /* labels unavailable */
        }
      }

      // ---------------------------------------------------------------
      //  Night lights — NASA Black Marble (city glow) over dimmed day imagery
      //  • Too little base nightAlpha → flat navy “void”; too much → washes out lights.
      //  • Ion 3812, else GIBS REST WMTS. Markers are separate primitives.
      // ---------------------------------------------------------------
      const nightLayerOpts = {
        show: true,
        alpha: 1.0,
        dayAlpha: 0.0,
        nightAlpha: 1.0,
        brightness: 2.2,
        contrast: 1.3,
        saturation: 1.18,
        // Slightly lift shadows so coasts / cities aren’t a solid blue slab
        gamma: 0.86,
      }

      let lightsLayer = null
      if (eff('nightLights')) {
        const addNightLayer = (layer) => {
          if (destroyed || !layer) return
          viewer.imageryLayers.add(layer)
          try {
            viewer.imageryLayers.raiseToTop(layer)
          } catch {
            /* ignore */
          }
          lightsLayer = layer
        }

        if (ION_TOKEN) {
          try {
            const ionLayer = await Cesium.ImageryLayer.fromProviderAsync(
              Cesium.IonImageryProvider.fromAssetId(3812),
              nightLayerOpts,
            )
            addNightLayer(ionLayer)
          } catch (e) {
            console.warn('ATLAS: Ion Earth at Night / Black Marble (3812) failed:', e?.message || e)
          }
        }

        if (!lightsLayer) {
          try {
            const gibs = new Cesium.WebMapTileServiceImageryProvider({
              url:
                'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/GoogleMapsCompatible_Level9/{TileMatrix}/{TileRow}/{TileCol}.jpg',
              layer: 'VIIRS_Black_Marble',
              style: 'default',
              format: 'image/jpeg',
              tileMatrixSetID: 'GoogleMapsCompatible_Level9',
              maximumLevel: 8,
              credit: 'NASA GIBS — VIIRS Black Marble',
            })
            const gibsLayer = new Cesium.ImageryLayer(gibs, nightLayerOpts)
            addNightLayer(gibsLayer)
          } catch (e) {
            console.warn('ATLAS: GIBS Black Marble (REST WMTS) failed:', e?.message || e)
          }
        }

        if (lightsLayer) {
          layerRefs.current.lightsLayer = lightsLayer
          const baseLayer = viewer.imageryLayers.get(0)
          if (baseLayer && baseLayer !== lightsLayer) {
            baseLayer.dayAlpha = 1.0
            // Blend: keep enough base texture on the night side for land/ocean read-through
            // (0.14 looked like a dead flat navy). ~0.45 matches globe.gl-style balance with BM.
            baseLayer.nightAlpha = 0.45
          }
        }
      }

      // ---------------------------------------------------------------
      //  Country borders — lazy-loaded via requestIdleCallback
      // ---------------------------------------------------------------
      const loadBorders = async () => {
        try {
          const borders = await Cesium.GeoJsonDataSource.load(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson',
            {
              stroke: Cesium.Color.BLACK.withAlpha(0.25),
              strokeWidth: 0.6,
              fill: Cesium.Color.TRANSPARENT,
              markerSize: 0,
            },
          )
          if (!destroyed) {
            viewer.dataSources.add(borders)
            scene.requestRender()
          }
        } catch { /* borders unavailable */ }
      }

      const loadStates = async () => {
        try {
          const states = await Cesium.GeoJsonDataSource.load(
            'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson',
            {
              stroke: Cesium.Color.BLACK.withAlpha(0.15),
              strokeWidth: 0.35,
              fill: Cesium.Color.TRANSPARENT,
              markerSize: 0,
            },
          )
          if (!destroyed) {
            viewer.dataSources.add(states)
            scene.requestRender()
          }
        } catch { /* state borders unavailable */ }
      }

      // Defer GeoJSON loads to after globe is interactive
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(loadBorders)
        requestIdleCallback(loadStates)
      } else {
        setTimeout(loadBorders, 3000)
        setTimeout(loadStates, 4000)
      }

      // ---------------------------------------------------------------
      //  Permanent globe layers (v4.0)
      // ---------------------------------------------------------------
      const loadPermanentLayers = () => {
        if (destroyed) return

        // Maritime chokepoints — white diamond markers, always visible
        for (const cp of MARITIME_CHOKEPOINTS) {
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(cp.lng, cp.lat, 0),
            billboard: {
              image: (() => {
                const c = document.createElement('canvas')
                c.width = 24; c.height = 24
                const ctx = c.getContext('2d')
                ctx.translate(12, 12); ctx.rotate(Math.PI / 4)
                ctx.fillStyle = 'rgba(255,255,255,0.8)'
                ctx.fillRect(-6, -6, 12, 12)
                ctx.strokeStyle = 'rgba(255,255,255,0.4)'
                ctx.lineWidth = 1; ctx.strokeRect(-6, -6, 12, 12)
                return c
              })(),
              width: 14, height: 14,
              disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
            },
            label: {
              text: cp.name.toUpperCase(),
              font: '9px JetBrains Mono',
              fillColor: Cesium.Color.WHITE.withAlpha(0.5),
              outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 20_000_000),
            },
          })
        }

        // Nuclear facility markers — dim crimson icons
        for (const nf of NUCLEAR_FACILITIES) {
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(nf.lng, nf.lat, 0),
            billboard: {
              image: (() => {
                const c = document.createElement('canvas')
                c.width = 20; c.height = 20
                const ctx = c.getContext('2d')
                ctx.beginPath()
                ctx.arc(10, 10, 6, 0, Math.PI * 2)
                ctx.fillStyle = 'rgba(220, 50, 50, 0.25)'
                ctx.fill()
                ctx.strokeStyle = 'rgba(220, 50, 50, 0.4)'
                ctx.lineWidth = 1; ctx.stroke()
                ctx.fillStyle = 'rgba(220, 50, 50, 0.4)'
                ctx.font = '8px sans-serif'
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                ctx.fillText('☢', 10, 10)
                return c
              })(),
              width: 12, height: 12,
              color: Cesium.Color.WHITE.withAlpha(0.25),
              disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15_000_000),
            },
          })
        }

        // Submarine cable routes — dim teal polylines
        for (const cable of SUBMARINE_CABLE_PATHS) {
          const positions = cable.points.flatMap(([lng, lat]) => [lng, lat])
          viewer.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(positions),
              width: 1,
              material: new Cesium.ColorMaterialProperty(
                Cesium.Color.fromCssColorString('#00cfff').withAlpha(0.12)
              ),
              clampToGround: true,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25_000_000),
            },
          })
        }

        scene.requestRender()
      }

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(loadPermanentLayers)
      } else {
        setTimeout(loadPermanentLayers, 5000)
      }

      // ---------------------------------------------------------------
      //  Camera constraints
      // ---------------------------------------------------------------
      const ssc = scene.screenSpaceCameraController
      ssc.minimumZoomDistance = 500_000
      ssc.maximumZoomDistance = 35_000_000

      // ---------------------------------------------------------------
      //  Post-processing — bloom (reduced stepSize for perf)
      // ---------------------------------------------------------------
      const bloom = scene.postProcessStages.bloom
      bloom.enabled = eff('bloom')
      bloom.uniforms.glowOnly = false
      bloom.uniforms.contrast = 80
      bloom.uniforms.brightness = -0.1
      bloom.uniforms.delta = 1.0
      bloom.uniforms.sigma = 5.0
      bloom.uniforms.stepSize = 1.5
      layerRefs.current.bloom = bloom

      // ---------------------------------------------------------------
      //  Post-processing — vignette (quality-dependent)
      // ---------------------------------------------------------------
      let vignetteStage = null
      if (eff('vignette')) {
        vignetteStage = new Cesium.PostProcessStage({
          name: 'atlas_vignette',
          fragmentShader: `
            uniform sampler2D colorTexture;
            in vec2 v_textureCoordinates;
            void main() {
              vec4 color = texture(colorTexture, v_textureCoordinates);
              vec2 uv  = v_textureCoordinates - 0.5;
              float vig = 1.0 - dot(uv, uv) * 1.0;
              vig = clamp(vig, 0.0, 1.0);
              out_FragColor = vec4(color.rgb * vig, color.a);
            }
          `,
        })
        scene.postProcessStages.add(vignetteStage)
        layerRefs.current.vignette = vignetteStage
      }

      // ---------------------------------------------------------------
      //  Camera altitude → zoom level (throttled)
      // ---------------------------------------------------------------
      let lastVisibilityUpdate = 0
      viewer.camera.percentageChanged = 0.05
      viewer.camera.changed.addEventListener(() => {
        if (destroyed) return
        const height = viewer.camera.positionCartographic.height
        const maxH = 25_000_000
        const minH = 500_000
        const clamped = Math.max(minH, Math.min(maxH, height))
        const zoom = (clamped - minH) / (maxH - minH)
        setZoomLevel(zoom)

        // Throttle visibility updates to avoid expensive work per-frame
        const now = performance.now()
        if (now - lastVisibilityUpdate >= VISIBILITY_THROTTLE_MS) {
          lastVisibilityUpdate = now
          updateVisibility(viewer)
        }
      })

      // ---------------------------------------------------------------
      //  Shared pulse animation + auto-rotation via single onTick
      //  (replaces per-entity CallbackProperty — one update for ALL markers)
      // ---------------------------------------------------------------
      let lastPulseUpdate = 0
      viewer.clock.onTick.addEventListener((clock) => {
        if (destroyed) return

        // Show Photorealistic 3D Tiles only when zoomed in
        if (photorealisticTilesetRef) {
          const h = viewer.camera.positionCartographic?.height ?? 0
          photorealisticTilesetRef.show = h < 5_000_000
        }

        // Fade labels when zoomed far
        if (labelsLayerRef) {
          const h = viewer.camera.positionCartographic?.height ?? 0
          const fadeStart = 6_000_000
          const fadeEnd = 14_000_000
          let t = (h - fadeStart) / (fadeEnd - fadeStart)
          t = Math.min(1, Math.max(0, t))
          labelsLayerRef.show = t < 1
          labelsLayerRef.alpha = 1 - t
        }

        // Pulse animation: update ALL points at once instead of per-entity CallbackProperty
        const now = performance.now()
        if (now - lastPulseUpdate >= PULSE_THROTTLE_MS) {
          lastPulseUpdate = now
          const seconds = Cesium.JulianDate.toDate(clock.currentTime).getTime() / 1000
          const pulseT = 0.5 + 0.5 * Math.sin(seconds * DOT_PULSE_SPEED)
          const size = DOT_SIZE_MIN + pulseT * (DOT_SIZE_MAX - DOT_SIZE_MIN)
          const alpha = DOT_ALPHA_MIN + pulseT * (DOT_ALPHA_MAX - DOT_ALPHA_MIN)

          for (const { billboard } of pointMapRef.current.values()) {
            if (billboard.show) {
              const s = NEWS_MARKER_PX * (size / DOT_SIZE_MIN)
              billboard.width = s
              billboard.height = s
              billboard.color = Cesium.Color.WHITE.withAlpha(alpha)
            }
          }

          // Event billboard pulse
          const fastPulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 2)
          const slowPulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 0.5)
          let animatedCount = 0
          const MAX_ANIMATED = 20
          for (const { billboard, event, baseSize } of eventBillboardMapRef.current.values()) {
            if (!billboard.show) continue
            const anim = getAnimationState(event.timestamp)
            if (anim === 'static') continue
            if (animatedCount >= MAX_ANIMATED) continue
            animatedCount++
            const pulse = anim === 'fast' ? fastPulse : slowPulse
            const scale = 1 + pulse * 0.15
            billboard.width = baseSize * scale
            billboard.height = baseSize * scale
          }
        }

        // Auto-rotate (only if user enabled Auto-Rotate in Settings, and idle gate open)
        if (
          effectiveAutoRotateRef.current &&
          idleSpinGateRef.current &&
          scene.mode === Cesium.SceneMode.SCENE3D
        ) {
          viewer.camera.rotateRight(0.0004)
        }

        scene.requestRender()
      })

      // ---------------------------------------------------------------
      //  Interaction — hover / click / drag
      // ---------------------------------------------------------------
      const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas)
      let lastPickTime = 0

      function resetIdleTimer() {
        if (!effectiveAutoRotateRef.current) return
        idleSpinGateRef.current = false
        clearTimeout(idleTimer.current)
        idleTimer.current = setTimeout(() => {
          idleSpinGateRef.current = true
        }, 6000)
      }

      function findPickedEvent(picked) {
        if (!Cesium.defined(picked)) return null
        const bbCollection = eventBillboardsRef.current
        if (bbCollection && picked.collection === bbCollection) {
          const pickedBB = picked.primitive
          for (const { billboard, event } of eventBillboardMapRef.current.values()) {
            if (billboard === pickedBB) return event
          }
        }
        return null
      }

      handler.setInputAction((movement) => {
        resetIdleTimer()
        const now = performance.now()
        if (now - lastPickTime < 100) return
        lastPickTime = now
        const canvasPosition = movement.endPosition
        const picked = scene.pick(canvasPosition)

        // Check event billboard picks first
        const hoveredEvent = findPickedEvent(picked)
        if (hoveredEvent) {
          const rect = container.getBoundingClientRect()
          const screenX = rect.left + canvasPosition.x
          const screenY = rect.top + canvasPosition.y
          setHoveredMarker({
            ...hoveredEvent,
            _screenX: screenX,
            _screenY: screenY,
            _isEvent: true,
          })
          container.style.cursor = 'pointer'
          return
        }

        // Check news BillboardCollection picks
        let hoveredItem = null
        if (Cesium.defined(picked)) {
          const collection = pointCollectionRef.current
          if (collection && picked.collection === collection) {
            const pickedBB = picked.primitive
            for (const { billboard, item } of pointMapRef.current.values()) {
              if (billboard === pickedBB) { hoveredItem = item; break }
            }
          }
          if (!hoveredItem && picked.id?.properties?.newsItem) {
            hoveredItem = picked.id.properties.newsItem.getValue()
          }
        }

        if (hoveredItem) {
          const rect = container.getBoundingClientRect()
          const screenX = rect.left + canvasPosition.x
          const screenY = rect.top + canvasPosition.y
          setHoveredMarker({ ...hoveredItem, _screenX: screenX, _screenY: screenY })
          container.style.cursor = 'pointer'
        } else {
          setHoveredMarker(null)
          container.style.cursor = 'grab'
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

      handler.setInputAction((click) => {
        const picked = scene.pick(click.position)

        // Check event billboard picks first
        const clickedEvent = findPickedEvent(picked)
        if (clickedEvent) {
          setSelectedEvent(clickedEvent)
          setSelectedMarker(null)
          const camera = viewer.camera
          const current = camera.positionCartographic
          const currentHeight = current?.height ?? 10_000_000
          const targetHeight = Math.max(600_000, currentHeight * 0.4)
          camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(clickedEvent.lng, clickedEvent.lat, targetHeight),
            orientation: {
              heading: camera.heading,
              pitch: Cesium.Math.clamp(camera.pitch, Cesium.Math.toRadians(-80), Cesium.Math.toRadians(-20)),
              roll: 0,
            },
            duration: 1.4,
          })
          return
        }

        // Check news marker picks (billboards)
        let clickedItem = null
        if (Cesium.defined(picked)) {
          const collection = pointCollectionRef.current
          if (collection && picked.collection === collection) {
            const pickedBB = picked.primitive
            for (const { billboard, item } of pointMapRef.current.values()) {
              if (billboard === pickedBB) { clickedItem = item; break }
            }
          }
          if (!clickedItem && picked.id?.properties?.newsItem) {
            clickedItem = picked.id.properties.newsItem.getValue()
          }
        }

        if (clickedItem) {
          setSelectedMarker(clickedItem)
          setSelectedEvent(null)
          const camera = viewer.camera
          const current = camera.positionCartographic
          const currentHeight = current?.height ?? 10_000_000
          const targetHeight = Math.max(600_000, currentHeight * 0.4)
          const clampedPitch = Cesium.Math.clamp(
            camera.pitch,
            Cesium.Math.toRadians(-80),
            Cesium.Math.toRadians(-20),
          )

          camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              clickedItem.lng,
              clickedItem.lat,
              targetHeight,
            ),
            orientation: {
              heading: camera.heading,
              pitch: clampedPitch,
              roll: 0,
            },
            duration: 1.4,
          })
          return
        }

        // If a news card or event panel is open and the user clicks away, dismiss
        const store = useAtlasStore.getState()
        if (store.selectedMarker || store.selectedEvent) {
          setSelectedMarker(null)
          setSelectedEvent(null)
          return
        }

        // Fallback: click on the globe itself → Street View at that location
        let cartesian = viewer.scene.pickPosition(click.position)
        if (!Cesium.defined(cartesian)) {
          const ray = viewer.camera.getPickRay(click.position)
          if (ray) {
            cartesian = viewer.scene.globe.pick(ray, viewer.scene)
          }
        }
        if (!Cesium.defined(cartesian)) return

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
        const lat = Cesium.Math.toDegrees(cartographic.latitude)
        const lng = Cesium.Math.toDegrees(cartographic.longitude)
        openStreetView({ lat, lng, source: 'globe' })
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      handler.setInputAction(() => {
        container.style.cursor = 'grabbing'
        resetIdleTimer()
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

      handler.setInputAction(() => {
        container.style.cursor = 'grab'
      }, Cesium.ScreenSpaceEventType.LEFT_UP)

      handler.setInputAction(() => {
        resetIdleTimer()
      }, Cesium.ScreenSpaceEventType.WHEEL)

      const viewCenter = getTimezoneViewCenter()

      // ---------------------------------------------------------------
      //  Reset view callback (used by Header button)
      // ---------------------------------------------------------------
      useAtlasStore.getState().setOnResetView(() => {
        if (viewer.isDestroyed()) return
        const center = getTimezoneViewCenter()
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, 18_000_000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
          duration: 1.5,
          easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        })
        idleSpinGateRef.current = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        useAtlasStore.getState().setSelectedMarker(null)
      })

      // ---------------------------------------------------------------
      //  Cinematic intro
      // ---------------------------------------------------------------
      const skipIntro = useAtlasStore.getState().skipCesiumIntro
      if (skipIntro) {
        useAtlasStore.getState().setSkipCesiumIntro(false)
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(viewCenter.lng, viewCenter.lat, 18_000_000),
        })
      } else {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(viewCenter.lng, viewCenter.lat, 50_000_000),
        })
        setTimeout(() => {
          if (destroyed) return
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(viewCenter.lng, viewCenter.lat, 18_000_000),
            duration: 3.0,
            easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
          })
        }, 300)
      }

      // News markers: single source of truth is the `newsItems` useEffect below (content signature).
      // Avoid duplicate rebuildMarkers here — async init order was racing the effect and clearing markers.

      // Signal ready after first frame so App can hide starfield with no gap
      const notifyReady = onGlobeReadyRef.current
      if (typeof notifyReady === 'function') {
        let removeListener
        const callback = () => {
          removeListener()
          if (!destroyed && onGlobeReadyRef.current) onGlobeReadyRef.current()
        }
        removeListener = viewer.scene.postRender.addEventListener(callback)
      }

      // ---------------------------------------------------------------
      //  FPS auto-detection (only when tier = 'auto')
      // ---------------------------------------------------------------
      if (useAtlasStore.getState().qualityTier === 'auto') {
        detectQualityTier().then((detected) => {
          if (!destroyed) {
            useAtlasStore.getState().setResolvedTier(detected)
            console.log(`[Atlas] Auto-detected quality tier: ${detected}`)
          }
        })
      }
    }

    init()

    const resizeObserver = new ResizeObserver(() => {
      const v = viewerRef.current
      if (v && !v.isDestroyed()) v.resize()
    })
    resizeObserver.observe(container)

    return () => {
      destroyed = true
      resizeObserver.disconnect()
      clearTimeout(idleTimer.current)
      pointMapRef.current.clear()
      pointCollectionRef.current = null
      const viewer = viewerRef.current
      viewerRef.current = null
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── React to quality setting changes at runtime ───
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const eff = (key) => {
      const st = useAtlasStore.getState()
      if (key in st.qualityOverrides) return st.qualityOverrides[key]
      const tier = QUALITY_TIERS[st.resolvedTier] || QUALITY_TIERS.high
      return typeof tier[key] === 'function' ? tier[key]() : tier[key]
    }

    const scene = viewer.scene

    // Resolution
    viewer.resolutionScale = eff('resolutionScale')

    // Bloom
    if (scene.postProcessStages.bloom) {
      scene.postProcessStages.bloom.enabled = eff('bloom')
    }

    // Vignette
    if (layerRefs.current.vignette) {
      layerRefs.current.vignette.enabled = eff('vignette')
    }

    // Fog
    scene.fog.enabled = eff('fog')

    // Atmosphere
    if (scene.skyAtmosphere) {
      const atm = eff('atmosphere')
      scene.skyAtmosphere.show = atm !== 'off'
      scene.skyAtmosphere.perFragmentAtmosphere = atm === 'fragment'
    }

    // Night lights
    if (layerRefs.current.lightsLayer) {
      layerRefs.current.lightsLayer.show = eff('nightLights')
    }

    // Labels
    if (layerRefs.current.labelsLayer) {
      layerRefs.current.labelsLayer.show = eff('labels')
    }

    // 3D Tiles
    if (layerRefs.current.tiles3d) {
      layerRefs.current.tiles3d.show = eff('tiles3d')
    }

    // Screen space error
    scene.globe.maximumScreenSpaceError = eff('maxScreenSpaceError')

    // Auto-rotate — keep in sync when user toggles Settings or tier changes
    const ar = eff('autoRotate')
    effectiveAutoRotateRef.current = ar
    idleSpinGateRef.current = ar
    if (!ar) clearTimeout(idleTimer.current)

    scene.requestRender()
  }, [resolvedTier, qualityOverrides]) // eslint-disable-line react-hooks/exhaustive-deps

  // News markers: rebuild when article *set* changes (signature), not array reference; toggle on category-only changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const filtered = newsItems.filter((item) => activeCategories.has(item.category))
    const plottableCount = filtered.filter((i) => i.lat != null && i.lng != null).length

    const contentSig = getNewsContentSignature(newsItems)
    const catSig = getActiveCategoriesSignature(activeCategories)

    const contentChanged = lastNewsContentSigRef.current !== contentSig
    const categoriesOnlyChanged =
      !contentChanged && lastActiveCategoriesSigRef.current !== catSig

    lastNewsContentSigRef.current = contentSig
    lastActiveCategoriesSigRef.current = catSig

    const mapEmptyButShouldShow = plottableCount > 0 && pointMapRef.current.size === 0

    if (contentChanged || mapEmptyButShouldShow) {
      rebuildMarkers(viewer, filtered)
    } else if (categoriesOnlyChanged) {
      const filteredIds = new Set(filtered.map((i) => i.id))
      const map = pointMapRef.current
      for (const [id, { billboard }] of map) {
        billboard.show = filteredIds.has(id)
      }
      updateVisibility(viewer)
    }

    viewer.scene.requestRender()
  }, [newsItems, activeCategories]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to EventBus events — rebuild event billboard markers + enclosures
  const enclosureEntitiesRef = useRef([])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return
    if (events.length === 0 && eventBillboardMapRef.current.size === 0) return

    rebuildEventMarkers(viewer, events)

    // Remove old enclosure entities
    for (const entity of enclosureEntitiesRef.current) {
      viewer.entities.remove(entity)
    }
    enclosureEntitiesRef.current = []

    // Build cluster enclosures
    const clusters = clusterEvents(events, 200, 5)
    for (const cluster of clusters) {
      const tierColor = TIER_COLORS[cluster.tier] || '#1a90ff'
      const color = Cesium.Color.fromCssColorString(tierColor)

      // Build convex hull from cluster events
      const points = cluster.events.map(e => [e.lng, e.lat])
      const hull = convexHull(points)
      if (hull.length < 3) continue

      const positions = hull.flatMap(([lng, lat]) => [lng, lat])

      const entity = viewer.entities.add({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
          material: color.withAlpha(0.12),
          outline: true,
          outlineColor: color.withAlpha(0.6),
          outlineWidth: 2,
          height: 0,
        },
      })
      enclosureEntitiesRef.current.push(entity)

      // Add count badge at centroid
      const badge = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(cluster.centroid.lng, cluster.centroid.lat, 0),
        label: {
          text: String(cluster.count),
          font: 'bold 12px JetBrains Mono',
          fillColor: Cesium.Color.WHITE,
          outlineColor: color.withAlpha(0.8),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: GLOBE_BILLBOARD_DISABLE_DEPTH_TEST_DISTANCE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25_000_000),
        },
      })
      enclosureEntitiesRef.current.push(badge)
    }

    viewer.scene.requestRender()
  }, [events, activeDomains, severityFloor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0"
      style={{ cursor: 'grab' }}
    />
  )
}
