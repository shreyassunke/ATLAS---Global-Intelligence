import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ''

/**
 * Full-screen Cesium starfield background for the setup page.
 * Uses the same Earth skybox as the main globe, with a slow camera rotation
 * to create a looping "star movement" effect. No globe, no sun/moon — stars only.
 * Calls onSunAngle(angleRad) each frame so the parent can drive a sun-based lightroom effect.
 */
export default function CesiumStarfieldBackground({ onSunAngle }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const frameRef = useRef(null)
  const angleRef = useRef(0)
  const onSunAngleRef = useRef(onSunAngle)
  onSunAngleRef.current = onSunAngle

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (ION_TOKEN) {
      Cesium.Ion.defaultAccessToken = ION_TOKEN
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
      useDefaultRenderLoop: true,
      requestRenderMode: false,
      targetFrameRate: 30,
      msaaSamples: 1,                     // No edges to alias in starfield
    })
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1.0, 2.0)

    viewerRef.current = viewer
    const { scene } = viewer
    const { camera } = scene

    // Hide globe and atmosphere — stars only (Cesium starfield)
    scene.globe.show = false
    scene.imageryLayers.removeAll()
    if (scene.sun) scene.sun.show = false
    if (scene.moon) scene.moon.show = false
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = false

    // Same starfield as main app
    scene.skyBox = Cesium.SkyBox.createEarthSkyBox()
    scene.backgroundColor = Cesium.Color.BLACK

    // Camera in space looking at origin so skybox fills view; no terrain/globe
    const distance = 1e7
    camera.lookAt(Cesium.Cartesian3.ZERO, new Cesium.Cartesian3(distance, 0, 0))

    // Slow rotation for looping star movement (~full rotation in ~2 minutes)
    const rotatePerFrame = (Math.PI * 2) / (90 * 60)
    function tick() {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return
      camera.rotate(Cesium.Cartesian3.UNIT_Z, rotatePerFrame)
      angleRef.current += rotatePerFrame
      const cb = onSunAngleRef.current
      if (typeof cb === 'function') cb(angleRef.current)
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden
    />
  )
}
