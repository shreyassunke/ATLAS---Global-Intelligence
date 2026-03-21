import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { SOURCE_CATALOG } from '../../core/sourceRegistry'

function timeAgo(ts) {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

export default function SourcesPanel({ open, onClose }) {
  const sourceStatuses = useAtlasStore((s) => s.sourceStatuses)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const [filter, setFilter] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open, onClose])

  const entries = Object.entries(SOURCE_CATALOG)
    .filter(([id, s]) => {
      if (!filter) return true
      return s.name.toLowerCase().includes(filter.toLowerCase()) ||
        s.module.toLowerCase().includes(filter.toLowerCase())
    })
    .sort((a, b) => a[1].name.localeCompare(b[1].name))

  const connectedCount = Object.values(sourceStatuses).filter(s => s.status === 'connected').length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="sources-panel"
          className="settings-panel"
          style={{
            width: mobileMode ? 'calc(100vw - 32px)' : 380,
            right: mobileMode ? 16 : 6,
            maxHeight: 'calc(100vh - 70px)',
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="settings-header">
            <span className="settings-title">
              SOURCES — {connectedCount}/{entries.length} CONNECTED
            </span>
            <button className="settings-close" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding: '8px 16px' }}>
            <input
              type="text"
              placeholder="Search sources..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: '6px 10px',
                fontFamily: 'var(--font-data)',
                fontSize: '10px',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ padding: '0 16px 16px', maxHeight: 500, overflowY: 'auto' }}>
            {entries.map(([id, source]) => {
              const status = sourceStatuses[id]
              const isConnected = status?.status === 'connected'
              const isError = status?.status === 'error'

              return (
                <div key={id} className="source-status-row">
                  <div className={`api-health-dot ${isConnected ? 'connected' : isError ? 'error' : 'stale'}`} />
                  <span className="source-status-name">{source.name}</span>
                  {source.authoritative && (
                    <span className="source-badge-auth">AUTH</span>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: '8px',
                    color: 'var(--text-muted)',
                    opacity: 0.5,
                  }}>
                    {status?.lastFetch ? timeAgo(status.lastFetch) : '—'}
                  </span>
                  {status?.eventCount !== undefined && (
                    <span style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: '8px',
                      color: 'var(--text-muted)',
                      opacity: 0.5,
                    }}>
                      {status.eventCount}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
