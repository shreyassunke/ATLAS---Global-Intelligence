import { useMemo, useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import {
  NEWS_SOURCES,
  REGION_LABELS,
  REGION_ORDER,
  fetchAllSources,
  groupSelectedByRegion,
  getSourcesByRegion,
} from '../../utils/newsSources'
import SourceSearch from './SourceSearch'
import { GlassFilter } from '../UI/liquid-glass'

const ATLAS_POOLS = [
  ['ا', 'अ', 'α', 'ა', 'Ա', '아', 'አ', 'ア', '阿', 'Ā'],
  ['ت', 'त', 'τ', 'თ', 'Տ', '태', 'ጠ', 'タ', '太', 'Тэ'],
  ['ل', 'ल', 'λ', 'ლ', 'Լ', '라', 'ሊ', 'ラ', '拉', 'Лл'],
  ['أ', 'आ', 'ά', 'ა', 'Ա', '아', 'አ', 'ア', '啊', 'Àá'],
  ['س', 'स', 'σ', 'ს', 'Ს', '사', 'ሠ', 'サ', '沙', 'Сс'],
]
const ATLAS_REAL = ['A', 'T', 'L', 'A', 'S']

export default function Onboarding({ sunAngle = 0 }) {
  const letterRefs = useRef([])
  const foreignRefs = useRef([])
  const isDecodingRef = useRef(false)
  const idleTimersRef = useRef([])

  const {
    selectedSources,
    addSource,
    removeSource,
    startLaunchTransition,
    sourceCatalog,
    setSourceCatalog,
    setSelectedSources,
  } = useAtlasStore()

  const catalog = useMemo(
    () => (sourceCatalog.length > 0 ? sourceCatalog : NEWS_SOURCES),
    [sourceCatalog],
  )

  useEffect(() => {
    if (sourceCatalog.length > 0) return
    const apiKey = import.meta.env.VITE_NEWS_API_KEY
    fetchAllSources(apiKey).then((data) => setSourceCatalog(data))
  }, [sourceCatalog.length, setSourceCatalog])

  const groupedSelected = useMemo(
    () => groupSelectedByRegion(selectedSources, catalog),
    [selectedSources, catalog],
  )

  const [openRegions, setOpenRegions] = useState(new Set())

  const toggleRegionOpen = (region) => {
    setOpenRegions((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })
  }

  const selectedIds = useMemo(
    () => new Set(selectedSources.map((s) => s.id)),
    [selectedSources],
  )

  const catalogByRegion = useMemo(
    () => getSourcesByRegion(catalog),
    [catalog],
  )

  const handleToggle = (source, isSelected) => {
    if (isSelected) removeSource(source.id)
    else addSource({ id: source.id, name: source.name, type: source.type || 'source' })
  }

  const handleLaunch = () => startLaunchTransition()

  const handleSelectAllSources = () => {
    setSelectedSources(catalog.map((s) => ({ id: s.id, name: s.name, type: 'source' })))
  }

  const hasAllSources =
    catalog.length > 0 && selectedSources.length === catalog.length

  const rand = useCallback((arr) => arr[Math.floor(Math.random() * arr.length)], [])

  const showForeign = useCallback((i) => {
    const el = foreignRefs.current[i]
    if (el) {
      el.textContent = rand(ATLAS_POOLS[i])
      el.classList.add('visible')
    }
  }, [rand])

  const hideForeign = useCallback((i) => {
    const el = foreignRefs.current[i]
    if (el) el.classList.remove('visible')
  }, [])

  const scrambleLetter = useCallback((i, duration, delay) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const step = 48
        let elapsed = 0
        showForeign(i)
        const t = setInterval(() => {
          elapsed += step
          const progress = elapsed / duration
          const yShift = progress < 0.85 ? Math.sin(progress * Math.PI) * -5 : 0
          const letterEl = letterRefs.current[i]
          const foreignEl = foreignRefs.current[i]
          if (letterEl) letterEl.style.transform = `translateY(${yShift}px)`
          if (letterEl) letterEl.textContent = rand(ATLAS_POOLS[i])
          if (foreignEl) foreignEl.textContent = rand(ATLAS_POOLS[i])
          if (elapsed >= duration) {
            clearInterval(t)
            if (letterEl) {
              letterEl.classList.add('settling')
              letterEl.textContent = ATLAS_REAL[i]
              letterEl.style.transform = 'translateY(0)'
            }
            setTimeout(() => {
              hideForeign(i)
              if (letterEl) letterEl.classList.remove('settling')
              resolve()
            }, 500)
          }
        }, step)
      }, delay)
    })
  }, [rand, showForeign, hideForeign])

  const decodeAll = useCallback(() => {
    if (isDecodingRef.current) return
    isDecodingRef.current = true
    idleTimersRef.current.forEach(clearTimeout)
    idleTimersRef.current = []
    ATLAS_REAL.forEach((_, i) => {
      const letterEl = letterRefs.current[i]
      if (letterEl) letterEl.textContent = rand(ATLAS_POOLS[i])
    })
    Promise.all(ATLAS_REAL.map((_, i) => scrambleLetter(i, 360, i * 65))).then(() => {
      setTimeout(() => {
        isDecodingRef.current = false
        restartIdleGlitches()
      }, 800)
    })
  }, [rand, scrambleLetter])

  const temptGlitch = useCallback(() => {
    if (isDecodingRef.current) return
    const i = Math.floor(Math.random() * 5)
    const flickers = Math.floor(Math.random() * 2) + 2
    let f = 0
    showForeign(i)
    const t = setInterval(() => {
      const letterEl = letterRefs.current[i]
      const foreignEl = foreignRefs.current[i]
      if (letterEl) letterEl.textContent = rand(ATLAS_POOLS[i])
      if (foreignEl) foreignEl.textContent = rand(ATLAS_POOLS[i])
      if (letterEl) letterEl.style.transform = f % 2 === 0 ? 'translateY(-2px)' : 'translateY(0)'
      f += 1
      if (f >= flickers) {
        clearInterval(t)
        if (letterEl) {
          letterEl.textContent = ATLAS_REAL[i]
          letterEl.style.transform = 'translateY(0)'
        }
        setTimeout(() => hideForeign(i), 350)
      }
    }, 62)
  }, [rand, showForeign, hideForeign])

  const clearIdleTimers = useCallback(() => {
    idleTimersRef.current.forEach(clearTimeout)
    idleTimersRef.current = []
  }, [])

  const restartIdleGlitches = useCallback(() => {
    clearIdleTimers()
    const schedule = () => {
      const t = setTimeout(() => {
        temptGlitch()
        schedule()
      }, 2800 + Math.random() * 3800)
      idleTimersRef.current.push(t)
    }
    schedule()
  }, [clearIdleTimers, temptGlitch])

  useEffect(() => {
    restartIdleGlitches()
    return () => clearIdleTimers()
  }, [restartIdleGlitches, clearIdleTimers])

  const lightroomRef = useRef(null)
  useEffect(() => {
    const root = lightroomRef.current
    if (!root) return
    const radiusX = 0.38
    const radiusY = 0.28
    const x = 0.5 + radiusX * Math.cos(sunAngle)
    const y = 0.5 - radiusY * Math.sin(sunAngle)
    root.style.setProperty('--spot-x', `${x * 100}vw`)
    root.style.setProperty('--spot-y', `${y * 100}vh`)
  }, [sunAngle])

  return (
    <div
      ref={lightroomRef}
      className="relative w-full h-full min-h-0 flex flex-col items-center overflow-y-auto overflow-x-hidden bg-transparent"
      style={{ '--spot-x': '50vw', '--spot-y': '50vh' }}
    >
      <GlassFilter />
      <div className="onboarding-lightroom" aria-hidden />

      <main className="onboarding-page relative z-10 w-full max-w-3xl mx-auto px-6 sm:px-10 py-12 sm:py-16 pb-24 flex flex-col flex-shrink-0">
        {/* Header — ATLAS logo with glitch/decode animation */}
        <header className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="atlas-logo"
            onMouseEnter={decodeAll}
            role="img"
            aria-label="ATLAS"
          >
            {ATLAS_REAL.map((letter, i) => (
              <div key={i} className="atlas-letter-wrap">
                <span
                  className="atlas-foreign"
                  ref={(el) => { foreignRefs.current[i] = el }}
                  aria-hidden
                >
                  {' '}
                </span>
                <span
                  className="atlas-letter"
                  ref={(el) => { letterRefs.current[i] = el }}
                  aria-hidden
                >
                  {letter}
                </span>
              </div>
            ))}
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-3 text-[9px] tracking-[0.5em] text-white/30 uppercase"
          >
            Configure your intelligence feeds
          </motion.p>
          <div className="onboarding-header-rule" aria-hidden />
        </header>

        {/* Launch bar — template style, transparent */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-10"
        >
          <motion.button
            type="button"
            onClick={handleLaunch}
            disabled={selectedSources.length === 0}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92, opacity: 0.8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20, mass: 0.4 }}
            className="bg-transparent border-none text-[var(--accent)] font-mono text-[9px] tracking-[0.5em] uppercase py-2.5 px-7 min-h-[44px] transition-all duration-300 hover:text-[var(--accent)] hover:drop-shadow-[0_0_12px_rgba(0,207,255,0.6)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:drop-shadow-none outline-none"
            aria-label={`Launch with ${selectedSources.length} sources`}
          >
            Launch
          </motion.button>
          <span className="text-[10px] tracking-[0.2em] text-white/30 font-mono">
            {selectedSources.length} sources active
          </span>
        </motion.div>

        {/* Search — underline variant */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mb-4"
        >
          <SourceSearch variant="underline" />
        </motion.div>

        {/* Add all sources — template style, full width transparent */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          onClick={handleSelectAllSources}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 min-h-[44px] bg-transparent border border-white/10 font-mono text-[10px] tracking-[0.4em] uppercase transition-colors mb-12
            ${hasAllSources ? 'text-[var(--accent)] border-[var(--accent)]/30' : 'text-white/50 hover:border-white/20 hover:text-white/70'}`}
        >
          <span className="opacity-50 text-xs">↓</span>
          {hasAllSources ? `All ${catalog.length} sources selected` : 'Add all news sources'}
        </motion.button>

        {/* Regions — template style: vertical bar, name, Show/count, chevron; dropdown = list of checkbox rows */}
        <div className="flex flex-col gap-0">
          {REGION_ORDER.map((region, ri) => {
            const selectedInRegion = groupedSelected[region] || []
            const catalogInRegion = catalogByRegion[region] || []
            const unselectedInRegion = catalogInRegion.filter((s) => !selectedIds.has(s.id))
            const combined = [...selectedInRegion, ...unselectedInRegion]
            if (combined.length === 0) return null

            const isOpen = openRegions.has(region)

            return (
              <motion.section
                key={region}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + ri * 0.04, duration: 0.35 }}
                className={`onboarding-region border-b border-white/[0.07] ${isOpen ? 'open' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleRegionOpen(region)}
                  className="w-full flex items-center justify-between py-5 text-left min-h-[44px] cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-px h-5 bg-white/20 group-hover:bg-[var(--accent)]/50 group-hover:h-7 transition-all flex-shrink-0" aria-hidden />
                    <span className="text-[11px] tracking-[0.42em] text-white/70 group-hover:text-white/90 uppercase transition-colors">
                      {REGION_LABELS[region] || region}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[8px] tracking-[0.35em] text-white/30 uppercase">
                      {isOpen ? 'Hide' : 'Show'}
                    </span>
                    <span className="text-[8px] tracking-[0.2em] text-white/30">
                      {combined.length} sources
                    </span>
                    <div className="onboarding-region-chevron" aria-hidden />
                  </div>
                </button>

                <div
                  className="grid transition-[max-height] duration-300 ease-out overflow-hidden"
                  style={{ maxHeight: isOpen ? 600 : 0 }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5 pb-6">
                    {combined.map((source) => {
                      const isSelected = selectedIds.has(source.id)
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => handleToggle(source, isSelected)}
                          className="flex items-center gap-2 py-2 text-left min-h-[44px] cursor-pointer hover:bg-white/[0.03] transition-colors group/item"
                        >
                          <div
                            className={`onboarding-source-check ${isSelected ? 'checked' : ''}`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] tracking-[0.15em] text-white/40 group-hover/item:text-white/60 uppercase transition-colors block truncate">
                              {source.name}
                            </span>
                            {source.country && (
                              <span className="text-[8px] tracking-wider text-white/25 block truncate">
                                {source.country}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </motion.section>
            )
          })}
        </div>

        {selectedSources.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-8 text-sm text-white/25 font-mono tracking-wider text-center"
          >
            Search above or click a source below to add news feeds.
          </motion.p>
        )}
      </main>
    </div>
  )
}
