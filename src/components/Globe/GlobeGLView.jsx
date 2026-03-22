/**
 * GlobeGLView — Lightweight 3D globe renderer using globe.gl.
 *
 * Renders news markers as coloured points with pulsing rings on a
 * day/night–shaded globe with real-time sun position (solar-calculator).
 * Includes a visible Three.js sun (sprite + directional light) that
 * tracks the real solar position, matching CesiumJS's sun appearance.
 *
 * Map context (closer to Cesium): Natural Earth country + state/province
 * outlines (paths layer), and Carto `light_only_labels` raster tiles
 * (second SlippyMap shell) for place/country typography. District-level
 * vector boundaries are omitted by default (very heavy GeoJSON).
 *
 * Day/night cycle reference: https://globe.gl/example/day-night-cycle/
 */
import { useEffect, useRef, useCallback } from 'react'
import Globe from 'globe.gl'
import {
    TextureLoader, ShaderMaterial, Vector2, Vector3,
    DirectionalLight, AmbientLight, HemisphereLight,
    Sprite, SpriteMaterial, CanvasTexture,
    AdditiveBlending, Color,
    MeshBasicMaterial,
} from 'three'
import SlippyMap from 'three-slippy-map-globe'
import * as solar from 'solar-calculator'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'
import { getCategoryColor } from '../../utils/categoryColors'

// Textures (CDN)
const EARTH_DAY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg'
const EARTH_NIGHT = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg'
const EARTH_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const BG_IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'

/**
 * Carto label-only tiles. `dark_only_labels` is for dark basemaps and disappears on bright
 * satellite / day-side terrain — `light_only_labels` uses dark glyphs, readable on imagery.
 */
const CARTO_LABEL_TILE_URL = (x, y, l) =>
    `https://basemaps.cartocdn.com/light_only_labels/${l}/${x}/${y}@2x.png`

/** Natural Earth — country / first-order admin lines (same sources as Cesium) */
const NE_ADMIN0_LINES =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_boundary_lines_land.geojson'
const NE_ADMIN1_LINES =
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson'

const POINT_ALTITUDE = 0.01
const RING_MAX_RADIUS = 3
const RING_PROPAGATION_SPEED = 2

// ─────────────────────────────────────────────────────────────────────────────
//  Astronomically-referenced sun placement
//
//  Source: NASA Sun Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
//    • Earth equatorial radius:   6,371 km
//    • Sun radius:              696,000 km  → 109.2 × Earth radius
//    • Mean Earth–Sun distance: 149,600,000 km → 23,455 × Earth radius
//    • Apparent angular diameter from Earth: 0.5332 ° (mean)
//
//  three-globe uses GLOBE_RADIUS = 100 for Earth, so we scale proportionally:
//    • SUN_DISTANCE  = 100 × 235  = 23,500  (≈ real 23,455× ratio)
//    • SUN_DISC_SIZE = 2 × SUN_DISTANCE × tan(0.5332° / 2) ≈ 219 units
//      This makes the sun disc subtend the correct 0.533° from the origin.
//    • SUN_GLOW_SIZE = SUN_DISC_SIZE × 3.2 ≈ 700 units  (simulated corona)
// ─────────────────────────────────────────────────────────────────────────────
const GLOBE_RADIUS = 100
const SUN_DISTANCE = GLOBE_RADIUS * 235     // 23,500 — proportional to Earth–Sun distance
const SUN_ANGULAR_DEG = 0.5332                 // apparent angular diameter in degrees (NASA)
const SUN_DISC_SIZE = 2 * SUN_DISTANCE * Math.tan((SUN_ANGULAR_DEG / 2) * Math.PI / 180)
// ≈ 219 units — correct apparent disc size
const SUN_GLOW_SIZE = SUN_DISC_SIZE * 3.2     // ≈ 700 units — corona / bloom envelope

