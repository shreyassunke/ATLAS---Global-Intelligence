/**
 * FlatMap — 2D Leaflet map fallback for Atlas.
 *
 * Minimal GPU usage, perfect for mobile or very low-end devices.
 * Uses CartoDB dark tiles to match the Atlas aesthetic, with
 * circle markers colored by news category.
 */
import { useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'
import { getCategoryColor, CATEGORIES } from '../../utils/categoryColors'

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

export default function FlatMap({ onGlobeReady }) {
    const newsItems = useAtlasStore((s) => s.newsItems)
    const activeCategories = useAtlasStore((s) => s.activeCategories)
    const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
    const onGlobeReadyRef = useRef(onGlobeReady)
    onGlobeReadyRef.current = onGlobeReady

    // Filter visible items
    const visibleItems = useMemo(() => {
        return newsItems.filter(
            (item) =>
                item.lat != null &&
                item.lng != null &&
                activeCategories.has(item.category),
        )
    }, [newsItems, activeCategories])

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

                {visibleItems.map((item) => {
                    const color = getCategoryColor(item.category)
                    const catInfo = CATEGORIES[item.category]
                    return (
                        <CircleMarker
                            key={item.id}
                            center={[item.lat, item.lng]}
                            radius={item.mediaType === 'video' ? 7 : 5}
                            pathOptions={{
                                color: color,
                                fillColor: color,
                                fillOpacity: item.mediaType === 'video' ? 0.8 : 0.6,
                                weight: item.mediaType === 'video' ? 2.5 : 1.5,
                                opacity: 0.8,
                                dashArray: item.mediaType === 'video' ? '4 3' : undefined,
                            }}
                            eventHandlers={{
                                click: () => setSelectedMarker(item),
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
                                    <span className="flatmap-tooltip-cat">
                                        {catInfo?.icon} {catInfo?.label || item.category}
                                    </span>
                                </div>
                                <div className="flatmap-tooltip-title">
                                    {truncate(item.title)}
                                </div>
                            </Tooltip>
                        </CircleMarker>
                    )
                })}
            </MapContainer>
        </div>
    )
}
