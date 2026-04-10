import { useAtlasStore } from '../../store/atlasStore'
import { DIMENSIONS, DIMENSION_COLORS, DIMENSION_LABELS, DIMENSION_ICONS } from '../../core/eventSchema'

const DIMENSION_DEFS = Object.values(DIMENSIONS).map(dim => ({
  id: dim,
  label: DIMENSION_LABELS[dim],
  icon: DIMENSION_ICONS[dim],
  color: DIMENSION_COLORS[dim]
}))

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'P1', description: 'Breaking only' },
  { value: 'p1p2', label: 'P1+P2', description: 'Breaking + Active' },
  { value: 'all', label: 'All', description: 'Everything' },
]

const TIME_OPTIONS = [
  { value: 'live', label: 'Live' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

export default function DimensionFilters() {
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const toggleDimension = useAtlasStore((s) => s.toggleDimension)
  const priorityFilter = useAtlasStore((s) => s.priorityFilter)
  const setPriorityFilter = useAtlasStore((s) => s.setPriorityFilter)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const setTimeFilter = useAtlasStore((s) => s.setTimeFilter)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  if (mobileMode) {
    return (
      <div style={{ padding: '8px 12px' }}>
        {/* Dimension toggles */}
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 6,
        }}>
          {DIMENSION_DEFS.map((d) => {
            const active = activeDimensions.has(d.id)
            return (
              <button
                key={d.id}
                onClick={() => toggleDimension(d.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  border: `1px solid ${active ? d.color + '50' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 20,
                  background: active ? d.color + '18' : 'transparent',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-data)',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  color: active ? d.color : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  minHeight: 36,
                }}
              >
                {d.icon} {d.label}
              </button>
            )
          })}
        </div>

        {/* Priority filter (mobile) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <span style={{
            fontFamily: 'var(--font-hud)',
            fontSize: '7px',
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Priority
          </span>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-toggle-btn ${priorityFilter === opt.value ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px', fontSize: '10px', minHeight: 32 }}
                onClick={() => setPriorityFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time scrubber (mobile) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingTop: 4,
        }}>
          <span style={{
            fontFamily: 'var(--font-hud)',
            fontSize: '7px',
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Time
          </span>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`settings-toggle-btn ${timeFilter === opt.value ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px', fontSize: '10px', minHeight: 32 }}
                onClick={() => setTimeFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '8px 0',
    }}>
      <div style={{
        fontFamily: 'var(--font-hud)',
        fontSize: '8px',
        letterSpacing: '0.2em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        padding: '0 9px',
      }}>
        Dimensions
      </div>

      {DIMENSION_DEFS.map((d) => {
        const active = activeDimensions.has(d.id)
        return (
          <button
            key={d.id}
            className={`filters-row ${active ? 'filters-row-active' : ''}`}
            onClick={() => toggleDimension(d.id)}
          >
            <div
              className="filters-dot"
              style={{
                backgroundColor: d.color,
                opacity: active ? 1 : 0.3,
              }}
            />
            <span className="filters-label">
              {d.icon} {d.label}
            </span>
          </button>
        )
      })}

      {/* Priority Filter */}
      <div style={{
        fontFamily: 'var(--font-hud)',
        fontSize: '8px',
        letterSpacing: '0.15em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        padding: '8px 9px 2px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        Priority
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: '7px',
        color: 'rgba(255,255,255,0.2)',
        padding: '0 9px 4px',
        letterSpacing: '0.02em',
      }}>
        {PRIORITY_OPTIONS.find(o => o.value === priorityFilter)?.description || 'Breaking only'}
      </div>

      <div style={{ display: 'flex', gap: 2, padding: '0 9px' }}>
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`settings-toggle-btn ${priorityFilter === opt.value ? 'active' : ''}`}
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setPriorityFilter(opt.value)}
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Time Scrubber */}
      <div style={{
        fontFamily: 'var(--font-hud)',
        fontSize: '8px',
        letterSpacing: '0.15em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        padding: '8px 9px 2px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        Time Range
      </div>

      <div style={{ display: 'flex', gap: 2, padding: '0 9px' }}>
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`settings-toggle-btn ${timeFilter === opt.value ? 'active' : ''}`}
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setTimeFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