// ── Procedural sun texture (radial gradient on canvas) ──
function createSunTexture(size = 512, type = 'core') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const cx = size / 2
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx)

    if (type === 'core') {
        // Tight bright disc — photospheric white/yellow
        grad.addColorStop(0, 'rgba(255, 255, 252, 1.0)')
        grad.addColorStop(0.25, 'rgba(255, 250, 235, 0.98)')
        grad.addColorStop(0.5, 'rgba(255, 230, 180, 0.6)')
        grad.addColorStop(0.75, 'rgba(255, 200, 120, 0.15)')
        grad.addColorStop(1, 'rgba(255, 180, 80,  0.0)')
    } else {
        // Broad soft glow — solar corona
        grad.addColorStop(0, 'rgba(255, 255, 240, 0.7)')
        grad.addColorStop(0.08, 'rgba(255, 245, 210, 0.5)')
        grad.addColorStop(0.2, 'rgba(255, 220, 160, 0.22)')
        grad.addColorStop(0.45, 'rgba(255, 180, 80,  0.06)')
        grad.addColorStop(0.7, 'rgba(255, 140, 40,  0.015)')
        grad.addColorStop(1, 'rgba(255, 100, 0,   0.0)')
    }

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return new CanvasTexture(canvas)
}

/**
 * Convert sun geographic (lng, lat) → Three.js world position.
 * Uses the same convention as three-globe's internal Polar2Cartesian:
 *   phi   = (90 − lat) in radians
 *   theta = (90 − lng) in radians
 */
function sunToWorldPos(sunLng, sunLat, distance = SUN_DISTANCE) {
    const phi = (90 - sunLat) * Math.PI / 180
    const theta = (90 - sunLng) * Math.PI / 180
    return new Vector3(
        Math.sin(phi) * Math.cos(theta) * distance,
        Math.cos(phi) * distance,
        Math.sin(phi) * Math.sin(theta) * distance,
    )
}

