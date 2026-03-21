import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GlassPanel } from '../UI/liquid-glass'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'

const TIMEZONES = [
  { id: 'UTC', label: 'UTC — Coordinated Universal Time' },
  { id: 'America/Los_Angeles', label: 'Los Angeles — Pacific Time' },
  { id: 'America/Denver', label: 'Denver — Mountain Time' },
  { id: 'America/Chicago', label: 'Chicago — Central Time' },
  { id: 'America/New_York', label: 'New York — Eastern Time' },
  { id: 'America/Sao_Paulo', label: 'São Paulo — Brasil' },
  { id: 'Europe/London', label: 'London — UK' },
  { id: 'Europe/Berlin', label: 'Berlin — Central Europe' },
  { id: 'Europe/Moscow', label: 'Moscow — Russia' },
  { id: 'Africa/Johannesburg', label: 'Johannesburg — South Africa' },
  { id: 'Asia/Dubai', label: 'Dubai — UAE' },
  { id: 'Asia/Kolkata', label: 'Mumbai — India' },
  { id: 'Asia/Singapore', label: 'Singapore — SG' },
  { id: 'Asia/Shanghai', label: 'Shanghai — China' },
  { id: 'Asia/Tokyo', label: 'Tokyo — Japan' },
  { id: 'Australia/Sydney', label: 'Sydney — Australia' },
]

const FORMAT_12H = '12h'
const FORMAT_24H = '24h'

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function formatTime(date, timeZone, format) {
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: format === FORMAT_12H,
    timeZone,
  }
  const formatter = new Intl.DateTimeFormat(undefined, options)
  const parts = formatter.formatToParts(date)
  const core = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
  if (format === FORMAT_12H) {
    const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value
    if (dayPeriod) {
      return `${core} ${dayPeriod.toUpperCase()}`
    }
  }
  return core
}

function getTimezoneLabel(timeZone) {
  const match = TIMEZONES.find((tz) => tz.id === timeZone)
  if (match) return match.label
  return timeZone
}

