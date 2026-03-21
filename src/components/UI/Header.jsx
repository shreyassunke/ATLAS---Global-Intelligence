import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import SourceSearch from '../Onboarding/SourceSearch'

const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

const IconRadar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
    <line x1="12" y1="2" x2="12" y2="6" />
  </svg>
)

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const IconMore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
)

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)

const IconEye = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconCompass = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
)

const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const IconSetup = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

export default function Header({ hudHidden = false, onToggleHud, onToggleSources, onToggleFilters, filtersOpen }) {
  const isLoading = useAtlasStore((s) => s.isLoading)
  const toggleSettings = useAtlasStore((s) => s.toggleSettings)
  const settingsOpen = useAtlasStore((s) => s.settingsOpen)
  const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)
  const resetView = useAtlasStore((s) => s.resetView)
  const reopenOnboarding = useAtlasStore((s) => s.reopenOnboarding)
  const triggerManualRefresh = useAtlasStore((s) => s.triggerManualRefresh)
  const manualRefreshUsedToday = useAtlasStore((s) => s.manualRefreshUsedToday)
  const selectedSources = useAtlasStore((s) => s.selectedSources)
  const tierCounts = useAtlasStore((s) => s.tierCounts)
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const moreRef = useRef(null)
  const searchRef = useRef(null)

  const connectedCount = Object.values(sourceStatuses).filter(s => s.status === 'connected').length
  const totalSources = Math.max(Object.keys(sourceStatuses).length, 1)

  useEffect(() => {
    if (!moreOpen && !searchOpen) return
    function handleClickOutside(e) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [moreOpen, searchOpen])

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="hud-header"
      >
        {/* Left: Logo + status */}
        <div className="hud-header-left">
          <h1 className="atlas-logo atlas-logo-header" role="img" aria-label="ATLAS">
            {['A', 'T', 'L', 'A', 'S'].map((letter, i) => (
              <div key={i} className="atlas-letter-wrap">
                <span className="atlas-letter" aria-hidden>{letter}</span>
              </div>
            ))}
          </h1>

          <div className="hud-api-pill" title={`${connectedCount} of ${totalSources} intel sources connected`}>
            <div className={`hud-api-dot ${connectedCount > 0 ? 'connected' : 'error'}`} />
            <span>{connectedCount}/{totalSources}</span>
          </div>

          {isLoading && (
            <span className="hud-loading-pulse">Syncing</span>
          )}
        </div>

        {/* Center: Tier counts */}
        <div className="hud-header-center">
          <div className="hud-tier-counts">
            <div className="hud-tier latent" title="Latent events">
              <span className="hud-tier-shape">●</span>
              <span>{tierCounts.latent}</span>
            </div>
            <div className="hud-tier active" title="Active events">
              <span className="hud-tier-shape">◆</span>
              <span>{tierCounts.active}</span>
            </div>
            <div className="hud-tier critical" title="Critical events">
              <span className="hud-tier-shape">★</span>
              <span>{tierCounts.critical}</span>
            </div>
          </div>
        </div>

        {/* Right: Icon actions */}
        <div className="hud-header-right">
          <button
            onClick={onToggleFilters}
            className={`hud-icon-btn ${filtersOpen ? 'active' : ''}`}
            title="Intel domain filters"
          >
            <IconFilter />
          </button>

          <button
            onClick={() => onToggleSources?.()}
            className="hud-icon-btn"
            title="Intel sources panel"
          >
            <IconRadar />
          </button>

          <div className="hud-separator" />

          <button
            onClick={toggleSettings}
            className={`hud-icon-btn ${settingsOpen ? 'active' : ''}`}
            title="Settings"
          >
            <IconSettings />
          </button>

          <div className="hud-separator" />

          {/* Overflow menu */}
          <div style={{ position: 'relative' }} ref={moreRef}>
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={`hud-icon-btn ${moreOpen ? 'active' : ''}`}
              title="More actions"
            >
              <IconMore />
            </button>

            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  className="hud-dropdown"
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { resetView(); setMoreOpen(false) }}
                  >
                    <IconCompass />
                    <span>Reset View</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { onToggleHud?.(); setMoreOpen(false) }}
                  >
                    {hudHidden ? <IconEye /> : <IconEyeOff />}
                    <span>{hudHidden ? 'Show HUD' : 'Hide HUD'}</span>
                    <span className="hud-dropdown-shortcut">F</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { triggerManualRefresh?.(); setMoreOpen(false) }}
                    disabled={manualRefreshUsedToday || isLoading}
                  >
                    <IconRefresh />
                    <span>Refresh Data</span>
                  </button>

                  <div className="hud-dropdown-divider" />

                  <button
                    className="hud-dropdown-item"
                    onClick={() => { setSearchOpen(true); setMoreOpen(false) }}
                  >
                    <IconSearch />
                    <span>News Sources</span>
                    <span className="hud-dropdown-badge">{selectedSources.length}</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { reopenOnboarding(); setMoreOpen(false) }}
                  >
                    <IconSetup />
                    <span>Setup</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {/* Source search panel */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            ref={searchRef}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 right-3 z-50 w-[min(420px,calc(100vw-24px))] glass rounded-xl p-4 shadow-2xl border border-white/[0.08] pointer-events-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white tracking-wide">Manage Sources</h3>
              <button onClick={() => setSearchOpen(false)} className="text-white/40 hover:text-white transition-colors cursor-pointer text-lg leading-none">
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
