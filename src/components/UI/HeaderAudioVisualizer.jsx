import { useEffect, useRef, useCallback } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { getAtlasAudioAnalyser } from '../../audio/atlasAudioBus'
import { getBgmTrackById } from '../../config/bgmTracks'

function lerp(a, b, t) {
  return a + (b - a) * t
}

function followPeak(prev, target, attack, release) {
  const k = target > prev ? attack : release
  return lerp(prev, target, k)
}

/** Electric blue (deeper than ice-cyan; matches earlier wavelength accent) */
const EB = {
  glow: [0, 150, 255],
  glow2: [30, 175, 255],
  core: [0, 195, 255],
  tip: [60, 215, 255],
  baseline: [80, 210, 255],
  baselineShadow: [0, 165, 255],
  hairline: [140, 220, 255],
}

function rgba(rgb, a) {
  const [r, g, b] = rgb
  return `rgba(${r},${g},${b},${a})`
}

/** Map horizontal position → FFT bin (more resolution in bass / mids like a music EQ) */
function binForColumn(xNorm, freqLen) {
  if (freqLen <= 1) return 0
  const t = xNorm ** 0.72
  return Math.min(freqLen - 1, Math.floor(t * freqLen * 0.96))
}

/**
 * Glowing baseline + dense thin vertical “fringe” strands (spectrum-style),
 * electric blue — driven by live Web Audio.
 */
