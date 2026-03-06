/**
 * GlobeGLView — Lightweight 3D globe renderer using globe.gl.
 *
 * Renders news markers as coloured points with pulsing rings on a
 * day/night–shaded globe with real-time sun position (solar-calculator).
 * Much lighter than Cesium — no terrain engine, no tile streaming.
 *
 * Day/night cycle reference: https://globe.gl/example/day-night-cycle/
 */
import { useEffect, useRef, useCallback } from 'react'
import Globe from 'globe.gl'
import { TextureLoader, ShaderMaterial, Vector2 } from 'three'
import * as solar from 'solar-calculator'
import { useAtlasStore } from '../../store/atlasStore'
import { getCategoryColor } from '../../utils/categoryColors'
import { MOCK_NEWS } from '../../utils/mockData'

// Textures (CDN)
const EARTH_DAY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg'
const EARTH_NIGHT = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg'
const EARTH_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const BG_IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'

const POINT_ALTITUDE = 0.01
const RING_MAX_RADIUS = 3
const RING_PROPAGATION_SPEED = 2

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
    const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)

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
        let destroyed = false

        const globe = new Globe(container)

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

        // Auto-rotate
        const controls = globe.controls()
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.4
        controls.enableDamping = true
        controls.dampingFactor = 0.1

        const stopRotate = () => {
            controls.autoRotate = false
            clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => {
                if (globeRef.current) globeRef.current.controls().autoRotate = true
            }, 6000)
        }
        container.addEventListener('pointerdown', stopRotate)
        container.addEventListener('wheel', stopRotate)

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

            globe
                .globeMaterial(material)
                // Track globe rotation for the shader
                .onZoom(({ lng, lat }) => {
                    material.uniforms.globeRotation.value.set(lng, lat)
                })

            // Animate sun position in real-time (1 min per frame for visible movement)
            let dt = +new Date()
            const VELOCITY = 2 // minutes per frame

            function animate() {
                if (destroyed) return
                dt += VELOCITY * 60 * 1000
                const [sunLng, sunLat] = sunPosAt(dt)
                material.uniforms.sunPosition.value.set(sunLng, sunLat)
                animFrameRef.current = requestAnimationFrame(animate)
            }
            animFrameRef.current = requestAnimationFrame(animate)
        })

        // ── Points layer ──
        globe
            .pointsData([])
            .pointLat('lat')
            .pointLng('lng')
            .pointColor((d) => getCategoryColor(d.category))
            .pointAltitude(POINT_ALTITUDE)
            .pointRadius(0.35)
            .pointsMerge(true)
            .onPointClick((d) => setSelectedMarker(d))

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

        // ── Labels layer ──
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
            clearTimeout(idleTimerRef.current)
            clearTimeout(readyTimer)
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            if (globeRef.current) {
                globeRef.current._destructor?.()
                globeRef.current = null
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
