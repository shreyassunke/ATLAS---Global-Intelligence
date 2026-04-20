/**
 * HeaderSearchBar — Google Earth–style place search in the Atlas HUD header.
 *
 * Minimalist collapsed state: a single icon button. Click (or press `/` on
 * the globe) to expand into a slim input with autocomplete predictions.
 * Selecting a result flies the active globe to that location and paints
 * a highlight ring via the `searchHighlight` store field.
 *
 * Intentionally sits in the left zone next to the ATLAS wordmark so the
 * center mission-clock and the right-hand icon cluster are untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import {
  searchPlacePredictions,
  resolvePlaceDetails,
  newPlacesSessionToken,
  fetchPlaceBoundary,
} from '../../utils/googleMaps'

const IconSearch = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const IconClose = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
)

const IconPin = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const DEBOUNCE_MS = 180
const MIN_CHARS = 2

export default function HeaderSearchBar() {
  const flyToLocation = useAtlasStore((s) => s.flyToLocation)
  const setSearchHighlight = useAtlasStore((s) => s.setSearchHighlight)
  const clearSearchHighlight = useAtlasStore((s) => s.clearSearchHighlight)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [error, setError] = useState(null)

  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const reqIdRef = useRef(0)

  const resetSessionToken = useCallback(async () => {
    sessionTokenRef.current = await newPlacesSessionToken()
  }, [])

  const closeAndReset = useCallback(() => {
    setOpen(false)
    setQuery('')
    setPredictions([])
    setError(null)
    setHighlighted(0)
  }, [])

  useEffect(() => {
    if (!open) return
    // Kick off a fresh autocomplete session per expansion so Google's
    // Places billing collapses a burst of prediction calls + one details
    // lookup into a single session — exactly like Google Earth.
    resetSessionToken()
    // Defer focus until after the expand animation begins so the caret
    // lands in the visible input, not an off-screen ghost.
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, resetSessionToken])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        closeAndReset()
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('touchstart', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('touchstart', onClickOutside)
    }
  }, [open, closeAndReset])

  // `/` global hotkey — mirrors Google Earth's search-focus shortcut and
  // gives power users a way to jump straight into the input without
  // losing globe focus. Skipped while typing in any editable control.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (
        t instanceof Element &&
        t.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < MIN_CHARS) {
      setPredictions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqIdRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlacePredictions(q, sessionTokenRef.current)
        if (reqIdRef.current !== myReq) return
        setPredictions(results)
        setHighlighted(0)
        setError(null)
      } catch (err) {
        if (reqIdRef.current !== myReq) return
        setError('Search unavailable')
        setPredictions([])
      } finally {
        if (reqIdRef.current === myReq) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const selectPrediction = useCallback(
    async (pred) => {
      if (!pred) return
      setLoading(true)
      try {
        const details = await resolvePlaceDetails(pred.placeId, sessionTokenRef.current)
        if (!details) {
          setError('Could not resolve that place')
          return
        }
        const createdAt = Date.now()
        const highlight = {
          lat: details.lat,
          lng: details.lng,
          label: details.name || pred.main,
          secondary: pred.secondary || details.formattedAddress,
          formattedAddress: details.formattedAddress,
          description: details.description,
          photoUrl: details.photoUrl,
          photoAttribution: details.photoAttribution,
          types: details.types,
          viewport: details.viewport,
          boundary: null,
          createdAt,
        }
        setSearchHighlight(highlight)
        flyToLocation(highlight)
        closeAndReset()

        // Pull the official admin boundary in the background so the pin
        // + card appear instantly; when (and if) the polygon lands, we
        // merge it into the still-active highlight without disturbing
        // the camera or the info card the user is already reading.
        // `types` drives the lookup: Places `locality` → city polygon,
        // `administrative_area_level_1` → state polygon, etc. Non-admin
        // results (landmarks, businesses) return null by design and
        // render with just a pin, exactly like Google Earth.
        fetchPlaceBoundary({
          name: pred.main || details.name,
          lat: details.lat,
          lng: details.lng,
          types: details.types,
        }).then((boundary) => {
          if (!boundary) return
          const current = useAtlasStore.getState().searchHighlight
          if (!current || current.createdAt !== createdAt) return
          setSearchHighlight({ ...current, boundary })
        })
      } catch (err) {
        setError('Could not resolve that place')
      } finally {
        setLoading(false)
        // Autocomplete session terminates on details(); start a fresh one
        // so the next expansion is billed as its own session.
        sessionTokenRef.current = null
      }
    },
    [closeAndReset, flyToLocation, setSearchHighlight],
  )

  const onInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndReset()
        return
      }
      if (!predictions.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((i) => (i + 1) % predictions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((i) => (i - 1 + predictions.length) % predictions.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectPrediction(predictions[highlighted])
      }
    },
    [predictions, highlighted, selectPrediction, closeAndReset],
  )

  const placeholder = useMemo(
    () => 'Search a place…',
    [],
  )

  return (
    <div ref={wrapRef} className={`hud-search ${open ? 'is-open' : ''}`}>
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.button
            key="search-trigger"
            type="button"
            aria-label="Search place on map"
            title="Search place  (press /)"
            className="hud-icon-btn hud-search-trigger"
            onClick={() => {
              clearSearchHighlight()
              setOpen(true)
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.15 }}
          >
            <IconSearch />
          </motion.button>
        ) : (
          <motion.div
            key="search-expanded"
            className="hud-search-field"
            initial={{ opacity: 0, width: 32 }}
            animate={{ opacity: 1, width: 260 }}
            exit={{ opacity: 0, width: 32 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="hud-search-field__icon" aria-hidden>
              <IconSearch size={13} />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
              className="hud-search-field__input"
              aria-label="Search place"
            />
            {query && (
              <button
                type="button"
                className="hud-search-field__clear"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery('')
                  setPredictions([])
                  inputRef.current?.focus()
                }}
              >
                <IconClose />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (predictions.length > 0 || loading || error || (query.trim().length >= MIN_CHARS && !loading)) && (
          <motion.div
            className="hud-search-dropdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            role="listbox"
          >
            {loading && predictions.length === 0 && (
              <div className="hud-search-status">Searching…</div>
            )}
            {!loading && !error && predictions.length === 0 && query.trim().length >= MIN_CHARS && (
              <div className="hud-search-status">No places match “{query.trim()}”</div>
            )}
            {error && <div className="hud-search-status hud-search-status--error">{error}</div>}
            {predictions.map((p, i) => (
              <button
                key={p.placeId}
                type="button"
                className={`hud-search-item ${i === highlighted ? 'is-highlighted' : ''}`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  // Commit the selection before the click-outside handler
                  // sees the press and closes the dropdown.
                  e.preventDefault()
                  selectPrediction(p)
                }}
                role="option"
                aria-selected={i === highlighted}
              >
                <span className="hud-search-item__icon" aria-hidden>
                  <IconPin />
                </span>
                <span className="hud-search-item__text">
                  <span className="hud-search-item__main">{p.main}</span>
                  {p.secondary && (
                    <span className="hud-search-item__secondary">{p.secondary}</span>
                  )}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