// ── Day / Night shader (from globe.gl official example) ──
const dayNightShader = {
    vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

    vec3 Polar2Cartesian(in vec2 c) {
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1, 0, 0,
        0, cos(invLat), -sin(invLat),
        0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0, sin(invLon),
        0, 1, 0,
        -sin(invLon), 0, cos(invLon)
      );
      vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float blendFactor = smoothstep(-0.1, 0.1, intensity);
      gl_FragColor = mix(nightColor, dayColor, blendFactor);
    }
  `,
}

/** Compute sun [lng, lat] for a given timestamp */
function sunPosAt(dt) {
    const day = new Date(+dt).setUTCHours(0, 0, 0, 0)
    const t = solar.century(dt)
    const longitude = ((day - dt) / 864e5) * 360 - 180
    return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)]
}

/**
 * GeoJSON LineString / MultiLineString → globe.gl paths ({ coords: [lat,lng][] }).
 * GeoJSON uses [lng, lat]; three-globe paths use [lat, lng] per point.
 */
function geoJsonLineFeaturesToPaths(geojson, color) {
    const out = []
    const pushLine = (lineCoords) => {
        if (!lineCoords?.length) return
        const coords = lineCoords.map(([lng, lat]) => [lat, lng])
        if (coords.length < 2) return
        out.push({ coords, color })
    }
    const handleGeom = (geom) => {
        if (!geom) return
        if (geom.type === 'LineString') pushLine(geom.coordinates)
        else if (geom.type === 'MultiLineString') {
            for (const line of geom.coordinates) pushLine(line)
        }
    }
    if (geojson.type === 'FeatureCollection') {
        for (const f of geojson.features ?? []) handleGeom(f.geometry)
    } else if (geojson.type === 'Feature') {
        handleGeom(geojson.geometry)
    }
    return out
}

export default function GlobeGLView({ onGlobeReady }) {
    const containerRef = useRef(null)
    const globeRef = useRef(null)
    const onGlobeReadyRef = useRef(onGlobeReady)
    onGlobeReadyRef.current = onGlobeReady
    const idleTimerRef = useRef(null)
    const animFrameRef = useRef(null)

    const newsItems = useAtlasStore((s) => s.newsItems)
    const activeCategories = useAtlasStore((s) => s.activeCategories)
    const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
    const setHoveredMarker = useAtlasStore((s) => s.setHoveredMarker)
    const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)
    const resolvedTier = useAtlasStore((s) => s.resolvedTier)
    const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)

    const getVisibleItems = useCallback(() => {
        return newsItems.filter(
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
        let destroyed = false

        const globe = new Globe(container)

        // Compute timezone-based spawn point
        const homeView = getTimezoneViewCenter()

        // Size immediately
        globe
            .width(container.clientWidth)
            .height(container.clientHeight)
            .backgroundImageUrl(BG_IMG)
            .bumpImageUrl(EARTH_BUMP)
            .showGlobe(true)
            .showAtmosphere(true)
            .atmosphereColor('rgba(0, 180, 255, 0.25)')
            .atmosphereAltitude(0.18)
            .pointOfView({ lat: homeView.lat, lng: homeView.lng, altitude: 2.5 })

        // Extend camera far plane so the sun (at ~23,500 units) isn't clipped
        // Default Three.js far = 2,000 which is far too short
        const camera = globe.camera()
        camera.far = 50000
        camera.updateProjectionMatrix()

        // Auto-rotate — respects Settings → Features → Auto-Rotate (same as Cesium)
        const controls = globe.controls()
        const initialAuto = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        controls.autoRotate = initialAuto
        controls.autoRotateSpeed = 0.4
        controls.enableDamping = true
        controls.dampingFactor = 0.1

        const stopRotate = () => {
            if (!useAtlasStore.getState().getEffectiveSetting('autoRotate')) return
            controls.autoRotate = false
            clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => {
                if (!globeRef.current) return
                if (!useAtlasStore.getState().getEffectiveSetting('autoRotate')) return
                globeRef.current.controls().autoRotate = true
            }, 6000)
        }
        container.addEventListener('pointerdown', stopRotate)
        container.addEventListener('wheel', stopRotate)

        // ── Three.js scene — add sun + lighting ──
        const scene = globe.scene()

        // Soft ambient fill so the night-side markers aren't invisible
        const ambient = new AmbientLight(0x223355, 0.6)
        scene.add(ambient)

        // Hemisphere light — warm sky / cool ground for subtle colour variation
        const hemi = new HemisphereLight(0xffeedd, 0x112244, 0.3)
        scene.add(hemi)

        // Directional light from the sun for 3D marker/ring illumination
        const sunLight = new DirectionalLight(0xfff8f0, 1.8)
        scene.add(sunLight)

        // Visible sun — two additive-blended sprites: photospheric disc + corona glow
        // Sized per NASA angular-diameter data (see constants above)
        const sunCore = new Sprite(new SpriteMaterial({
            map: createSunTexture(512, 'core'),
            color: new Color(0xffffff),
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
        }))
        sunCore.scale.set(SUN_DISC_SIZE, SUN_DISC_SIZE, 1)
        scene.add(sunCore)

        const sunGlow = new Sprite(new SpriteMaterial({
            map: createSunTexture(512, 'glow'),
            color: new Color(0xffeedd),
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
        }))
        sunGlow.scale.set(SUN_GLOW_SIZE, SUN_GLOW_SIZE, 1)
        scene.add(sunGlow)

        // Carto label-tile overlay (initialised below; animate() needs the reference)
        let labelTileLayer = null

        // ── Day/night shader material ──
        const loader = new TextureLoader()
        Promise.all([
            loader.loadAsync(EARTH_DAY),
            loader.loadAsync(EARTH_NIGHT),
        ]).then(([dayTex, nightTex]) => {
            if (destroyed) return

            const material = new ShaderMaterial({
                uniforms: {
                    dayTexture: { value: dayTex },
                    nightTexture: { value: nightTex },
                    sunPosition: { value: new Vector2() },
                    globeRotation: { value: new Vector2() },
                },
                vertexShader: dayNightShader.vertexShader,
                fragmentShader: dayNightShader.fragmentShader,
            })

            globe.globeMaterial(material)

            // Sync day/night + sun objects with real-world time
            function animate() {
                if (destroyed) return

                const [sunLng, sunLat] = sunPosAt(Date.now())
                material.uniforms.sunPosition.value.set(sunLng, sunLat)

                // Keep globeRotation uniform in sync with camera
                const pov = globe.pointOfView()
                if (pov) {
                    material.uniforms.globeRotation.value.set(pov.lng ?? 0, pov.lat ?? 0)
                }

                // Move the visible sun + directional light to match
                const sunWorldPos = sunToWorldPos(sunLng, sunLat)
                sunCore.position.copy(sunWorldPos)
                sunGlow.position.copy(sunWorldPos)
                sunLight.position.copy(sunWorldPos)

                // Subtle corona pulse (±5 % over ~6 s)
                const pulse = 1 + 0.05 * Math.sin(Date.now() * 0.001)
                sunGlow.scale.setScalar(SUN_GLOW_SIZE * pulse)

                // Raster map labels (Carto) — keep tile LOD in sync with the camera
                if (labelTileLayer) {
                    labelTileLayer.updatePov(camera)
                    labelTileLayer.traverse((o) => {
                        if (!o.isMesh || !o.material?.map || o.userData.atlasLabelMatDone) return
                        o.userData.atlasLabelMatDone = true
                        // SlippyMap defaults to MeshLambertMaterial — scene lights wash out / crush
                        // raster labels. Unlit basic material keeps Carto PNGs readable.
                        const map = o.material.map
                        o.material.dispose()
                        o.material = new MeshBasicMaterial({
                            map,
                            transparent: true,
                            depthWrite: false,
                            depthTest: true,
                            toneMapped: false,
                        })
                        o.renderOrder = 5
                    })
                }

                animFrameRef.current = requestAnimationFrame(animate)
            }
            animFrameRef.current = requestAnimationFrame(animate)
        })

        // ── Points layer ──
        // pointsMerge MUST be false for per-point click/hover events to fire
        globe
            .pointsData([])
            .pointLat('lat')
            .pointLng('lng')
            .pointColor((d) => getCategoryColor(d.category))
            .pointAltitude(POINT_ALTITUDE)
            .pointRadius((d) => d.mediaType === 'video' ? 0.5 : 0.35)
            .pointsMerge(false)
            .onPointClick((d) => {
                // Open the NewsCard (same as CesiumGlobe)
                setSelectedMarker(d)
                // Fly closer to the clicked marker
                // altitude is in globe-radii: 2.5 = default view, 0.15 = very close
                const currentAlt = globe.pointOfView().altitude ?? 2.5
                const targetAlt = Math.max(0.15, Math.min(0.8, currentAlt * 0.4))
                globe.pointOfView(
                    { lat: d.lat, lng: d.lng, altitude: targetAlt },
                    1400,
                )
            })
            .onPointHover((d) => {
                // Hover tooltip (RegionRing) — needs _screenX/_screenY
                if (d) {
                    // Globe.GL doesn't pass screen coords directly, so
                    // read the current mouse position from the last pointermove
                    const { _lastPointerX: sx, _lastPointerY: sy } = container
                    setHoveredMarker({
                        ...d,
                        _screenX: sx ?? window.innerWidth / 2,
                        _screenY: sy ?? window.innerHeight / 2,
                    })
                    container.style.cursor = 'pointer'
                } else {
                    setHoveredMarker(null)
                    container.style.cursor = 'grab'
                }
            })

        // Track mouse position on the container for hover tooltip coords
        const onPointerMove = (e) => {
            container._lastPointerX = e.clientX
            container._lastPointerY = e.clientY
        }
        container.addEventListener('pointermove', onPointerMove)

        // ── Globe background click — dismiss news card ──
        globe.onGlobeClick(() => {
            const store = useAtlasStore.getState()
            if (store.selectedMarker) {
                store.setSelectedMarker(null)
            }
        })

        // ── Rings layer ──
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

        // ── Political boundaries (Natural Earth → paths), lazy-loaded — parity with Cesium
        globe
            .pathsData([])
            .pathPoints('coords')
            .pathPointAlt(0.008)
            .pathResolution(0.45)
            .pathColor((d) => d.color)
            // FatLine pathStroke uses LineMaterial linewidth in *pixels*; values like 0.12 are
            // sub-pixel and invisible. Use default thin GL lines (≈1px) — clearly visible.
            .pathStroke(() => null)

        const tierAtInit = useAtlasStore.getState().resolvedTier
        const includeStateBorders = tierAtInit !== 'low'

        let mapOutlinesLoaded = false
        const loadMapOutlines = async () => {
            if (destroyed || mapOutlinesLoaded) return
            try {
                const admin0Res = await fetch(NE_ADMIN0_LINES)
                const admin0 = await admin0Res.json()
                const paths = [
                    ...geoJsonLineFeaturesToPaths(admin0, 'rgba(255, 255, 255, 0.82)'),
                ]
                if (includeStateBorders) {
                    const admin1Res = await fetch(NE_ADMIN1_LINES)
                    const admin1 = await admin1Res.json()
                    paths.push(
                        ...geoJsonLineFeaturesToPaths(
                            admin1,
                            'rgba(160, 205, 255, 0.55)',
                        ),
                    )
                }
                if (!destroyed) {
                    mapOutlinesLoaded = true
                    globe.pathsData(paths)
                }
            } catch {
                /* network / CORS */
            }
        }
        // Load soon (requestIdleCallback alone can starve on a busy main thread)
        setTimeout(loadMapOutlines, 400)

        // ── Carto label tiles (slippy overlay) — same idea as Cesium `dark_only_labels` ──
        // three-globe hides its built-in tile engine when using a custom globeMaterial; we add a
        // second SlippyMap slightly above the surface so day/night shading stays on the base mesh.
        if (tierAtInit !== 'low') {
            const labelMaxLevel = tierAtInit === 'medium' ? 5 : 6
            labelTileLayer = new SlippyMap(GLOBE_RADIUS * 1.004, {
                tileUrl: CARTO_LABEL_TILE_URL,
                minLevel: 0,
                maxLevel: labelMaxLevel,
            })
            // Match three-globe’s built-in tile engine (sibling to globe mesh): no extra Y rotation.
            // globe.gl paths/points share this frame; −π/2 was misaligning label tiles.
            labelTileLayer.curvatureResolution = 4
            // Hide the library’s protective black inner sphere so transparent label pixels show Earth.
            if (labelTileLayer.children[0]) labelTileLayer.children[0].visible = false
            scene.add(labelTileLayer)
        }

        // ── Labels layer (per-marker titles for news — separate from map typography) ──
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

        // ── Register reset-view callback (Header button) ──
        useAtlasStore.getState().setOnResetView(() => {
            const center = getTimezoneViewCenter()
            globe.pointOfView({ lat: center.lat, lng: center.lng, altitude: 2.5 }, 1200)
            const c = globe.controls()
            if (c) c.autoRotate = useAtlasStore.getState().getEffectiveSetting('autoRotate')
            useAtlasStore.getState().setSelectedMarker(null)
        })

        // Resize
        const onResize = () => {
            if (globeRef.current && containerRef.current) {
                globeRef.current
                    .width(containerRef.current.clientWidth)
                    .height(containerRef.current.clientHeight)
            }
        }
        window.addEventListener('resize', onResize)

        // Signal ready
        const readyTimer = setTimeout(() => {
            if (onGlobeReadyRef.current) onGlobeReadyRef.current()
        }, 500)

        return () => {
            destroyed = true
            window.removeEventListener('resize', onResize)
            container.removeEventListener('pointerdown', stopRotate)
            container.removeEventListener('wheel', stopRotate)
            container.removeEventListener('pointermove', onPointerMove)
            setHoveredMarker(null)
            clearTimeout(idleTimerRef.current)
            clearTimeout(readyTimer)
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            useAtlasStore.getState().setOnResetView(null)
            if (labelTileLayer) {
                labelTileLayer.clearTiles?.()
                scene.remove(labelTileLayer)
                labelTileLayer = null
            }
            if (globeRef.current) {
                globeRef.current._destructor?.()
                globeRef.current = null
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync Auto-Rotate setting when user changes quality tier or toggles the feature
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const ar = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        const controls = globe.controls()
        if (!controls) return
        controls.autoRotate = ar
        if (!ar) {
            clearTimeout(idleTimerRef.current)
        }
    }, [resolvedTier, qualityOverrides])

    // ── Update data ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const visible = getVisibleItems()
        globe.pointsData(visible)
        globe.ringsData(visible.slice(0, 60))
    }, [newsItems, activeCategories, getVisibleItems])

    // ── Zoom sync ──
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
