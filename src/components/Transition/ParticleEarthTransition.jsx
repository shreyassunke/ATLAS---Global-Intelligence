import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useAtlasStore } from '../../store/atlasStore'

const PARTICLE_COUNT = 14_000
const SPHERE_RADIUS = 1
const DURATION_MS = 2800
const SCATTER_RADIUS = 5.5
const CAM_START_Z = 8
const CAM_END_Z = 2.8
const HOLD_SCATTER_MS = 200
const CONVERGE_END_MS = 2100
const GLOW_START_MS = 2100

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

/** Create a circular soft-glow particle texture (replaces default square) */
function createParticleTexture(size = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)')
  grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)')
  grad.addColorStop(0.5, 'rgba(200, 228, 248, 0.35)')
  grad.addColorStop(0.8, 'rgba(150, 200, 240, 0.08)')
  grad.addColorStop(1, 'rgba(100, 160, 220, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/** Scatter position: random in sphere (like starfield) */
function randomScatter() {
  const phi = Math.acos(2 * Math.random() - 1)
  const theta = Math.random() * Math.PI * 2
  const r = SCATTER_RADIUS * (0.3 + 0.7 * Math.random())
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  }
}

export default function ParticleEarthTransition() {
  const containerRef = useRef(null)
  const rafRef = useRef(null)
  const startTimeRef = useRef(null)

  const completeOnboarding = useAtlasStore((s) => s.completeOnboarding)
  const endLaunchTransition = useAtlasStore((s) => s.endLaunchTransition)
  const setSkipCesiumIntro = useAtlasStore((s) => s.setSkipCesiumIntro)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = window.innerWidth
    const height = window.innerHeight

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.set(0, 0, CAM_START_Z)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    const startPositions = new Float32Array(PARTICLE_COUNT * 3)
    const endPositions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const s = randomScatter()
      startPositions[i * 3] = s.x
      startPositions[i * 3 + 1] = s.y
      startPositions[i * 3 + 2] = s.z
      const phi = Math.acos(2 * Math.random() - 1)
      const theta = Math.random() * Math.PI * 2
      const r = SPHERE_RADIUS * (0.97 + Math.random() * 0.06)
      endPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      endPositions[i * 3 + 1] = r * Math.cos(phi)
      endPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(startPositions.slice(), 3))
    geometry.attributes.position.needsUpdate = true

    // Circular particle texture — replaces the default WebGL square points
    const particleTex = createParticleTexture(64)

    const material = new THREE.PointsMaterial({
      size: 0.018,
      map: particleTex,
      color: 0xc8e4f8,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    const posAttr = geometry.attributes.position
    // Reuse startPositions directly — no mutation, no need for a copy

    let completed = false
    function finish() {
      if (completed) return
      completed = true
      setSkipCesiumIntro(true)
      completeOnboarding()
      endLaunchTransition()
    }

    const convergeDuration = CONVERGE_END_MS - HOLD_SCATTER_MS
    const glowDuration = DURATION_MS - GLOW_START_MS

    function animate(now) {
      if (completed) return
      rafRef.current = requestAnimationFrame(animate)
      if (!startTimeRef.current) startTimeRef.current = now
      const elapsed = now - startTimeRef.current

      // Converge: 0 until HOLD_SCATTER_MS, then 0..1 by CONVERGE_END_MS (eased)
      let convergeT = 0
      if (elapsed > HOLD_SCATTER_MS) {
        convergeT = Math.min((elapsed - HOLD_SCATTER_MS) / convergeDuration, 1)
        convergeT = easeOutCubic(convergeT)
      }
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        posAttr.array[i * 3] = startPositions[i * 3] + (endPositions[i * 3] - startPositions[i * 3]) * convergeT
        posAttr.array[i * 3 + 1] = startPositions[i * 3 + 1] + (endPositions[i * 3 + 1] - startPositions[i * 3 + 1]) * convergeT
        posAttr.array[i * 3 + 2] = startPositions[i * 3 + 2] + (endPositions[i * 3 + 2] - startPositions[i * 3 + 2]) * convergeT
      }
      posAttr.needsUpdate = true

      // Glow: from GLOW_START_MS to DURATION_MS, ramp size and opacity up
      if (elapsed >= GLOW_START_MS && glowDuration > 0) {
        const glowT = Math.min((elapsed - GLOW_START_MS) / glowDuration, 1)
        const glowEased = easeOutCubic(glowT)
        material.size = 0.018 + 0.022 * glowEased
        material.opacity = 0.75 + 0.25 * glowEased
      }

      // Camera: pull from far (see scattered stars) to final view
      const camT = Math.min(elapsed / CONVERGE_END_MS, 1)
      const camEased = easeOutCubic(camT)
      const z = CAM_START_Z + (CAM_END_Z - CAM_START_Z) * camEased
      camera.position.set(0, 0, z)

      renderer.render(scene, camera)

      if (elapsed >= DURATION_MS) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        finish()
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      particleTex.dispose()
      if (container && renderer.domElement) container.removeChild(renderer.domElement)
    }
  }, [completeOnboarding, endLaunchTransition, setSkipCesiumIntro])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden
      style={{ pointerEvents: 'none', background: 'transparent' }}
    />
  )
}
