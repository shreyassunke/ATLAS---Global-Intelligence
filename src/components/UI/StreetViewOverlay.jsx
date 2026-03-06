import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

export default function StreetViewOverlay() {
  const streetViewLocation = useAtlasStore((s) => s.streetViewLocation)
  const isStreetViewOpen = useAtlasStore((s) => s.isStreetViewOpen)
  const openStreetView = useAtlasStore((s) => s.openStreetView)
  const closeStreetView = useAtlasStore((s) => s.closeStreetView)

  const hasLocation = !!streetViewLocation

  useEffect(() => {
    if (!isStreetViewOpen || !hasLocation) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeStreetView()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isStreetViewOpen, hasLocation, closeStreetView])

  if (!hasLocation) return null

  const { lat, lng, meta, source } = streetViewLocation
  const hasCoords =
    typeof lat === 'number' &&
    !Number.isNaN(lat) &&
    typeof lng === 'number' &&
    !Number.isNaN(lng)

  const embedUrl =
    hasCoords && GOOGLE_MAPS_API_KEY
      ? `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_API_KEY}&location=${lat},${lng}&heading=0&pitch=0&fov=80`
      : null

  const externalUrl =
    hasCoords &&
    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`

  const handleTogglePanel = () => {
    if (!hasCoords) return
    if (isStreetViewOpen) {
      closeStreetView()
    } else {
      openStreetView({ lat, lng, source, meta })
    }
  }

  return (
    <>
      {/* Floating Street View symbol / launcher */}
      <button
        type="button"
        onClick={handleTogglePanel}
        className={`
          fixed bottom-6 right-6 z-40
          w-11 h-11 rounded-full
          glass flex items-center justify-center
          border border-white/20
          text-xs font-mono
          cursor-pointer
          ${isStreetViewOpen ? 'bg-[var(--accent)] text-black' : 'bg-black/60 text-white'}
        `}
        title="Open Street View"
      >
        SV
      </button>

      {/* Overlay panel with embedded Street View */}
      <AnimatePresence>
        {isStreetViewOpen && hasCoords && (
          <motion.div
            key="streetview-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 flex items-center justify-center"
          >
            {/* Click-away backdrop to close Street View */}
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
              className="relative pointer-events-auto glass rounded-2xl shadow-2xl border border-white/10 w-[min(900px,90vw)] h-[min(520px,70vh)] overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/40">
                <div className="flex flex-col">
                  <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-[0.18em]">
                    Street View
                  </span>
                  <span className="text-xs text-white/80 truncate max-w-[360px]">
                    {meta?.title || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeStreetView}
                  className="text-xs font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                >
                  ESC
                </button>
              </div>

              <div className="w-full h-full bg-black/80">
                {embedUrl ? (
                  <iframe
                    title="Google Street View"
                    src={embedUrl}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                    <p className="text-xs text-white/80 font-mono max-w-sm">
                      Interactive Street View requires a valid{' '}
                      <span className="text-[var(--accent)]">VITE_GOOGLE_MAPS_API_KEY</span>
                      . You can still open this location in Google Maps.
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

