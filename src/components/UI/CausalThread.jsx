import { useMemo } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { DIMENSION_COLORS, DIMENSION_LABELS, DIMENSION_ICONS } from '../../core/eventSchema'

const RADIUS_KM = 500
const TIME_WINDOW_MS = 7 * 24 * 3600_000 // ±7 days

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = (d) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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

/**
 * CausalThread — "Related Signals" section of the event panel.
 *
 * Given a selected event, queries the event store for events in the
 * same region (within ~500 km) and overlapping time window (±7 days)
 * but in different dimensions. Displays as a compact timeline.
 */
export default function CausalThread({ event }) {
  const events = useAtlasStore((s) => s.events)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)

  const relatedSignals = useMemo(() => {
    if (!event || !events.length) return []

    const eventTime = new Date(event.timestamp).getTime()

    return events
      .filter((e) => {
        if (e.id === event.id) return false
        // Different dimension
        if (e.dimension === event.dimension) return false
        // Within time window
        const eTime = new Date(e.timestamp).getTime()
        if (Math.abs(eTime - eventTime) > TIME_WINDOW_MS) return false
        // Within radius
        const dist = haversineKm(event.lat, event.lng, e.lat, e.lng)
        if (dist > RADIUS_KM) return false
        return true
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(0, 6) // cap at 6 related signals
  }, [event, events])

  if (!event) return null

  return (
    <div className="causal-thread">
      <div className="causal-thread-header">
        Related Signals
      </div>

      {relatedSignals.length === 0 ? (
        <div className="causal-thread-empty">
          No related signals found
        </div>
      ) : (
        <div className="causal-thread-list">
          {relatedSignals.map((signal, index) => (
            <button
              key={signal.id}
              className="causal-thread-item"
              onClick={() => setSelectedEvent(signal)}
            >
              <div className="causal-thread-connector">
                <div
                  className="causal-thread-dot"
                  style={{ backgroundColor: DIMENSION_COLORS[signal.dimension] }}
                />
                {index < relatedSignals.length - 1 && (
                  <div className="causal-thread-line" />
                )}
              </div>
              <div className="causal-thread-content">
                <span
                  className="causal-thread-dim"
                  style={{ color: DIMENSION_COLORS[signal.dimension] }}
                >
                  {DIMENSION_ICONS[signal.dimension]} {DIMENSION_LABELS[signal.dimension]}
                </span>
                <span className="causal-thread-title">
                  {signal.title}
                </span>
                <span className="causal-thread-meta">
                  {signal.source} · {timeAgo(signal.timestamp)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
