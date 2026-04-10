import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { getTimezoneViewCenter } from '../../utils/geo'

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/** IANA id for header display, e.g. America/Indianapolis → AMERICA/INDIANAPOLIS */
function formatTimezoneHeaderId(timeZone) {
  return timeZone.toUpperCase()
}

/** Short region label for narrow headers (e.g. Indianapolis, NEW YORK) */
function formatTimezoneShort(timeZone) {
  const last = timeZone.split('/').pop() || timeZone
  return last.toUpperCase().replace(/_/g, ' ')
}

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

function TimezoneDropdown({
  format,
  setFormat,
  timezone,
  setTimezone,
  search,
  setSearch,
  filteredTimezones,
  onClose,
}) {
  return (
    <div className="hud-mission-clock__dropdown">
      <div className="hud-mission-clock__dropdown-top">
        <div className="hud-mission-clock__format-toggle" role="group" aria-label="Time format">
          <button
            type="button"
            data-active={format === FORMAT_12H}
            onClick={() => setFormat(FORMAT_12H)}
          >
            12H
          </button>
          <button
            type="button"
            data-active={format === FORMAT_24H}
            onClick={() => setFormat(FORMAT_24H)}
          >
            24H
          </button>
        </div>
        <button type="button" className="hud-mission-clock__close" onClick={onClose} aria-label="Close">
          <IconClose />
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search timezones"
        className="hud-mission-clock__search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Filter timezones"
      />

      <ul className="hud-mission-clock__list" role="listbox" aria-label="Timezones">
        {filteredTimezones.length === 0 ? (
          <li className="px-3 py-4 text-center text-[10px] text-white/35">
            No matches
          </li>
        ) : (
          filteredTimezones.map((tz) => {
            const active = tz.id === timezone
            return (
              <li key={tz.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => {
                    setTimezone(tz.id)
                    onClose()
                  }}
                >
                  {tz.id}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

/** Centered mission clock in the HUD header (all breakpoints). */
export function MissionClock() {
  const [now, setNow] = useState(() => new Date())
  const [timezone, setTimezone] = useState(() => getDefaultTimezone())
  const [format, setFormat] = useState(FORMAT_12H)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef(null)
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  const timeString = useMemo(
    () => formatTime(now, timezone, format),
    [now, timezone, format],
  )

  const tzHeader = useMemo(
    () =>
      mobileMode ? formatTimezoneShort(timezone) : formatTimezoneHeaderId(timezone),
    [timezone, mobileMode],
  )

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

  return (
    <div
      ref={rootRef}
      className={`hud-mission-clock${mobileMode ? ' hud-mission-clock--mobile' : ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hud-mission-clock__trigger"
        aria-expanded={open}
        aria-label="Mission time and timezone"
      >
        <div className="hud-mission-clock__row">
          <span className="hud-mission-clock__tz">{tzHeader}</span>
          <span className="hud-mission-clock__time">{timeString}</span>
        </div>
        <span className="hud-mission-clock__coords">{coordsLabel}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="tz-panel"
            className={`hud-mission-clock__panel-wrap${mobileMode ? ' hud-mission-clock__panel-wrap--mobile' : ''}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <TimezoneDropdown
              format={format}
              setFormat={setFormat}
              timezone={timezone}
              setTimezone={setTimezone}
              search={search}
              setSearch={setSearch}
              filteredTimezones={filteredTimezones}
              onClose={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
