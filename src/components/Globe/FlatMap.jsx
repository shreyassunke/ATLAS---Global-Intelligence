/**
 * FlatMap — 2D map via MapLibre GL JS. Countries use offline χ coloring;
 * US states run a live Welsh–Powell greedy demo when zoomed over CONUS (see `usStatesGreedyColoringPresentation.js`).
 */
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'
import { isMobileDevice } from '../../config/qualityTiers'
import { DIMENSION_COLORS } from '../../core/eventSchema'
import {
  applyGreedyStepToCollection,
  GREEDY_ANIM_STEP_MS,
  isMapFocusedOnUsa,
  prepareUsGreedyColoringPresentation,
} from '../../map/usStatesGreedyColoringPresentation'

const URL_COUNTRIES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson'
const URL_STATES =
  'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_1_states_provinces_shp.geojson'

/** Carto OSM labels only (countries → cities); tint baked for dark basemaps */
const BASE_LABEL_TILES = [
  'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
  'https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png',
]

/** Warm vintage palette: indices 0–2 = muted R, G, B (sRGB); then amber → mustard → teal → plum → rose */
const ATLAS_COLORS = [
  '#b8574d',
  '#6f9178',
  '#5f7a9e',
  '#c2783f',
  '#c9a03d',
  '#5f918c',
  '#8a7398',
  '#b07888',
]

/** Navy-tinted canvas; aligns with Carto dark_no_labels oceans when tiles load */
const OCEAN_BG = '#0a1426'

const DEFAULT_ZOOM = 2.5
const MIN_ZOOM = 1.5
const MAX_ZOOM = 12

function regionKeyForCountry(feat) {
  const p = feat.properties || {}
  const a3 = (p.ADM0_A3 || p.adm0_a3 || '').toString()
  if (!a3 || a3 === 'ATA' || a3 === '-99') return null
  return a3
}

function regionKeyForState(feat) {
  const p = feat.properties || {}
  if ((p.iso_a2 || p.ISO_A2 || '').toString().toUpperCase() !== 'US') return null
  const abbr = (p.postal || p.POSTAL || '').toString().toUpperCase()
  if (abbr.length === 2) return `US_${abbr}`
  const iso2 = (p.iso_3166_2 || p.ISO_3166_2 || '').toString().toUpperCase()
  const m = iso2.match(/^US-([A-Z]{2})$/i)
  if (m) return `US_${m[1].toUpperCase()}`
  return null
}

function injectColors(features, colorAssignment, keyFn) {
  const out = []
  for (const f of features) {
    const key = keyFn(f)
    if (key == null) continue
    const idx = colorAssignment[key]
    const c =
      idx != null && ATLAS_COLORS[idx] != null
        ? ATLAS_COLORS[idx]
        : ATLAS_COLORS[0]
    out.push({
      ...f,
      properties: { ...f.properties, atlas_color: c },
    })
  }
  return out
}

function buildEventFeatures(events) {
  return events
    .filter((e) => e.lat != null && e.lng != null)
    .map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: {
        color: DIMENSION_COLORS[e.dimension] || '#1a90ff',
        radius_min: Math.max(3, (e.severity || 1) * 1.5),
        radius_max: Math.max(6, (e.severity || 1) * 4),
        opacity: e.opacity ?? 0.8,
        _isEvent: true,
        _eventData: JSON.stringify(e),
      },
    }))
}

