import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchVisualGkgLabels } from '../../services/gdelt/bigqueryService'

/**
 * Historical Visual GKG surface. Shows the top Cloud Vision labels GDELT
 * extracted from news imagery matching the current theme, plus a thumbnail
 * grid of representative document URLs. Backed by the `visualGkgLabels`
 * BigQuery template.
 */
export default function VgkgImageryPanel({ theme, months = 3, country = null }) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const reqIdRef = useRef(0)

  const run = useCallback(async ({ bust = false } = {}) => {
    if (!theme) return
    const id = ++reqIdRef.current
    const ac = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchVisualGkgLabels(theme, { months, country, limit: 60, signal: ac.signal, bust })
      if (id !== reqIdRef.current) return
      setState({ data, loading: false, error: null })
    } catch (e) {
      if (id !== reqIdRef.current) return
      setState({ data: null, loading: false, error: e?.message || 'Request failed' })
    }
    return () => ac.abort()
  }, [theme, months, country])

  useEffect(() => { run() /* eslint-disable-next-line */ }, [theme, months, country])

  const rows = state.data || []
  const topLabels = rows.slice(0, 18)
  const thumbs = useMemo(() => {
    return rows
      .filter((r) => r.exampleUrl && /^https?:\/\//.test(r.exampleUrl))
      .slice(0, 12)
  }, [rows])

  if (!theme) return null
  if (state.loading && !state.data) {
    return <div className="py-6 text-center text-[11px] uppercase tracking-widest text-white/35">Loading imagery…</div>
  }
  if (state.error) {
    return (
      <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/90">
        {state.error}
      </div>
    )
  }
  if (!rows.length) {
    return <p className="text-[11px] text-white/35">No imagery matches for this theme.</p>
  }

  const maxOccurrences = Math.max(1, ...rows.map((r) => Number(r.occurrences) || 0))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {topLabels.map((row) => {
          const t = (Number(row.occurrences) || 0) / maxOccurrences
          return (
            <span
              key={row.label}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/75"
              title={`${row.occurrences} occurrences · avg confidence ${(Number(row.avgConfidence) || 0).toFixed(2)}`}
            >
              <span style={{ color: `rgba(200,220,255,${0.55 + t * 0.45})` }}>{row.label}</span>
              <span className="text-white/35">· {row.occurrences}</span>
            </span>
          )
        })}
      </div>

      {thumbs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {thumbs.map((row) => (
            <a
              key={`${row.label}-${row.exampleUrl}`}
              href={row.exampleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-md border border-white/5 bg-black/30"
              title={`${row.label} · ${row.exampleUrl}`}
            >
              <div className="flex h-20 w-full items-center justify-center bg-gradient-to-br from-white/5 to-white/0 text-[9px] uppercase tracking-widest text-white/45 transition group-hover:from-white/10">
                {row.label}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70">
                {row.label}
              </div>
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-[9px] leading-relaxed text-white/30">
        <span className="flex-1">Data: GDELT Visual GKG (vgkg_partitioned) · Cloud Vision labels.</span>
        <button
          type="button"
          onClick={() => run({ bust: true })}
          disabled={state.loading}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50 hover:bg-white/10 disabled:opacity-40"
        >
          {state.loading ? '…' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
