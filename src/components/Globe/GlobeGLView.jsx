/**
 * GlobeGLView — Lightweight 3D globe renderer using globe.gl.
 *
 * Renders news markers as coloured points with pulsing rings on a
 * Blue-Marble textured globe with real-time day/night terminator.
 * Much lighter than Cesium — no terrain engine, no tile streaming.
 */
import { useEffect, useRef, useCallback } from 'react'
import Globe from 'globe.gl'
import { useAtlasStore } from '../../store/atlasStore'
import { getCategoryColor } from '../../utils/categoryColors'
import { MOCK_NEWS } from '../../utils/mockData'

// Textures hosted on the three-globe CDN
const EARTH_IMG = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const EARTH_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const NIGHT_IMG = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
const BG_IMG = 'https://unpkg.com/three-globe/example/img/night-sky.png'

// Minimum altitude so points aren't buried in the surface
const POINT_ALTITUDE = 0.01
const RING_MAX_RADIUS = 3
const RING_PROPAGATION_SPEED = 2

export default function GlobeGLView({ onGlobeReady }) {
    const containerRef = useRef(null)
    const globeRef = useRef(null)
    const onGlobeReadyRef = useRef(onGlobeReady)
    onGlobeReadyRef.current = onGlobeReady
    const idleTimerRef = useRef(null)

    const newsItems = useAtlasStore((s) => s.newsItems)
    const activeCategories = useAtlasStore((s) => s.activeCategories)
    const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
    const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)

    // Filtered items
    const getVisibleItems = useCallback(() => {
        const items = newsItems.length > 0 ? newsItems : MOCK_NEWS
        return items.filter(
            (item) =>
                item.lat != null &&
                item.lng != null &&
                activeCategories.has(item.category),
        )
    }, [newsItems, activeCategories])

    // ── Initialise globe once ──
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        // globe.gl constructor — pass the DOM element it will render into
        const globe = new Globe(container)

        // Globe appearance
        globe
            .globeImageUrl(EARTH_IMG)
            .bumpImageUrl(EARTH_BUMP)
            .backgroundImageUrl(BG_IMG)
            .showGlobe(true)
            .showAtmosphere(true)
            .atmosphereColor('rgba(0, 180, 255, 0.25)')
            .atmosphereAltitude(0.18)
            .width(container.clientWidth)
            .height(container.clientHeight)

        // Auto-rotate
        const controls = globe.controls()
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.4
        controls.enableDamping = true
        controls.dampingFactor = 0.1

        // Pause rotation on user interaction
        const stopRotate = () => {
            controls.autoRotate = false
            clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => {
                if (globeRef.current) {
                    globeRef.current.controls().autoRotate = true
                }
            }, 6000)
        }
        container.addEventListener('pointerdown', stopRotate)
        container.addEventListener('wheel', stopRotate)

        // ── Points layer (news markers) ──
        globe
            .pointsData([])
            .pointLat('lat')
            .pointLng('lng')
            .pointColor((d) => getCategoryColor(d.category))
            .pointAltitude(POINT_ALTITUDE)
            .pointRadius(0.35)
            .pointsMerge(true)
            .onPointClick((d) => {
                setSelectedMarker(d)
            })

        // ── Rings layer (pulsing halos) ──
        globe
            .ringsData([])
            .ringLat('lat')
            .ringLng('lng')
            .ringColor((d) => {
                const c = getCategoryColor(d.category)
                return (t) => {
                    const alpha = 1 - t
                    const r = parseInt(c.slice(1, 3), 16)
                    const g = parseInt(c.slice(3, 5), 16)
                    const b = parseInt(c.slice(5, 7), 16)
                    return `rgba(${r},${g},${b},${alpha * 0.45})`
                }
            })
            .ringMaxRadius(RING_MAX_RADIUS)
            .ringPropagationSpeed(RING_PROPAGATION_SPEED)
            .ringRepeatPeriod(() => 2000 + Math.random() * 2000)
            .ringAltitude(POINT_ALTITUDE)

        // ── Labels layer (optional — for future hover labels) ──
        globe
            .labelsData([])
            .labelLat('lat')
            .labelLng('lng')
            .labelText('title')
            .labelSize(0.6)
            .labelDotRadius(0.2)
            .labelColor(() => 'rgba(255, 255, 255, 0.85)')
            .labelResolution(2)
            .labelAltitude(POINT_ALTITUDE + 0.005)

        globeRef.current = globe

        // Resize handler
        const onResize = () => {
            if (globeRef.current && containerRef.current) {
                globeRef.current
                    .width(containerRef.current.clientWidth)
                    .height(containerRef.current.clientHeight)
            }
        }
        window.addEventListener('resize', onResize)

        // Signal ready after a short delay to let textures start loading
        const readyTimer = setTimeout(() => {
            if (onGlobeReadyRef.current) onGlobeReadyRef.current()
        }, 500)

        return () => {
            window.removeEventListener('resize', onResize)
            container.removeEventListener('pointerdown', stopRotate)
            container.removeEventListener('wheel', stopRotate)
            clearTimeout(idleTimerRef.current)
            clearTimeout(readyTimer)
            // Clean up the three.js renderer
            if (globeRef.current) {
                globeRef.current._destructor?.()
                globeRef.current = null
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Update data when newsItems or filters change ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return

        const visible = getVisibleItems()

        // Points
        globe.pointsData(visible)

        // Rings — only show for first ~60 items to avoid excess draw calls
        const ringItems = visible.slice(0, 60)
        globe.ringsData(ringItems)
    }, [newsItems, activeCategories, getVisibleItems])

    // ── React to zoom for store sync ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return

        const controls = globe.controls()
        const onZoom = () => {
            const dist = controls.getDistance?.() ?? 300
            const minD = 120
            const maxD = 600
            const clamped = Math.max(minD, Math.min(maxD, dist))
            const zoom = (clamped - minD) / (maxD - minD)
            setZoomLevel(zoom)
        }
        controls.addEventListener('change', onZoom)
        return () => controls.removeEventListener('change', onZoom)
    }, [setZoomLevel])

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-0"
            style={{ cursor: 'grab', background: '#030712' }}
        />
    )
}
