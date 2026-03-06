import { useEffect, useRef, useMemo } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES, getCategoryColor } from '../../utils/categoryColors'
import { getRegionKey, getTimezoneViewCenter } from '../../utils/geo'
import { MOCK_NEWS } from '../../utils/mockData'
import { QUALITY_TIERS, detectQualityTier } from '../../config/qualityTiers'

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

// Throttle intervals (ms) for expensive per-frame work
const VISIBILITY_THROTTLE_MS = 150
const PULSE_THROTTLE_MS = 50

function pointInRectangle(lat, lng, rect) {
  if (!rect) return false
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return lngRad >= rect.west && lngRad <= rect.east && latRad >= rect.south && latRad <= rect.north
}

export default function CesiumGlobe({ onGlobeReady }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const autoRotate = useRef(true)
  const idleTimer = useRef(null)
  const onGlobeReadyRef = useRef(onGlobeReady)
  onGlobeReadyRef.current = onGlobeReady

  // PointPrimitiveCollection refs (replaces individual entities)
  const pointCollectionRef = useRef(null)
  const pointMapRef = useRef(new Map()) // id -> { point, item }
  const allItemsRef = useRef([])        // for visibility logic

  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setHoveredMarker = useAtlasStore((s) => s.setHoveredMarker)
  const newsItems = useAtlasStore((s) => s.newsItems)
  const activeCategories = useAtlasStore((s) => s.activeCategories)
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
    // Clear existing collection
    if (pointCollectionRef.current) {
      viewer.scene.primitives.remove(pointCollectionRef.current)
    }
    pointMapRef.current.clear()
    allItemsRef.current = items

    // Create new PointPrimitiveCollection for all markers at once
    const collection = new Cesium.PointPrimitiveCollection()
    const altitude = 15_000

    for (const item of items) {
      if (item.lat == null || item.lng == null) continue

      const cssColor = getCategoryColor(item.category)
      const baseColor = toCesiumColor(cssColor)

      const point = collection.add({
        position: Cesium.Cartesian3.fromDegrees(item.lng, item.lat, altitude),
        pixelSize: DOT_SIZE_MIN,
        color: baseColor.withAlpha(DOT_ALPHA_MIN),
        show: true,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(400_000, 35_000_000),
      })

      pointMapRef.current.set(item.id, { point, item, baseColor })
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
      for (const [id, { point }] of map) {
        point.show = topIds.has(id)
      }
    } else {
      let viewRect = null
      try {
        viewRect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid)
      } catch {
        viewRect = null
      }
      const inView = viewRect != null
      for (const { point, item } of map.values()) {
        point.show = inView ? pointInRectangle(item.lat, item.lng, viewRect) : true
      }
    }
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
      globe.depthTestAgainstTerrain = false
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
      scene.fog.minimumBrightness = 0.03
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
      //  Night lights (globe.gl-style) — NASA Black Marble
      // ---------------------------------------------------------------
      let lightsLayer = null
      if (ION_TOKEN && eff('nightLights')) {
        try {
          const blackMarbleProvider = await Cesium.IonImageryProvider.fromAssetId(3812)
          if (!destroyed) {
            lightsLayer = viewer.imageryLayers.addImageryProvider(blackMarbleProvider)
          }
        } catch (e) {
          console.warn('Cesium ion Black Marble (3812) failed, using NASA GIBS fallback:', e?.message || e)
        }
      }
      if (!lightsLayer && eff('nightLights')) {
        try {
          const gibsProvider = new Cesium.WebMapTileServiceImageryProvider({
            url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi',
            layer: 'VIIRS_Black_Marble',
            style: 'default',
            format: 'image/jpeg',
            tileMatrixSetID: 'GoogleMapsCompatible_Level9',
            maximumLevel: 8,
            credit: 'NASA GIBS',
          })
          lightsLayer = viewer.imageryLayers.addImageryProvider(gibsProvider)
        } catch (e) {
          console.warn('Night lights unavailable:', e?.message || e)
        }
      }
      if (lightsLayer) {
        lightsLayer.show = true
        lightsLayer.alpha = 1.0
        lightsLayer.brightness = 2.5
        lightsLayer.contrast = 1.5
        lightsLayer.dayAlpha = 0.0
        lightsLayer.nightAlpha = 1.0
        layerRefs.current.lightsLayer = lightsLayer
        const baseLayer = viewer.imageryLayers.get(0)
        if (baseLayer && baseLayer !== lightsLayer) {
          baseLayer.dayAlpha = 1.0
          baseLayer.nightAlpha = 0.4
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

          for (const { point, baseColor } of pointMapRef.current.values()) {
            if (point.show) {
              point.pixelSize = size
              point.color = baseColor.withAlpha(alpha)
            }
          }
        }

        // Auto-rotate
        if (autoRotate.current && scene.mode === Cesium.SceneMode.SCENE3D) {
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
        autoRotate.current = false
        clearTimeout(idleTimer.current)
        idleTimer.current = setTimeout(() => {
          autoRotate.current = true
        }, 6000)
      }

      // Helper: find item from a pick result
      function findItemFromPick(picked) {
        // PointPrimitive picks return the primitive and its _index
        if (!Cesium.defined(picked) || !picked.primitive) return null
        const collection = pointCollectionRef.current
        if (!collection || picked.primitive !== collection) return null
        // We need to find which item this point belongs to
        const point = picked.primitive.get?.(picked.id)
        if (!point) return null
        for (const { point: p, item } of pointMapRef.current.values()) {
          if (p === point) return item
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

        // Check PointPrimitive collection picks
        let hoveredItem = null
        if (Cesium.defined(picked)) {
          // PointPrimitiveCollection returns picked.collection + picked.primitive
          const collection = pointCollectionRef.current
          if (collection && picked.collection === collection) {
            // picked.primitive IS the individual PointPrimitive
            const pickedPoint = picked.primitive
            for (const { point, item } of pointMapRef.current.values()) {
              if (point === pickedPoint) { hoveredItem = item; break }
            }
          }
          // Legacy entity fallback
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
        let clickedItem = null

        if (Cesium.defined(picked)) {
          const collection = pointCollectionRef.current
          if (collection && picked.collection === collection) {
            const pickedPoint = picked.primitive
            for (const { point, item } of pointMapRef.current.values()) {
              if (point === pickedPoint) { clickedItem = item; break }
            }
          }
          if (!clickedItem && picked.id?.properties?.newsItem) {
            clickedItem = picked.id.properties.newsItem.getValue()
          }
        }

        if (clickedItem) {
          setSelectedMarker(clickedItem)
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

        // If a news card is open and the user clicks away, dismiss
        const hasSelectedMarker = !!useAtlasStore.getState().selectedMarker
        if (hasSelectedMarker) {
          setSelectedMarker(null)
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
        autoRotate.current = true
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

      // ---------------------------------------------------------------
      //  Load initial markers
      // ---------------------------------------------------------------
      const store = useAtlasStore.getState()
      if (store.newsItems.length === 0) store.setNewsItems(MOCK_NEWS)
      const items =
        store.newsItems.length > 0 ? store.newsItems : MOCK_NEWS
      rebuildMarkers(viewer, items)

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

    return () => {
      destroyed = true
      clearTimeout(idleTimer.current)
      const viewer = viewerRef.current
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

    scene.requestRender()
  }, [resolvedTier, qualityOverrides]) // eslint-disable-line react-hooks/exhaustive-deps

  // React to news data / filter changes — toggle show instead of full rebuild
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const items = newsItems.length > 0 ? newsItems : MOCK_NEWS
    const filtered = items.filter((item) => activeCategories.has(item.category))

    // If the underlying data (newsItems) changed, do a full rebuild
    if (allItemsRef.current !== items && allItemsRef.current.length !== items.length) {
      rebuildMarkers(viewer, filtered)
    } else {
      // Category filter change — just toggle point.show without rebuilding
      const filteredIds = new Set(filtered.map((i) => i.id))
      const map = pointMapRef.current
      for (const [id, { point }] of map) {
        point.show = filteredIds.has(id)
      }
      updateVisibility(viewer)
    }

    viewer.scene.requestRender()
  }, [newsItems, activeCategories]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0"
      style={{ cursor: 'grab' }}
    />
  )
}
