import { useAtlasStore } from '../../store/atlasStore'
import { DOMAINS } from '../../core/eventSchema'

const DOMAIN_DEFS = [
  { id: DOMAINS.CONFLICT, label: 'Conflict', icon: '⚔', color: '#ef4444' },
  { id: DOMAINS.CYBER, label: 'Cyber', icon: '⚡', color: '#8b5cf6' },
  { id: DOMAINS.NATURAL, label: 'Natural', icon: '🌊', color: '#22c55e' },
  { id: DOMAINS.HUMANITARIAN, label: 'Humanitarian', icon: '👤', color: '#f97316' },
  { id: DOMAINS.ECONOMIC, label: 'Economic', icon: '📈', color: '#eab308' },
  { id: DOMAINS.SIGNALS, label: 'Signals', icon: '◎', color: '#06b6d4' },
  { id: DOMAINS.HAZARD, label: 'Hazard', icon: '☢', color: '#dc2626' },
]

export default function DomainFilters() {
  const activeDomains = useAtlasStore((s) => s.activeDomains)
  const toggleDomain = useAtlasStore((s) => s.toggleDomain)
  const severityFloor = useAtlasStore((s) => s.severityFloor)
  const setSeverityFloor = useAtlasStore((s) => s.setSeverityFloor)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  if (mobileMode) {
    return (
      <div style={{ padding: '8px 12px' }}>
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 6,
        }}>
          {DOMAIN_DEFS.map((d) => {
            const active = activeDomains.has(d.id)
            return (
              <button
                key={d.id}
                onClick={() => toggleDomain(d.id)}
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
            Sev {severityFloor === 1 ? 'All' : severityFloor === 5 ? 'Crit' : `${severityFloor}+`}
          </span>
          <div style={{ display: 'flex', gap: 2, flex: 1 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`settings-toggle-btn ${severityFloor === n ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px', fontSize: '10px', minHeight: 32 }}
                onClick={() => setSeverityFloor(n)}
              >
                {n}
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
        INTEL DOMAINS
      </div>

      {DOMAIN_DEFS.map((d) => {
        const active = activeDomains.has(d.id)
        return (
          <button
            key={d.id}
            className={`filters-row ${active ? 'filters-row-active' : ''}`}
            onClick={() => toggleDomain(d.id)}
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

      <div style={{
        fontFamily: 'var(--font-hud)',
        fontSize: '8px',
        letterSpacing: '0.15em',
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        padding: '8px 9px 2px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        MIN SEVERITY
      </div>
      <div style={{
        fontFamily: 'var(--font-data)',
        fontSize: '7px',
        color: 'rgba(255,255,255,0.2)',
        padding: '0 9px 4px',
        letterSpacing: '0.02em',
      }}>
        {severityFloor === 1 ? 'Showing all' : severityFloor === 5 ? 'Critical only' : `Level ${severityFloor}+`}
      </div>

      <div style={{ display: 'flex', gap: 2, padding: '0 9px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`settings-toggle-btn ${severityFloor === n ? 'active' : ''}`}
            style={{ flex: 1, padding: '4px', fontSize: '10px' }}
            onClick={() => setSeverityFloor(n)}
            title={n === 1 ? 'Show all events' : n === 5 ? 'Critical only' : `Severity ${n} and above`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