export default function HeaderAudioVisualizer({ mirrored = false }) {
  const openBgmTrackMenu = useAtlasStore((s) => s.openBgmTrackMenu)
  const bgmAmbientTrackId = useAtlasStore((s) => s.bgmAmbientTrackId)
  const nowPlayingLabel = getBgmTrackById(bgmAmbientTrackId).label
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const widthRef = useRef(200)
  const timeBufRef = useRef(null)
  const freqBufRef = useRef(null)
  const colSmoothRef = useRef(null)
  const prevBassRef = useRef(0)
  const peakRef = useRef(0)
  const transientRef = useRef(0)
  const rmsSmoothRef = useRef(0)
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)
  const ytRef = useRef(youtubeEmbed)
  ytRef.current = youtubeEmbed

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w && w > 0) widthRef.current = Math.floor(w)
    })
    ro.observe(el)
    widthRef.current = Math.max(120, el.offsetWidth || 200)
    return () => ro.disconnect()
  }, [])

  const draw = useCallback((timeMs) => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cssW = Math.max(120, container.offsetWidth || widthRef.current)
    /** Taller canvas: room for downward spikes from baseline */
    const cssH = 36
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const analyser = getAtlasAudioAnalyser()
    const t = timeMs * 0.001

    let timeData = null
    let freqData = null

    if (analyser) {
      const fl = analyser.frequencyBinCount
      const tl = analyser.fftSize
      let tb = timeBufRef.current
      let fb = freqBufRef.current
      if (!tb || tb.length !== tl) {
        tb = new Uint8Array(tl)
        timeBufRef.current = tb
      }
      if (!fb || fb.length !== fl) {
        fb = new Uint8Array(fl)
        freqBufRef.current = fb
      }
      analyser.getByteTimeDomainData(tb)
      analyser.getByteFrequencyData(fb)
      timeData = tb
      freqData = fb
    }

    let rawEnergy = 0
    let bass = 0
    let mid = 0
    const freqLen = freqData?.length ?? 0
    if (freqData && freqLen > 0) {
      let sum = 0
      const nBass = Math.min(16, Math.floor(freqLen * 0.08))
      const nMidStart = nBass
      const nMidEnd = Math.floor(freqLen * 0.45)
      for (let i = 0; i < freqLen; i++) sum += freqData[i]
      rawEnergy = sum / (freqLen * 255)
      for (let i = 0; i < nBass; i++) bass += freqData[i]
      bass /= nBass * 255
      for (let i = nMidStart; i < nMidEnd; i++) mid += freqData[i]
      mid /= Math.max(1, nMidEnd - nMidStart) * 255
    }

    let rms = 0
    let wavePeak = 0
    const timeLen = timeData?.length ?? 0
    if (timeData && timeLen > 0) {
      let acc = 0
      for (let i = 0; i < timeLen; i++) {
        const v = (timeData[i] - 128) / 128
        acc += v * v
        const a = Math.abs(v)
        if (a > wavePeak) wavePeak = a
      }
      rms = Math.sqrt(acc / timeLen)
    }

    const bassDelta = Math.max(0, bass - prevBassRef.current)
    prevBassRef.current = bass
    const transientRaw = Math.min(1, bassDelta * 8 + wavePeak * 1.2)
    transientRef.current = followPeak(transientRef.current, transientRaw, 0.72, 0.28)
    rmsSmoothRef.current = followPeak(rmsSmoothRef.current, rms, 0.45, 0.18)

    let liveBlend = rawEnergy
    if (ytRef.current) {
      liveBlend = Math.min(1, rawEnergy * 1.15 + 0.06)
    }

    const silent = !analyser || (liveBlend < 0.012 && rms < 0.02 && wavePeak < 0.04)
    const idleBreath = silent ? 0.1 + Math.sin(t * 1.15) * 0.05 : 0
    peakRef.current = followPeak(peakRef.current, wavePeak, 0.55, 0.22)

    const punch =
      transientRef.current * 14 +
      peakRef.current * 10 +
      rmsSmoothRef.current * 9 +
      bass * 11 +
      mid * 5 +
      liveBlend * 6 +
      idleBreath * 2

    const E = Math.min(1, punch / 32)

    /** Baseline: upper third — strands hang below like the reference */
    const baselineY = 11
    const maxDown = cssH - baselineY - 3
    const globalGain = 0.92 + E * 0.55

    const cols = Math.max(32, Math.min(480, Math.floor(cssW)))
    let colBuf = colSmoothRef.current
    if (!colBuf || colBuf.length !== cols) {
      colBuf = new Float32Array(cols)
      colSmoothRef.current = colBuf
    }

    ctx.clearRect(0, 0, cssW, cssH)

    // Per-column energy → smoothed height (spiky but stable)
    const xScale = cols > 1 ? 1 / (cols - 1) : 0
    for (let xi = 0; xi < cols; xi++) {
      const norm = xi * xScale
      let v = 0

      if (freqData && freqLen > 0) {
        const bi = binForColumn(norm, freqLen)
        v = freqData[bi] / 255
      }

      if (timeData && timeLen > 0) {
        const ti = Math.min(timeLen - 1, Math.floor(norm * (timeLen - 1)))
        const w = Math.abs((timeData[ti] - 128) / 128)
        v = v * 0.5 + w * 0.5
      }

      if (silent) {
        v = idleBreath * (0.35 + 0.65 * Math.sin(norm * Math.PI * 3 + t * 0.8))
      } else {
        v = Math.min(
          1,
          v * (1 + transientRef.current * 0.55 + bass * 0.2) + peakRef.current * 0.15
        )
      }

      colBuf[xi] = followPeak(colBuf[xi], v, 0.62, 0.38)
    }

    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'

    // 1) Soft outer glow (fewer strokes — wide faint lines)
    ctx.globalCompositeOperation = 'lighter'
    for (let pass = 0; pass < 2; pass++) {
      const spread = pass === 0 ? 2 : 0
      const alphaMul = pass === 0 ? 0.12 : 0.38
      const glowRgb = pass === 0 ? EB.glow : EB.glow2
      for (let xi = 0; xi < cols; xi++) {
        const v = colBuf[xi]
        const hDown = (3 + v * maxDown * globalGain) * (pass === 0 ? 1.15 : 1)
        const hUp = hDown * 0.1
        const x = xi * xScale * (cssW - 1) + 0.5
        const a = alphaMul * (0.35 + v * 0.65)
        ctx.strokeStyle = rgba(glowRgb, a)
        ctx.lineWidth = pass === 0 ? 2.2 : 1
        ctx.beginPath()
        ctx.moveTo(x + spread, baselineY - hUp)
        ctx.lineTo(x + spread, baselineY + hDown)
        ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    // 2) Crisp thin strands (electric blue core)
    for (let xi = 0; xi < cols; xi++) {
      const v = colBuf[xi]
      const hDown = (3 + v * maxDown * globalGain)
      const hUp = hDown * 0.08
      const x = xi * xScale * (cssW - 1) + 0.5
      const core = 0.45 + v * 0.5
      ctx.strokeStyle = rgba(EB.core, core)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, baselineY - hUp)
      ctx.lineTo(x, baselineY + hDown)
      ctx.stroke()

      // Slightly brighter tip (still blue, not white)
      if (v > 0.2 && hDown > 6) {
        ctx.strokeStyle = rgba(EB.tip, 0.2 + v * 0.4)
        ctx.beginPath()
        ctx.moveTo(x, baselineY + hDown - 1)
        ctx.lineTo(x, baselineY + hDown)
        ctx.stroke()
      }
    }

    // 3) Glowing baseline on top (electric blue, not pale cyan)
    ctx.shadowColor = rgba(EB.baselineShadow, 0.92)
    ctx.shadowBlur = 8 + transientRef.current * 6
    ctx.strokeStyle = rgba(EB.baseline, 0.97)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, baselineY)
    ctx.lineTo(cssW, baselineY)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Hairline highlight on baseline
    ctx.strokeStyle = rgba(EB.hairline, 0.5)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, baselineY)
    ctx.lineTo(cssW, baselineY)
    ctx.stroke()
  }, [])

  useEffect(() => {
    let id
    const loop = (time) => {
      draw(time)
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [draw])

  function openMenu(e) {
    e.preventDefault()
    e.stopPropagation()
    openBgmTrackMenu(e.clientX, e.clientY)
  }

  const vizTitle = `Now playing: ${nowPlayingLabel} — Click to change track or volume`

  return (
    <div
      ref={containerRef}
      className={`header-audio-viz header-audio-viz--fringe header-audio-viz--interactive${mirrored ? ' header-audio-viz--mirror' : ''}`}
      title={vizTitle}
      role="button"
      tabIndex={0}
      aria-label={`ATLAS audio visualizer. Now playing ${nowPlayingLabel}. Click to choose ambient track and volume.`}
      onClick={openMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openBgmTrackMenu(
            e.currentTarget.getBoundingClientRect().left + e.currentTarget.offsetWidth / 2,
            e.currentTarget.getBoundingClientRect().bottom,
          )
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="header-audio-viz-canvas pointer-events-none block w-full h-[36px]"
        aria-hidden
      />
    </div>
  )
}
