import { useEffect, useMemo, useState } from 'react'
import { subscribeToSourceStatus, getSourceStatuses } from '../../core/eventBus'

/**
 * Dev-only overlay showing the live status of every worker source. Any source
 * with `eventCount === 0` or `status === 'error'` is highlighted so a dry
 * globe becomes obvious at a glance.
 *
 * Activation: append `?debug=1` to the URL or set `localStorage.atlasDebug = '1'`.
 */

function isDebugEnabled() {
  try {
    if (typeof window === 'undefined') return false
    if (!import.meta?.env?.DEV) return false
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === '1') return true
    return window.localStorage?.getItem('atlasDebug') === '1'
  } catch {
    return false
  }
}

function formatRelativeTime(ts) {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 0) return 'now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}

function statusColor(row) {
  if (row?.status === 'error') return '#f87171'
  if (row?.status === 'partial') return '#fbbf24'
  if ((row?.eventCount || 0) === 0) return '#94a3b8'
  return '#4ade80'
}

/**
 * Shown on first globe load while GDELT workers warm up (~30–40s DOC chain / ZIP).
 * Hides when either `gdelt` or `gdelt-cameo` reports events, or after 60s.
 */
export function GdeltConnectingBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [statuses, setStatuses] = useState(() => getSourceStatuses())

  useEffect(() => {
    const unsub = subscribeToSourceStatus(setStatuses)
    const t = setTimeout(() => setDismissed(true), 60_000)
    return () => {
      unsub?.()
      clearTimeout(t)
    }
  }, [])

  const gdelt = statuses.gdelt
  const cameo = statuses['gdelt-cameo']
  const hasData =
    (typeof gdelt?.eventCount === 'number' && gdelt.eventCount > 0) ||
    (typeof cameo?.eventCount === 'number' && cameo.eventCount > 0)

  useEffect(() => {
    if (hasData) setDismissed(true)
  }, [hasData])

  if (dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 9999,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: 12,
        color: 'rgba(226, 232, 240, 0.95)',
        background: 'rgba(15, 23, 42, 0.82)',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 9999,
        padding: '8px 16px',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      }}
    >
      Connecting to GDELT… (first load can take ~30s)
    </div>
  )
}

export default function FetchStatusOverlay() {
  const [enabled] = useState(isDebugEnabled)
  const [collapsed, setCollapsed] = useState(false)
  const [statuses, setStatuses] = useState(() => getSourceStatuses())

  useEffect(() => {
    if (!enabled) return
    const unsub = subscribeToSourceStatus(setStatuses)
    return () => unsub && unsub()
  }, [enabled])

  const rows = useMemo(() => {
    return Object.entries(statuses)
      .map(([id, row]) => ({ id, ...row }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [statuses])

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 10_000,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
        color: '#e5e7eb',
        background: 'rgba(15, 23, 42, 0.88)',
        border: '1px solid rgba(148, 163, 184, 0.3)',
        borderRadius: 8,
        padding: collapsed ? '6px 10px' : '10px 12px',
        maxWidth: 360,
        maxHeight: '60vh',
        overflow: 'auto',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: collapsed ? 0 : 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <strong style={{ letterSpacing: 0.5 }}>
          FETCH · {rows.length} source{rows.length === 1 ? '' : 's'}
        </strong>
        <span style={{ color: '#94a3b8' }}>{collapsed ? '▲' : '▼'}</span>
      </div>
      {!collapsed && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ paddingRight: 8 }}>source</th>
              <th style={{ paddingRight: 8 }}>events</th>
              <th style={{ paddingRight: 8 }}>updated</th>
              <th>state</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: '#94a3b8', paddingTop: 6 }}>
                  waiting for first fetch…
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td
                  style={{
                    paddingRight: 8,
                    color: statusColor(row),
                    whiteSpace: 'nowrap',
                  }}
                  title={row.error || row.warning || ''}
                >
                  ● {row.id}
                </td>
                <td style={{ paddingRight: 8, fontVariantNumeric: 'tabular-nums' }}>
                  {row.eventCount ?? 0}
                </td>
                <td style={{ paddingRight: 8, color: '#cbd5f5' }}>
                  {formatRelativeTime(row.lastFetch)}
                </td>
                <td style={{ color: '#cbd5f5' }}>
                  {row.status || '—'}
                  {row.warning ? ' ⚠' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
