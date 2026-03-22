import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { setAtlasAudioAnalyser } from '../../audio/atlasAudioBus'
import { getBgmTrackById } from '../../config/bgmTracks'

const INTRO_URL = '/audio/intro.mp3'

export default function BackgroundAudio() {
  const introRef = useRef(null)
  const ambientRef = useRef(null)
  const hasStartedRef = useRef(false)
  const audioContextRef = useRef(null)
  const webAudioReadyRef = useRef(false)
  /** When YouTube in-app player is open, pause BGM so only one source plays */
  const youtubeEmbed = useAtlasStore((s) => s.youtubeEmbed)
  const bgmSuppressed = !!youtubeEmbed
  const bgmAmbientTrackId = useAtlasStore((s) => s.bgmAmbientTrackId)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const ambientSrc = getBgmTrackById(bgmAmbientTrackId).url

  // Keep HTMLMediaElement volume in sync (also drives Web Audio analyser levels)
  useEffect(() => {
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return
    const v =
      typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume)
        ? Math.max(0, Math.min(1, bgmVolume))
        : 0.65
    intro.volume = v
    ambient.volume = v
  }, [bgmVolume])

  /** Route intro + ambient through one analyser for header visualizer (merged output). */
  function ensureWebAudioGraph() {
    if (webAudioReadyRef.current) return true
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return false

    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return false

    try {
      const ctx = new Ctx()
      const srcIntro = ctx.createMediaElementSource(intro)
      const srcAmbient = ctx.createMediaElementSource(ambient)
      const merger = ctx.createGain()
      merger.gain.value = 1
      srcIntro.connect(merger)
      srcAmbient.connect(merger)
      const analyser = ctx.createAnalyser()
      /* Larger FFT + lower smoothing = header viz reads transients / spectrum more “live” */
      analyser.fftSize = 512
      analyser.minDecibels = -90
      analyser.maxDecibels = -20
      analyser.smoothingTimeConstant = 0.35
      merger.connect(analyser)
      analyser.connect(ctx.destination)
      setAtlasAudioAnalyser(analyser)
      audioContextRef.current = ctx
      webAudioReadyRef.current = true
      return true
    } catch (e) {
      console.warn('ATLAS: Web Audio routing unavailable; BGM still plays without visualizer.', e)
      return false
    }
  }

  // After intro, keep ambient playing when the user switches tracks (src updates from the store)
  useEffect(() => {
    const ambient = ambientRef.current
    const intro = introRef.current
    if (!ambient || !intro) return
    if (!hasStartedRef.current || bgmSuppressed) return
    if (!intro.ended) return
    ambient.play().catch(() => {})
  }, [ambientSrc, bgmSuppressed])

  // Pause / resume BGM when YouTube overlay opens or closes (exclusive audio)
  useEffect(() => {
    const intro = introRef.current
    const ambient = ambientRef.current
    if (!intro || !ambient) return

    if (bgmSuppressed) {
      intro.pause()
      ambient.pause()
      return
    }

    if (!hasStartedRef.current) return

    if (!intro.ended) {
      intro.play().catch(() => {})
    } else {
      ambient.play().catch(() => {})
    }
  }, [bgmSuppressed])

  // Start on first user interaction (browser autoplay policy)
  useEffect(() => {
    const startAudio = async () => {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const intro = introRef.current
      const ambient = ambientRef.current
      if (!intro || !ambient) return

      const vol = useAtlasStore.getState().bgmVolume
      intro.volume = vol
      ambient.volume = vol
      ambient.loop = true

      ensureWebAudioGraph()
      const ctx = audioContextRef.current
      if (ctx?.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          /* ignore */
        }
      }

      ambient.addEventListener('ended', function onAmbientEnded() {
        if (useAtlasStore.getState().youtubeEmbed) return
        ambient.play().catch(() => {})
      })

      intro.play().catch(() => {
        hasStartedRef.current = false
      })

      intro.addEventListener('ended', () => {
        if (useAtlasStore.getState().youtubeEmbed) return
        ambient.play().catch(() => {})
      })
    }

    const events = ['click', 'touchstart', 'keydown']
    const onInteraction = () => {
      void startAudio()
      events.forEach((e) => document.removeEventListener(e, onInteraction))
    }

    events.forEach((e) => document.addEventListener(e, onInteraction))
    return () => events.forEach((e) => document.removeEventListener(e, onInteraction))
  }, [])

  return (
    <>
      <audio ref={introRef} src={INTRO_URL} preload="auto" />
      <audio ref={ambientRef} src={ambientSrc} preload="auto" loop />
    </>
  )
}
