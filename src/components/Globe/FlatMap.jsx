/**
 * FlatMap — 2D Leaflet map fallback for Atlas.
 *
 * Minimal GPU usage, perfect for mobile or very low-end devices.
 * Uses CartoDB dark tiles to match the Atlas aesthetic, with
 * circle markers for GDELT + NASA EONET / FIRMS (same rules as Map3D).
 */
import { useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'
import useGdeltGeoOverlay from '../../hooks/useGdeltGeoOverlay'
import { toneToChoroplethRgba } from '../../services/gdelt/geoService'
import { DIMENSION_COLORS } from '../../core/eventSchema'
import { eventSourceToGlobeDataLayerKey } from '../../core/globeLayers'

// Dark tile layer matching Atlas design
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

// Compute home center from the user's timezone (matches Cesium & Globe.GL spawn)
const _home = getTimezoneViewCenter()
const DEFAULT_CENTER = [_home.lat, _home.lng]
const DEFAULT_ZOOM = 2.5
const MIN_ZOOM = 2
const MAX_ZOOM = 12

/** Sync zoom level back to store */
function ZoomSync() {
    const map = useMap()
    const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)

    useEffect(() => {
        const handler = () => {
            const z = map.getZoom()
            const norm = (z - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)
            setZoomLevel(Math.max(0, Math.min(1, norm)))
        }
        map.on('zoomend', handler)
        return () => map.off('zoomend', handler)
    }, [map, setZoomLevel])

    return null
}

/** GDELT PointHeatmap overlay — density of events in the last `timespan`. */
function GdeltHeatLayer({ points }) {
    const map = useMap()
    const layerRef = useRef(null)

    useEffect(() => {
        if (!points || points.length === 0) {
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
            return
        }
        const maxWeight = points.reduce((m, p) => Math.max(m, p.weight || 1), 1)
        const latlngs = points.map((p) => [p.lat, p.lng, (p.weight || 1) / maxWeight])
        if (!layerRef.current) {
            layerRef.current = L.heatLayer(latlngs, {
                radius: 22,
                blur: 18,
                minOpacity: 0.25,
                max: 1,
                gradient: {
                    0.2: '#1a90ff',
                    0.4: '#00e6ff',
                    0.6: '#ffe066',
                    0.8: '#ff7a3c',
                    1.0: '#ff2d55',
                },
            }).addTo(map)
        } else {
            layerRef.current.setLatLngs(latlngs)
        }
        return () => {
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
        }
    }, [map, points])

    return null
}

/** Country/ADM1 tone choropleth overlay. */
function GdeltChoroplethLayer({ rows, toneRange }) {
    const map = useMap()
    const layerRef = useRef(null)

    useEffect(() => {
        if (layerRef.current) {
            map.removeLayer(layerRef.current)
            layerRef.current = null
        }
        if (!rows || rows.length === 0) return undefined

        const features = rows
            .map((r, i) => ({
                type: 'Feature',
                geometry: r.geometry,
                properties: { __idx: i, name: r.name, tone: r.tone, count: r.count },
            }))

        const geojson = { type: 'FeatureCollection', features }
        const min = toneRange?.min ?? -5
        const max = toneRange?.max ?? 5

        layerRef.current = L.geoJSON(geojson, {
            style: (feat) => ({
                fillColor: toneToChoroplethRgba(feat.properties.tone, min, max),
                fillOpacity: 0.55,
                color: 'rgba(255,255,255,0.25)',
                weight: 0.6,
            }),
            onEachFeature: (feat, layer) => {
                const { name, tone, count } = feat.properties
                layer.bindTooltip(
                    `<div class="flatmap-tooltip-inner"><span class="flatmap-tooltip-cat">${name || '—'}</span></div>` +
                    `<div class="flatmap-tooltip-title">Tone ${Number(tone).toFixed(2)} · ${count} mentions</div>`,
                    { direction: 'top', sticky: true, className: 'flatmap-tooltip' },
                )
            },
        }).addTo(map)

        return () => {
            if (layerRef.current) {
                map.removeLayer(layerRef.current)
                layerRef.current = null
            }
        }
    }, [map, rows, toneRange])

    return null
}

