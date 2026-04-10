import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import {
  DIMENSION_COLORS, DIMENSIONS, DIMENSION_LABELS, DIMENSION_ICONS,
  PRIORITIES, PRIORITY_LABELS, formatToneScore
} from '../../core/eventSchema'
import CausalThread from './CausalThread'

const IconStreetView = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <path d="M6 16l6 4 6-4" />
  </svg>
)

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function EventPanel() {
  const selectedEvent = useAtlasStore((s) => s.selectedEvent)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)

  return (
    <AnimatePresence>
      {selectedEvent && (
        <motion.div
          key="event-panel"
          className="event-panel"
          role="dialog"
          aria-label={`${DIMENSION_LABELS[selectedEvent.dimension] || selectedEvent.dimension} event: ${selectedEvent.title}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="event-panel-header">
            <div style={{ flex: 1 }}>
              {/* Dimension badge — color-coded circle + civilian label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className="event-dimension-badge"
                  style={{
                    '--dim-color': DIMENSION_COLORS[selectedEvent.dimension] || '#378ADD',
                  }}
                >
                  <span
                    className="event-dimension-dot"
                    style={{ backgroundColor: DIMENSION_COLORS[selectedEvent.dimension] }}
                  />
                  {DIMENSION_LABELS[selectedEvent.dimension] || selectedEvent.dimension}
                </span>
                <span className={`event-priority-indicator event-priority-${selectedEvent.priority}`}>
                  {PRIORITY_LABELS[selectedEvent.priority] || selectedEvent.priority?.toUpperCase()}
                </span>
              </div>
              {/* Headline — raw from source, unedited */}
              <h3 className="event-panel-title">{selectedEvent.title}</h3>
              {/* Source attribution + timestamp */}
              <div className="event-panel-attribution">
                {selectedEvent.source} · {timeAgo(selectedEvent.timestamp)}
              </div>
            </div>
            <button
              className="feed-close-btn"
              onClick={() => setSelectedEvent(null)}
              style={{ marginLeft: 8, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          <div className="event-panel-body">
            <div className="event-meta-grid">
              <div className="event-meta-item">
                <span className="event-meta-label">Severity</span>
                <div className="event-severity-bar">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className={`event-severity-pip ${n <= selectedEvent.severity ? 'active' : ''}`}
                      style={n <= selectedEvent.severity ? { '--pip-color': DIMENSION_COLORS[selectedEvent.dimension] } : {}}
                    />
                  ))}
                </div>
              </div>

              <div className="event-meta-item">
                <span className="event-meta-label">Sources</span>
                <span className="event-meta-value">
                  {selectedEvent.corroborationCount} source{selectedEvent.corroborationCount !== 1 ? 's' : ''}
                  {selectedEvent.authoritative && (
                    <span className="source-badge-auth" style={{ marginLeft: 6 }}>AUTH</span>
                  )}
                </span>
              </div>

              <div className="event-meta-item">
                <span className="event-meta-label">Coordinates</span>
                <span className="event-meta-value">
                  {selectedEvent.latApproximate ? '≈ ' : ''}
                  {selectedEvent.lat.toFixed(2)}°, {selectedEvent.lng.toFixed(2)}°
                  {selectedEvent.locationName && (
                    <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 }}>
                      {selectedEvent.locationName}
                    </span>
                  )}
                </span>
              </div>

              <div className="event-meta-item">
                <span className="event-meta-label">Time</span>
                <span className="event-meta-value">{timeAgo(selectedEvent.timestamp)}</span>
              </div>

              {/* GDELT tone score — "Global coverage tone" */}
              {selectedEvent.toneScore != null && (
                <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="event-meta-label">Global Coverage Tone</span>
                  <span className="event-meta-value">
                    {(() => {
                      const tone = formatToneScore(selectedEvent.toneScore)
                      return (
                        <span className={`tone-indicator tone-${tone.sentiment}`}>
                          {tone.label} ({tone.score})
                        </span>
                      )
                    })()}
                  </span>
                </div>
              )}
            </div>

            {selectedEvent.detail && (
              <p className="event-detail-text">{selectedEvent.detail}</p>
            )}

            {selectedEvent.disputed && (
              <div style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'rgba(255, 170, 0, 0.08)',
                border: '1px solid rgba(255, 170, 0, 0.2)',
                fontFamily: 'var(--font-hud)',
                fontSize: '9px',
                letterSpacing: '0.15em',
                color: 'var(--priority-p2)',
              }}>
                ⚠ Sources disagree on severity
              </div>
            )}

            {selectedEvent.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedEvent.tags.slice(0, 6).map((tag) => (
                  <span key={tag} style={{
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    fontFamily: 'var(--font-data)',
                    fontSize: '9px',
                    color: 'var(--text-muted)',
                    opacity: 0.6,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Causal thread — Related Signals section */}
            <CausalThread event={selectedEvent} />

            <div style={{ display: 'flex', gap: 6 }}>
              {selectedEvent.sourceUrl && (
                <a
                  href={selectedEvent.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-source-link"
                  style={{ flex: 1 }}
                >
                  ↗ View Source
                </a>
              )}
              {!selectedEvent.latApproximate && selectedEvent.lat != null && (
                <button
                  className="event-source-link"
                  style={{ flex: 0, whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    useAtlasStore.getState().openStreetView({
                      lat: selectedEvent.lat,
                      lng: selectedEvent.lng,
                      source: 'event',
                      meta: {
                        title: selectedEvent.title,
                        detail: selectedEvent.detail,
                        dimension: selectedEvent.dimension,
                        source: selectedEvent.source,
                      },
                    })
                  }}
                >
                  <IconStreetView />
                  Street View
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