export default function FlatMap({ onGlobeReady }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onReadyRef = useRef(onGlobeReady)
  onReadyRef.current = onGlobeReady

  const events = useAtlasStore((s) => s.events)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
  const setOnResetView = useAtlasStore((s) => s.setOnResetView)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined

    let map = null
    let cancelled = false
    /** Greedy USA demo timer — cleared on unmount / leaving viewport */
    let usaGreedyAnimTimer = null

    const home = getTimezoneViewCenter()
    const center = [home.lng, home.lat]
    const pr = isMobileDevice() ? 1 : Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)

    ;(async () => {
      const [resColor, resC, resS] = await Promise.all([
        fetch('/atlas-map-coloring.json'),
        fetch(URL_COUNTRIES),
        fetch(URL_STATES),
      ])
      if (cancelled) return
      if (!resColor.ok) throw new Error(`atlas-map-coloring.json ${resColor.status}`)
      if (!resC.ok) throw new Error(`countries ${resC.status}`)
      if (!resS.ok) throw new Error(`states ${resS.status}`)

      const coloring = await resColor.json()
      const countries = await resC.json()
      const admin1 = await resS.json()
      if (cancelled) return

      const assignment = coloring.colorAssignment || {}
      const countryFeatures = injectColors(countries.features || [], assignment, regionKeyForCountry)
      const usStates = (admin1.features || [])
        .map((f) => {
          if (!regionKeyForState(f)) return null
          return f
        })
        .filter(Boolean)
      const usaGreedy = prepareUsGreedyColoringPresentation(usStates, ATLAS_COLORS)
      const usaGreedyBaselineStatesFc = structuredClone(usaGreedy.collection)

      const coloredCountries = { type: 'FeatureCollection', features: countryFeatures }
      const coloredStates = usaGreedy.collection

      let usaGreedyDone = false
      let usaGreedyWorkingFc = structuredClone(usaGreedyBaselineStatesFc)

      function onViewportForUsaGreedy(mapInstance) {
        if (cancelled || !mapInstance) return
        const focused = isMapFocusedOnUsa(mapInstance)
        if (!focused) {
          if (usaGreedyAnimTimer != null) {
            clearInterval(usaGreedyAnimTimer)
            usaGreedyAnimTimer = null
          }
          usaGreedyDone = false
          usaGreedyWorkingFc = structuredClone(usaGreedyBaselineStatesFc)
          const stOff = mapInstance.getSource('states')
          if (stOff && typeof stOff.setData === 'function') {
            stOff.setData(usaGreedyWorkingFc)
          }
          return
        }
        if (usaGreedyDone || usaGreedyAnimTimer != null) return

        usaGreedyWorkingFc = structuredClone(usaGreedyBaselineStatesFc)
        const stStart = mapInstance.getSource('states')
        if (stStart && typeof stStart.setData === 'function') {
          stStart.setData(usaGreedyWorkingFc)
        }

        let stepIdx = 0
        usaGreedyAnimTimer = setInterval(() => {
          if (cancelled || !mapRef.current) return
          if (stepIdx >= usaGreedy.steps.length) {
            clearInterval(usaGreedyAnimTimer)
            usaGreedyAnimTimer = null
            usaGreedyDone = true
            return
          }
          const step = usaGreedy.steps[stepIdx++]
          usaGreedyWorkingFc = applyGreedyStepToCollection(usaGreedyWorkingFc, step.regionId, step.colorHex)
          const st = mapRef.current.getSource('states')
          if (st && typeof st.setData === 'function') {
            st.setData(usaGreedyWorkingFc)
          }
        }, GREEDY_ANIM_STEP_MS)
      }

      if (cancelled) return

      map = new maplibregl.Map({
        container: el,
        style: {
          version: 8,
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': OCEAN_BG },
            },
          ],
        },
        center,
        zoom: DEFAULT_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxPitch: 0,
        minPitch: 0,
        pitch: 0,
        pixelRatio: pr,
        attributionControl: false,
        maplibreLogo: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
      mapRef.current = map

      map.on('load', () => {
        if (cancelled) return
        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

        map.addSource('countries', { type: 'geojson', data: coloredCountries })
        map.addSource('states', { type: 'geojson', data: coloredStates })
        map.addSource('events', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource('basemap-labels', {
          type: 'raster',
          tiles: BASE_LABEL_TILES,
          tileSize: 256,
          attribution:
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> © CARTO',
        })

        map.addLayer({
          id: 'countries-fill',
          type: 'fill',
          source: 'countries',
          paint: {
            'fill-color': ['get', 'atlas_color'],
            'fill-opacity': 0.88,
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: 'countries-line-back',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': '#040814',
            'line-opacity': 0.92,
            'line-blur': 0.25,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.4, 4, 4.5, 10, 7],
          },
        })
        map.addLayer({
          id: 'countries-line',
          type: 'line',
          source: 'countries',
          paint: {
            'line-color': 'rgba(236, 242, 255, 0.78)',
            'line-opacity': 1,
            'line-blur': 0,
            'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.85, 4, 1.35, 10, 2.35],
          },
        })
        map.addLayer({
          id: 'states-fill',
          type: 'fill',
          source: 'states',
          minzoom: 3,
          paint: {
            'fill-color': ['get', 'atlas_color'],
            'fill-opacity': 0.88,
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: 'states-line-back',
          type: 'line',
          source: 'states',
          minzoom: 3,
          paint: {
            'line-color': '#03060f',
            'line-opacity': 0.88,
            'line-blur': 0.2,
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 6, 4.2, 10, 6],
          },
        })
        map.addLayer({
          id: 'states-line',
          type: 'line',
          source: 'states',
          minzoom: 3,
          paint: {
            'line-color': 'rgba(232, 238, 252, 0.72)',
            'line-opacity': 1,
            'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.75, 7, 1.35, 11, 2.2],
          },
        })
        map.addLayer({
          id: 'basemap-labels',
          type: 'raster',
          source: 'basemap-labels',
          paint: {
            'raster-opacity': 1,
            'raster-fade-duration': 150,
          },
        })
        map.addLayer({
          id: 'events-circle',
          type: 'circle',
          source: 'events',
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              ['get', 'radius_min'],
              10,
              ['get', 'radius_max'],
            ],
            'circle-opacity': ['get', 'opacity'],
            'circle-stroke-color': 'rgba(255,255,255,0.3)',
            'circle-stroke-width': 0.8,
          },
        })

        const evSrc = map.getSource('events')
        if (evSrc && typeof evSrc.setData === 'function') {
          evSrc.setData({
            type: 'FeatureCollection',
            features: buildEventFeatures(useAtlasStore.getState().events),
          })
        }

        setOnResetView(() => {
          if (!mapRef.current) return
          mapRef.current.flyTo({ center, zoom: DEFAULT_ZOOM, duration: 1200 })
        })

        const syncUsaGreedyViewport = () => onViewportForUsaGreedy(map)
        map.on('moveend', syncUsaGreedyViewport)
        map.on('zoomend', syncUsaGreedyViewport)
        syncUsaGreedyViewport()

        onReadyRef.current?.()
      })

      const syncZoom = () => {
        if (!mapRef.current) return
        const z = mapRef.current.getZoom()
        setZoomLevel(Math.max(0, Math.min(1, (z - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM))))
      }
      map.on('zoom', syncZoom)
      syncZoom()

      map.on('click', 'events-circle', (e) => {
        if (!e.features?.length) return
        const props = e.features[0].properties
        if (props?._eventData) {
          try {
            setSelectedEvent(JSON.parse(props._eventData))
            setSelectedMarker(null)
          } catch {
            /* ignore */
          }
        }
      })
      map.on('mouseenter', 'events-circle', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'events-circle', () => {
        if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
      })
    })().catch((err) => {
      console.error('[FlatMap] init failed', err)
    })

    return () => {
      cancelled = true
      if (usaGreedyAnimTimer != null) {
        clearInterval(usaGreedyAnimTimer)
        usaGreedyAnimTimer = null
      }
      setOnResetView(null)
      mapRef.current = null
      if (map) {
        map.remove()
        map = null
      }
    }
  }, [setOnResetView, setSelectedEvent, setSelectedMarker, setZoomLevel])

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const src = m.getSource('events')
    if (src && typeof src.setData === 'function') {
      src.setData({
        type: 'FeatureCollection',
        features: buildEventFeatures(events),
      })
    }
  }, [events])

  return <div ref={containerRef} className="fixed inset-0 z-0 flatmap-container" />
}