/** Reset view handler */
function ResetViewHandler() {
    const map = useMap()
    const setOnResetView = useAtlasStore((s) => s.setOnResetView)

    useEffect(() => {
        setOnResetView(() => {
            const center = getTimezoneViewCenter()
            map.flyTo([center.lat, center.lng], DEFAULT_ZOOM, { duration: 1.2 })
        })
        return () => setOnResetView(null)
    }, [map, setOnResetView])

    return null
}

function eventRadius(evt) {
    const base = evt.severity >= 4 ? 9 : evt.severity >= 3 ? 7 : 5
    return base
}

export default function FlatMap({ onGlobeReady }) {
    const events = useAtlasStore((s) => s.events)
    const dataLayers = useAtlasStore((s) => s.dataLayers)
    const activeDimensions = useAtlasStore((s) => s.activeDimensions)
    const priorityFilter = useAtlasStore((s) => s.priorityFilter)
    const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
    const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
    const onGlobeReadyRef = useRef(onGlobeReady)
    onGlobeReadyRef.current = onGlobeReady

    const { heatmapPoints, choroplethRows, toneRange } = useGdeltGeoOverlay()
    const heatOn = dataLayers?.gdeltHeatmap !== false
    const choroOn = dataLayers?.gdeltChoropleth === true

    const visibleItems = useMemo(() => {
        const list = []
        for (const evt of events) {
            if (evt.lat == null || evt.lng == null) continue
            const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
            if (!layerKey || dataLayers[layerKey] === false) continue
            if (!activeDimensions.has(evt.dimension)) continue
            if (priorityFilter === 'p1' && evt.priority !== 'p1') continue
            if (priorityFilter === 'p1p2' && evt.priority === 'p3') continue
            list.push(evt)
        }
        return list
    }, [events, dataLayers, activeDimensions, priorityFilter])

    const handleEventClick = useCallback(
        (evt) => {
            const src = (evt.source || '').toLowerCase()
            if (src.includes('gdelt')) {
                setSelectedMarker(evt)
                setSelectedEvent(null)
            } else {
                setSelectedEvent(evt)
                setSelectedMarker(null)
            }
        },
        [setSelectedEvent, setSelectedMarker],
    )

    // Signal ready after mount
    useEffect(() => {
        const timer = setTimeout(() => {
            if (onGlobeReadyRef.current) onGlobeReadyRef.current()
        }, 300)
        return () => clearTimeout(timer)
    }, [])

    // Truncate title for tooltip
    const truncate = useCallback((str, len = 60) => {
        if (!str) return ''
        return str.length > len ? str.slice(0, len) + '…' : str
    }, [])

    return (
        <div className="fixed inset-0 z-0 flatmap-container">
            <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                zoomControl={false}
                attributionControl={false}
                style={{ width: '100%', height: '100%', background: '#0a0e1a' }}
                worldCopyJump={true}
            >
                <TileLayer
                    url={TILE_URL}
                    attribution={TILE_ATTR}
                    subdimensions="abcd"
                    maxZoom={MAX_ZOOM}
                />
                <ZoomSync />
                <ResetViewHandler />

                {choroOn && choroplethRows.length > 0 && (
                    <GdeltChoroplethLayer rows={choroplethRows} toneRange={toneRange} />
                )}
                {heatOn && heatmapPoints.length > 0 && (
                    <GdeltHeatLayer points={heatmapPoints} />
                )}

                {visibleItems.map((evt) => {
                    const color = DIMENSION_COLORS[evt.dimension] || '#1a90ff'
                    const r = eventRadius(evt)
                    return (
                        <CircleMarker
                            key={evt.id}
                            center={[evt.lat, evt.lng]}
                            radius={r}
                            pathOptions={{
                                color,
                                fillColor: color,
                                fillOpacity: 0.65,
                                weight: 1.5,
                                opacity: 0.85,
                            }}
                            eventHandlers={{
                                click: () => handleEventClick(evt),
                            }}
                        >
                            <Tooltip
                                direction="top"
                                offset={[0, -8]}
                                className="flatmap-tooltip"
                            >
                                <div className="flatmap-tooltip-inner">
                                    <span
                                        className="flatmap-tooltip-dot"
                                        style={{ background: color }}
                                    />
                                    <span className="flatmap-tooltip-cat">{evt.source || 'Event'}</span>
                                </div>
                                <div className="flatmap-tooltip-title">
                                    {truncate(evt.title)}
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    )
                })}
            </MapContainer>
        </div>
    )
}
