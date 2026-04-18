import { useEffect, useMemo, useState } from 'react'

/**
 * Historical time-range selector for the BigQuery-backed tabs. Controls the
 * `months` parameter used by every historical template, and optionally
 * syncs the selection into a URL query string (`?hist=PRESET`) so views are
 * shareable.
 */

const PRESETS = [
  { id: '1m', label: '1m', months: 1 },
  { id: '6m', label: '6m', months: 6 },
  { id: '1y', label: '1y', months: 12 },
  { id: '5y', label: '5y', months: 60 },
  { id: '10y', label: '10y', months: 120 },
  { id: '30y', label: '30y', months: 360 },
]

function readFromUrl() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const v = params.get('hist')
    if (!v) return null
    const preset = PRESETS.find((p) => p.id === v)
    if (preset) return { months: preset.months, presetId: preset.id }
    const numeric = Number(v)
    if (Number.isFinite(numeric) && numeric > 0) return { months: Math.floor(numeric), presetId: null }
  } catch {
    return null
  }
  return null
}

function writeToUrl(presetId, months) {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (presetId) url.searchParams.set('hist', presetId)
    else if (months) url.searchParams.set('hist', String(months))
    else url.searchParams.delete('hist')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* no-op */
  }
}

export default function TimeRangePicker({ value, onChange, defaultMonths = 60, syncToUrl = true }) {
  const fromUrl = useMemo(() => (syncToUrl ? readFromUrl() : null), [syncToUrl])
  const initialMonths = value ?? fromUrl?.months ?? defaultMonths
  const [months, setMonths] = useState(initialMonths)
  const [presetId, setPresetId] = useState(fromUrl?.presetId || PRESETS.find((p) => p.months === initialMonths)?.id || null)

  useEffect(() => {
    if (value != null && value !== months) setMonths(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const applyMonths = (m, pid) => {
    const clamped = Math.max(1, Math.min(360, Math.floor(Number(m) || defaultMonths)))
    setMonths(clamped)
    setPresetId(pid ?? null)
    if (syncToUrl) writeToUrl(pid ?? null, clamped)
    onChange?.(clamped, pid ?? null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-1.5">
      <span className="px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-white/35">Range</span>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => applyMonths(p.months, p.id)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
            presetId === p.id
              ? 'bg-white/15 text-white'
              : 'text-white/45 hover:bg-white/5 hover:text-white/75'
          }`}
        >
          {p.label}
        </button>
      ))}
      <label className="ml-auto flex items-center gap-1 text-[9px] text-white/45">
        <span>Custom</span>
        <input
          type="number"
          min={1}
          max={360}
          value={months}
          onChange={(e) => applyMonths(e.target.value, null)}
          className="w-14 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-right text-[10px] text-white/85 outline-none focus:border-white/25"
          aria-label="Custom months"
        />
        <span>mo</span>
      </label>
    </div>
  )
}

export { PRESETS as TIME_RANGE_PRESETS }