export default function ClockOverlay() {
  const [now, setNow] = useState(() => new Date())
  const [timezone, setTimezone] = useState(() => getDefaultTimezone())
  const [format, setFormat] = useState(FORMAT_12H)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const buttonRef = useRef(null)
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (initialized) return
    if (typeof window === 'undefined') return
    const width = window.innerWidth || 0
    setPosition({
      x: Math.max(24, width - 320),
      y: 64,
    })
    setInitialized(true)
  }, [initialized])

  const timeString = useMemo(
    () => formatTime(now, timezone, format),
    [now, timezone, format],
  )

  const shortTz = useMemo(() => {
    const label = getTimezoneLabel(timezone)
    const [city] = label.split('—')
    return city.trim()
  }, [timezone])

  const filteredTimezones = useMemo(() => {
    if (!search.trim()) return TIMEZONES
    const q = search.toLowerCase()
    return TIMEZONES.filter(
      (tz) =>
        tz.id.toLowerCase().includes(q) ||
        tz.label.toLowerCase().includes(q),
    )
  }, [search])

  const coordsLabel = useMemo(() => {
    let lat = selectedMarker?.lat
    let lng = selectedMarker?.lng

    if (lat == null || lng == null) {
      const center = getTimezoneViewCenter(timezone)
      lat = center?.lat
      lng = center?.lng
    }

    if (lat == null || lng == null) return 'Lat —   Lon —'
    const latStr = lat.toFixed(2)
    const lngStr = lng.toFixed(2)
    return `Lat ${latStr}°   Lon ${lngStr}°`
  }, [selectedMarker, timezone])

  const handleMouseMove = (e) => {
    dragMovedRef.current = true
    const width = window.innerWidth || 0
    const height = window.innerHeight || 0
    const minMargin = 8
    const newX = e.clientX - dragOffsetRef.current.x
    const newY = e.clientY - dragOffsetRef.current.y
    const clampedX = Math.min(
      Math.max(minMargin, newX),
      Math.max(minMargin, width - 220),
    )
    const clampedY = Math.min(
      Math.max(minMargin, newY),
      Math.max(minMargin, height - 40),
    )
    setPosition({ x: clampedX, y: clampedY })
  }

  const handleMouseUp = () => {
    setDragging(false)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    if (buttonRef.current && !buttonRef.current.contains(e.target)) return
    dragMovedRef.current = false
    setDragging(true)
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleToggleOpen = () => {
    if (dragMovedRef.current) return
    setOpen((v) => !v)
  }

  if (mobileMode) {
    return (
      <motion.div
        className="fixed top-[42px] right-2 z-[35] pointer-events-auto"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.4 }}
      >
        <div className="flex items-baseline gap-1.5 text-[9px] text-white/80 font-mono tracking-[0.14em] uppercase">
          <span className="text-white/50">{shortTz}</span>
          <span>{timeString}</span>
        </div>
        <div className="text-[7px] text-white/30 font-mono tracking-[0.14em] uppercase text-right">
          {coordsLabel}
        </div>
      </motion.div>
    )
  }

  /* z-[35]: stay below .hud-header (z-40) so ⋯ dropdown isn’t covered by clock/lat-lon text */
  return (
    <motion.div
      className="fixed inset-0 z-[35] pointer-events-none"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: 1.5, duration: 0.4 }}
    >
      <div
        className="absolute pointer-events-auto"
        style={{
          left: position.x,
          top: position.y,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Minimal collapsed clock + coordinates */}
        <div className="flex flex-col items-end">
          <button
            type="button"
            ref={buttonRef}
            onClick={handleToggleOpen}
            className="px-0 py-0 text-[11px] text-white/90 font-mono tracking-[0.18em] uppercase flex items-baseline gap-2 cursor-pointer bg-transparent border-none shadow-none"
            aria-expanded={open}
            aria-label="Open time controls"
          >
            <span className="text-white/70">
              {shortTz}
            </span>
            <span className="tracking-[0.14em]">
              {timeString}
            </span>
          </button>
          <span className="mt-0.5 text-[9px] text-white/40 font-mono tracking-[0.18em] uppercase">
            {coordsLabel}
          </span>
        </div>

        {/* Expanded control panel */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 12, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="mt-2 w-[320px]"
            >
              <GlassPanel className="rounded-lg overflow-hidden clock-panel">
                <div className="relative px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        Mission Time
                      </span>
                      <span className="mt-1 text-lg font-mono tracking-[0.16em] text-white">
                        {timeString}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="inline-flex items-center rounded bg-white/5 p-0.5">
                        <button
                          type="button"
                          onClick={() => setFormat(FORMAT_12H)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-widest cursor-pointer transition-colors ${
                            format === FORMAT_12H
                              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                              : 'text-[var(--text-muted)] hover:text-white'
                          }`}
                        >
                          12H
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormat(FORMAT_24H)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono tracking-widest cursor-pointer transition-colors ${
                            format === FORMAT_24H
                              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                              : 'text-[var(--text-muted)] hover:text-white'
                          }`}
                        >
                          24H
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="text-[10px] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1.5">
                      Timezone
                    </label>
                    <div className="relative mb-2">
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search city or region"
                        className="w-full rounded bg-black/40 border border-white/10 px-3 py-1.5 text-[11px] font-mono text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/60"
                      />
                      <span className="pointer-events-none absolute right-3 top-1.5 text-[10px] text-[var(--text-muted)]">
                        {filteredTimezones.length}
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto pr-1 space-y-1">
                      {filteredTimezones.map((tz) => {
                        const active = tz.id === timezone
                        return (
                          <button
                            key={tz.id}
                            type="button"
                            onClick={() => setTimezone(tz.id)}
                            className={`w-full text-left rounded px-2 py-1.5 text-[11px] cursor-pointer transition-colors ${
                              active
                                ? 'bg-white/10 text-white'
                                : 'text-[var(--text-muted)] hover:bg-white/5'
                            }`}
                          >
                            <span className="block font-mono tracking-wide">
                              {tz.id}
                            </span>
                            <span className="block text-[10px] opacity-70">
                              {tz.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

