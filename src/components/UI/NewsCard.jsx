import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'

export default function NewsCard() {
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const openStreetView = useAtlasStore((s) => s.openStreetView)

  return (
    <AnimatePresence>
      {selectedMarker && (
        <motion.div
          key={selectedMarker.id}
          initial={{ opacity: 0, x: 30, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30, scale: 0.95 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-30 w-80"
        >
          <div className="glass rounded-xl p-5 space-y-3">
            {/* Close button */}
            <button
              onClick={() => setSelectedMarker(null)}
              className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-white text-sm cursor-pointer"
            >
              x
            </button>

            {/* Category badge */}
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORIES[selectedMarker.category]?.color || '#fff' }}
              />
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {CATEGORIES[selectedMarker.category]?.label || selectedMarker.category}
              </span>
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] ml-auto">
                {CATEGORIES[selectedMarker.category]?.icon}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-base font-semibold leading-snug text-white">
              {selectedMarker.title}
            </h3>

            {/* Source + Time */}
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono">
              {selectedMarker.url && !selectedMarker.url.startsWith('#') ? (
                <a
                  href={selectedMarker.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline cursor-pointer"
                >
                  {selectedMarker.source}
                </a>
              ) : (
                <span className="text-[var(--accent)]">{selectedMarker.source}</span>
              )}
              <span>|</span>
              <span>
                {new Date(selectedMarker.publishedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Description */}
            {selectedMarker.description && (
              <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-3">
                {selectedMarker.description}
              </p>
            )}

            {/* Coordinates */}
            <div className="text-[10px] text-[var(--text-muted)] font-mono opacity-50">
              {selectedMarker.lat?.toFixed(2)}N, {selectedMarker.lng?.toFixed(2)}E
            </div>

            {/* Street View + source link row */}
            {(selectedMarker.lat != null && selectedMarker.lng != null) ||
              (selectedMarker.url && !selectedMarker.url.startsWith('#')) ? (
              <div className="mt-2 flex items-center gap-2">
                {selectedMarker.lat != null && selectedMarker.lng != null && (
                  <button
                    type="button"
                    onClick={() =>
                      openStreetView({
                        lat: selectedMarker.lat,
                        lng: selectedMarker.lng,
                        source: 'marker',
                        meta: selectedMarker,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)] hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <span>Street View</span>
                  </button>
                )}

                {selectedMarker.url && !selectedMarker.url.startsWith('#') && (
                  <a
                    href={selectedMarker.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/0 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--accent)] hover:bg-white/5 cursor-pointer"
                  >
                    <span>Source</span>
                  </a>
                )}
              </div>
            ) : null}

            {/* Importance indicator */}
            <div className="flex gap-1 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    backgroundColor:
                      i < selectedMarker.importance
                        ? CATEGORIES[selectedMarker.category]?.color || '#fff'
                        : 'rgba(255,255,255,0.08)',
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
