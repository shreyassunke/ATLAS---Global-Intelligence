import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import SourceSearch from '../Onboarding/SourceSearch'

export default function Header({ hudHidden = false, onToggleHud }) {
  const lastUpdated = useAtlasStore((s) => s.lastUpdated)
  const isLoading = useAtlasStore((s) => s.isLoading)
  const manualRefreshUsedToday = useAtlasStore((s) => s.manualRefreshUsedToday)
  const triggerManualRefresh = useAtlasStore((s) => s.triggerManualRefresh)
  const reopenOnboarding = useAtlasStore((s) => s.reopenOnboarding)
  const resetView = useAtlasStore((s) => s.resetView)
  const selectedSources = useAtlasStore((s) => s.selectedSources)
  const toggleSettings = useAtlasStore((s) => s.toggleSettings)
  const settingsOpen = useAtlasStore((s) => s.settingsOpen)
  const [searchOpen, setSearchOpen] = useState(false)
  const panelRef = useRef(null)

  const timeAgo = lastUpdated
    ? (() => {
      const mins = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60000)
      if (mins < 60) return `${mins}m ago`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h ago`
      return `${Math.floor(hours / 24)}d ago`
    })()
    : '...'

  useEffect(() => {
    if (!searchOpen) return
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [searchOpen])

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-40 px-6 py-3 flex items-center justify-between pointer-events-none"
      >
        <div className="flex items-center gap-3 pointer-events-auto">
          <h1 className="atlas-logo atlas-logo-header" role="img" aria-label="ATLAS">
            {['A', 'T', 'L', 'A', 'S'].map((letter, i) => (
              <div key={i} className="atlas-letter-wrap">
                <span className="atlas-letter" aria-hidden>
                  {letter}
                </span>
              </div>
            ))}
          </h1>
          <span className="text-[10px] tracking-[0.3em] text-white/55 uppercase font-mono ml-1">
            Daily
          </span>
          {isLoading && (
            <span className="text-xs text-[var(--text-muted)] font-mono animate-pulse">
              Updating...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto hud-actions">
          <span className="hud-label text-[10px] tracking-[0.25em] text-white/40 font-mono uppercase">
            Last updated {timeAgo}
          </span>
          <button
            onClick={() => triggerManualRefresh?.()}
            disabled={manualRefreshUsedToday || isLoading}
            title={manualRefreshUsedToday ? 'Refresh limit reached for today' : 'Refresh news now (once per day)'}
            className="hud-btn"
          >
            Refresh
          </button>
          {onToggleHud && (
            <button onClick={onToggleHud} className="hud-btn">
              {hudHidden ? 'Show HUD' : 'Hide HUD'}
            </button>
          )}
          <button onClick={resetView} className="hud-btn">
            Reset View
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className={`hud-btn flex items-center gap-1.5 ${searchOpen ? 'hud-btn-active' : ''}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-80">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Sources
            <span className="opacity-50">({selectedSources.length})</span>
          </button>
          <button
            onClick={toggleSettings}
            className={`hud-btn ${settingsOpen ? 'hud-btn-active' : ''}`}
            title="Display settings"
          >
            ⚙ Settings
          </button>
          <button onClick={reopenOnboarding} className="hud-btn">
            Setup
          </button>
        </div>
      </motion.header>

      {/* Floating source search panel */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 right-6 z-50 w-[420px] glass rounded-xl p-4 shadow-2xl
                       border border-white/[0.08] pointer-events-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white tracking-wide">Manage Sources</h3>
              <button
                onClick={() => setSearchOpen(false)}
                className="text-white/40 hover:text-white transition-colors cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>
            <SourceSearch compact />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
