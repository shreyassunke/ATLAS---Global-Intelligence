import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import {
  loadGoogleMapsSDK,
  checkStreetViewCoverage,
  geocodeQuery,
  extractLocationHints,
  GOOGLE_MAPS_API_KEY,
} from '../../utils/googleMaps'

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  NO_COVERAGE: 'no_coverage',
  ERROR: 'error',
}

export default function StreetViewOverlay() {
  const streetViewLocation = useAtlasStore((s) => s.streetViewLocation)
  const isStreetViewOpen = useAtlasStore((s) => s.isStreetViewOpen)
  const openStreetView = useAtlasStore((s) => s.openStreetView)
  const closeStreetView = useAtlasStore((s) => s.closeStreetView)

  const containerRef = useRef(null)
  const panoramaRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [resolvedAddress, setResolvedAddress] = useState('')
  const [searchRadius, setSearchRadius] = useState(0)
  const [panoramaTarget, setPanoramaTarget] = useState(null)

  const hasLocation = !!streetViewLocation
  const hasCoords = hasLocation &&
    typeof streetViewLocation.lat === 'number' && !Number.isNaN(streetViewLocation.lat) &&
    typeof streetViewLocation.lng === 'number' && !Number.isNaN(streetViewLocation.lng)

  const externalUrl = hasCoords
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${streetViewLocation.lat},${streetViewLocation.lng}`
    : null

  const resolveStreetView = useCallback(async (loc) => {
    if (!GOOGLE_MAPS_API_KEY) {
      setStatus(STATUS.ERROR)
      return
    }

    setStatus(STATUS.LOADING)
    setResolvedAddress('')
    setSearchRadius(0)

    try {
      await loadGoogleMapsSDK()
    } catch {
      setStatus(STATUS.ERROR)
      return
    }

    let targetLat = loc.lat
    let targetLng = loc.lng
    let usedGeocode = false

    if (loc.meta?.title || loc.meta?.detail) {
      const hints = extractLocationHints(loc.meta.title, loc.meta.detail)

      if (hints.length > 0) {
        for (const hint of hints) {
          const result = await geocodeQuery(hint)
          if (result && result.precision !== 'APPROXIMATE') {
            targetLat = result.lat
            targetLng = result.lng
            setResolvedAddress(result.formattedAddress || hint)
            usedGeocode = true
            break
          }
        }
      }
    }

    const radii = [100, 500, 1500, 5000]

    for (const radius of radii) {
      const coverage = await checkStreetViewCoverage(targetLat, targetLng, radius)
      if (coverage.available) {
        setSearchRadius(radius)
        if (coverage.description && !resolvedAddress) {
          setResolvedAddress(coverage.description)
        }
        setPanoramaTarget({
          lat: coverage.location.lat,
          lng: coverage.location.lng,
          panoId: coverage.panoId,
        })
        setStatus(STATUS.READY)
        return
      }
    }

    if (!usedGeocode && (loc.meta?.title || loc.meta?.detail)) {
      const titleQuery = loc.meta.title || loc.meta.detail
      const geoResult = await geocodeQuery(titleQuery)
      if (geoResult) {
        const fallbackCoverage = await checkStreetViewCoverage(geoResult.lat, geoResult.lng, 2000)
        if (fallbackCoverage.available) {
          setResolvedAddress(geoResult.formattedAddress || titleQuery)
          setSearchRadius(2000)
          setPanoramaTarget({
            lat: fallbackCoverage.location.lat,
            lng: fallbackCoverage.location.lng,
            panoId: fallbackCoverage.panoId,
          })
          setStatus(STATUS.READY)
          return
        }
      }
    }

    setStatus(STATUS.NO_COVERAGE)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function initPanorama(lat, lng, panoId) {
    if (!containerRef.current || !window.google?.maps) return

    if (panoramaRef.current) {
      if (panoId) {
        panoramaRef.current.setPano(panoId)
      } else {
        panoramaRef.current.setPosition({ lat, lng })
      }
      return
    }

    const opts = {
      position: { lat, lng },
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      addressControl: true,
      showRoadLabels: true,
      motionTracking: false,
      motionTrackingControl: false,
      fullscreenControl: true,
      linksControl: true,
      panControl: false,
      enableCloseButton: false,
    }
    if (panoId) opts.pano = panoId

    panoramaRef.current = new window.google.maps.StreetViewPanorama(
      containerRef.current,
      opts
    )
  }

  useEffect(() => {
    if (isStreetViewOpen && hasCoords) {
      resolveStreetView(streetViewLocation)
    }

    if (!isStreetViewOpen) {
      setStatus(STATUS.IDLE)
      panoramaRef.current = null
      setPanoramaTarget(null)
    }
  }, [isStreetViewOpen, streetViewLocation?.lat, streetViewLocation?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Important: only initialize StreetViewPanorama *after* the READY container is mounted.
  // Without this, the constructor exits early because `containerRef.current` is still null,
  // resulting in a permanently black panel.
  useEffect(() => {
    if (!isStreetViewOpen) return
    if (status !== STATUS.READY) return
    if (!panoramaTarget) return
    initPanorama(panoramaTarget.lat, panoramaTarget.lng, panoramaTarget.panoId)
  }, [status, panoramaTarget, isStreetViewOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isStreetViewOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeStreetView()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isStreetViewOpen, closeStreetView])


  if (!hasLocation) return null

  const displayLabel = resolvedAddress
    || streetViewLocation.meta?.title
    || (hasCoords ? `${streetViewLocation.lat.toFixed(4)}, ${streetViewLocation.lng.toFixed(4)}` : '')

  return (
    <>
      <AnimatePresence>
        {isStreetViewOpen && hasCoords && (
          <motion.div
            key="streetview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <button
              type="button"
              aria-label="Close Street View"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
              onClick={closeStreetView}
            />

            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="relative pointer-events-auto glass rounded-2xl shadow-2xl border border-white/10 w-[min(900px,90vw)] h-[min(520px,70vh)] overflow-hidden flex flex-col"
            >
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/40 flex-shrink-0">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-[0.18em]">
                    Street View
                    {searchRadius > 200 && (
                      <span className="ml-2 opacity-50">
                        (~{searchRadius >= 1000 ? `${(searchRadius / 1000).toFixed(1)}km` : `${searchRadius}m`} away)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-white/80 truncate max-w-[500px]" title={displayLabel}>
                    {displayLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeStreetView}
                  className="text-xs font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer flex-shrink-0"
                >
                  ESC
                </button>
              </div>

              {/* Content area */}
              <div className="flex-1 bg-black/80 relative">
                {status === STATUS.LOADING && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                    <div className="sv-spinner" />
                    <span className="text-xs text-white/50 font-mono tracking-wide">Finding street-level imagery...</span>
                  </div>
                )}

                {status === STATUS.READY && (
                  <div ref={containerRef} className="w-full h-full" />
                )}

                {status === STATUS.NO_COVERAGE && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
                    <div className="text-2xl opacity-30">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                    </div>
                    <p className="text-sm text-white/60 font-mono max-w-sm">
                      No street-level imagery available near this location.
                    </p>
                    <p className="text-xs text-white/30 font-mono max-w-sm">
                      Searched within 5km radius. Coverage varies by region.
                    </p>
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-mono cursor-pointer transition-colors border border-white/10"
                      >
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                )}

                {status === STATUS.ERROR && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                    <p className="text-xs text-white/80 font-mono max-w-sm">
                      Street View requires a valid{' '}
                      <span className="text-[var(--accent)]">VITE_GOOGLE_MAPS_API_KEY</span>.
                    </p>
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded bg-white text-black text-xs font-mono cursor-pointer hover:bg-white/90"
                      >
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
