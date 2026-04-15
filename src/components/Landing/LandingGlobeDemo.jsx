/**
 * Hero globe.gl preview — same visual stack as GlobeGLView (day/night, sun, atmosphere)
 * without map paths, label tiles, or live news store. Landing markers open feature / use-case cards.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import Globe from 'globe.gl'
import {
  TextureLoader,
  ShaderMaterial,
  Vector2,
  Vector3,
  DirectionalLight,
  AmbientLight,
  HemisphereLight,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  AdditiveBlending,
  Color,
} from 'three'
import * as solar from 'solar-calculator'
import { getCategoryColor } from '../../utils/categoryColors'
import { LANDING_GLOBE_MARKERS } from './landingGlobeMarkers'

const EARTH_DAY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg'
const EARTH_NIGHT = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg'
const EARTH_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const BG_IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'

const GLOBE_RADIUS = 100
const SUN_DISTANCE = GLOBE_RADIUS * 235
const SUN_ANGULAR_DEG = 0.5332
const SUN_DISC_SIZE = 2 * SUN_DISTANCE * Math.tan((SUN_ANGULAR_DEG / 2) * Math.PI / 180)
const SUN_GLOW_SIZE = SUN_DISC_SIZE * 3.2

const POINT_ALTITUDE = 0.01
const RING_MAX_RADIUS = 3
const RING_PROPAGATION_SPEED = 2

function createSunTexture(size = 512, type = 'core') {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx)
  if (type === 'core') {
    grad.addColorStop(0, 'rgba(255, 255, 252, 1.0)')
    grad.addColorStop(0.25, 'rgba(255, 250, 235, 0.98)')
    grad.addColorStop(0.5, 'rgba(255, 230, 180, 0.6)')
    grad.addColorStop(0.75, 'rgba(255, 200, 120, 0.15)')
    grad.addColorStop(1, 'rgba(255, 180, 80,  0.0)')
  } else {
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

function sunToWorldPos(sunLng, sunLat, distance = SUN_DISTANCE) {
  const phi = (90 - sunLat) * Math.PI / 180
  const theta = (90 - sunLng) * Math.PI / 180
  return new Vector3(
    Math.sin(phi) * Math.cos(theta) * distance,
    Math.cos(phi) * distance,
    Math.sin(phi) * Math.sin(theta) * distance,
  )
}

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

function sunPosAt(dt) {
  const day = new Date(+dt).setUTCHours(0, 0, 0, 0)
  const t = solar.century(dt)
  const longitude = ((day - dt) / 864e5) * 360 - 180
  return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)]
}

export default function LandingGlobeDemo({ immersive = false }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const animFrameRef = useRef(null)
  const [selected, setSelected] = useState(null)

  const clearSelection = useCallback(() => setSelected(null), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let destroyed = false

    const readSize = () =>
      immersive
        ? { w: window.innerWidth, h: window.innerHeight }
        : { w: container.clientWidth, h: container.clientHeight }

    const globe = new Globe(container)
    const { w: initW, h: initH } = readSize()

    globe
      .width(initW)
      .height(initH)
      .backgroundImageUrl(BG_IMG)
      .bumpImageUrl(EARTH_BUMP)
      .showGlobe(true)
      .showAtmosphere(true)
      .atmosphereColor('rgba(0, 180, 255, 0.25)')
      .atmosphereAltitude(0.18)
      /* POV shared with `LandingGoogleGlobe` (Map3D) — keep lat/lng/altitude aligned there */
      .pointOfView({ lat: 24, lng: 12, altitude: 2.35 })

    if (typeof globe.rendererSize === 'function') {
      globe.rendererSize(new Vector2(initW, initH))
    }

    const camera = globe.camera()
    camera.far = 50000
    camera.updateProjectionMatrix()

    const controls = globe.controls()
    const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    controls.autoRotate = !reduceMotion
    controls.autoRotateSpeed = 0.35
    controls.enableDamping = true
    controls.dampingFactor = 0.14
    controls.rotateSpeed = 1.12

    const idleMs = 7000
    let idleTimer = null
    const pauseAutoRotate = () => {
      controls.autoRotate = false
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (!destroyed && globeRef.current && !reduceMotion) globeRef.current.controls().autoRotate = true
      }, idleMs)
    }
    container.addEventListener('pointerdown', pauseAutoRotate)
    container.addEventListener('wheel', pauseAutoRotate)

    const scene = globe.scene()
    scene.add(new AmbientLight(0x223355, 0.6))
    scene.add(new HemisphereLight(0xffeedd, 0x112244, 0.3))
    const sunLight = new DirectionalLight(0xfff8f0, 1.8)
    scene.add(sunLight)

    const sunCore = new Sprite(
      new SpriteMaterial({
        map: createSunTexture(512, 'core'),
        color: new Color(0xffffff),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    sunCore.scale.set(SUN_DISC_SIZE, SUN_DISC_SIZE, 1)
    scene.add(sunCore)

    const sunGlow = new Sprite(
      new SpriteMaterial({
        map: createSunTexture(512, 'glow'),
        color: new Color(0xffeedd),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    sunGlow.scale.set(SUN_GLOW_SIZE, SUN_GLOW_SIZE, 1)
    scene.add(sunGlow)

    const loader = new TextureLoader()
    Promise.all([loader.loadAsync(EARTH_DAY), loader.loadAsync(EARTH_NIGHT)]).then(([dayTex, nightTex]) => {
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

      function animate() {
        if (destroyed) return
        const [sunLng, sunLat] = sunPosAt(Date.now())
        material.uniforms.sunPosition.value.set(sunLng, sunLat)
        const pov = globe.pointOfView()
        if (pov) material.uniforms.globeRotation.value.set(pov.lng ?? 0, pov.lat ?? 0)
        const sunWorldPos = sunToWorldPos(sunLng, sunLat)
        sunCore.position.copy(sunWorldPos)
        sunGlow.position.copy(sunWorldPos)
        sunLight.position.copy(sunWorldPos)
        const pulse = 1 + 0.05 * Math.sin(Date.now() * 0.001)
        sunGlow.scale.setScalar(SUN_GLOW_SIZE * pulse)
        animFrameRef.current = requestAnimationFrame(animate)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    })

    globe
      .pointsData(LANDING_GLOBE_MARKERS)
      .pointLat('lat')
      .pointLng('lng')
      .pointColor((d) => getCategoryColor(d.category))
      .pointAltitude(POINT_ALTITUDE)
      .pointRadius(0.38)
      .pointsMerge(false)
      .onPointClick((d) => {
        setSelected(d)
        const currentAlt = globe.pointOfView().altitude ?? 2.35
        const targetAlt = Math.max(0.2, Math.min(0.85, currentAlt * 0.45))
        globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: targetAlt }, 1200)
        pauseAutoRotate()
      })
      .onPointHover((d) => {
        container.style.cursor = d ? 'pointer' : 'grab'
      })

    globe
      .ringsData(LANDING_GLOBE_MARKERS)
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

    globe.onGlobeClick(() => setSelected(null))

    globeRef.current = globe

    const onResize = () => {
      if (!globeRef.current || !containerRef.current) return
      const { w, h } = readSize()
      globeRef.current.width(w).height(h)
      if (typeof globeRef.current.rendererSize === 'function') {
        globeRef.current.rendererSize(new Vector2(w, h))
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      destroyed = true
      clearTimeout(idleTimer)
      window.removeEventListener('resize', onResize)
      container.removeEventListener('pointerdown', pauseAutoRotate)
      container.removeEventListener('wheel', pauseAutoRotate)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (globeRef.current) {
        globeRef.current._destructor?.()
        globeRef.current = null
      }
    }
  }, [immersive])

  return (
    <div
      className={immersive ? 'landing-globe-demo landing-globe-demo--immersive' : 'stitch-globe-stage landing-globe-demo'}
      aria-label="Interactive preview of the ATLAS globe: drag to rotate, click markers for features and use cases"
    >
      {!immersive ? (
        <>
          <div className="stitch-globe-aura" aria-hidden />
          <div className="stitch-globe-ring-outer" aria-hidden>
            <span className="stitch-globe-nav stitch-globe-nav--n" />
            <span className="stitch-globe-nav stitch-globe-nav--e" />
            <span className="stitch-globe-nav stitch-globe-nav--s" />
            <span className="stitch-globe-nav stitch-globe-nav--w" />
          </div>
        </>
      ) : null}
      <div
        className={
          immersive ? 'landing-globe-demo--immersive__host' : 'stitch-globe-sphere landing-globe-demo__sphere'
        }
      >
        <div ref={containerRef} className="landing-globe-demo__canvas" />
        {selected ? (
          <div
            className={
              immersive
                ? 'landing-globe-demo__card-wrap landing-globe-demo__card-wrap--immersive'
                : 'landing-globe-demo__card-wrap'
            }
          >
            <article
              className="landing-globe-demo__card font-[family-name:var(--font-ui)]"
              style={{ borderColor: `${getCategoryColor(selected.category)}55` }}
            >
              <button
                type="button"
                className="landing-globe-demo__card-close"
                onClick={clearSelection}
                aria-label="Close"
              >
                ×
              </button>
              <p
                className="landing-globe-demo__card-kicker font-[family-name:var(--font-data)]"
                style={{ color: getCategoryColor(selected.category) }}
              >
                {selected.kind === 'use_case' ? 'Use case' : 'Feature'}
              </p>
              <h3 className="landing-globe-demo__card-title">{selected.title}</h3>
              <p className="landing-globe-demo__card-body">{selected.body}</p>
              {selected.kind === 'use_case' && selected.stat ? (
                <p className="landing-globe-demo__card-stat font-[family-name:var(--font-data)]">{selected.stat}</p>
              ) : null}
            </article>
          </div>
        ) : null}
      </div>
      {!immersive ? <p className="stitch-globe-badge">Interactive 3D globe in-app</p> : null}
    </div>
  )
}
