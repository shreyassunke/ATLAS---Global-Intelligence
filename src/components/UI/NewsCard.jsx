import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'
import { extractYouTubeVideoId } from '../../utils/youtube'

export default function NewsCard() {
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const openStreetView = useAtlasStore((s) => s.openStreetView)
  const openYouTubeEmbed = useAtlasStore((s) => s.openYouTubeEmbed)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  return (
    <AnimatePresence>
      {selectedMarker && (
        <motion.div
          key={selectedMarker.id}
          initial={{ opacity: 0, x: 30, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 30, scale: 0.95 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`fixed z-30 ${
            mobileMode
              ? 'left-4 right-4 bottom-16 w-auto'
              : 'right-4 top-1/2 -translate-y-1/2 w-80'
          }`}
        >
          <div className="glass rounded-xl p-5 space-y-3">
            {/* Close button */}
            <button
              onClick={() => setSelectedMarker(null)}
              className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-white text-sm cursor-pointer"
            >
              x
            </button>

            {/* Video thumbnail — click opens in-app embed (same pattern as Street View overlay) */}
            {selectedMarker.mediaType === 'video' && selectedMarker.thumbnailUrl && (
              <button
                type="button"
                className="relative -mx-5 -mt-5 mb-1 rounded-t-xl overflow-hidden w-[calc(100%+2.5rem)] text-left border-0 p-0 cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
                onClick={() => {
                  const id = extractYouTubeVideoId(selectedMarker.url)
                  if (!id) return
                  openYouTubeEmbed({
                    videoId: id,
                    title: selectedMarker.title,
                    url: selectedMarker.url,
                    isLive: !!selectedMarker.isLive,
                  })
                }}
                title="Play video"
              >
                <img
                  src={selectedMarker.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-36 object-cover transition-opacity group-hover:opacity-90"
                />
                {selectedMarker.isLive && (
                  <span className="absolute top-2 left-2 flex items-center gap-1 bg-red-600/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-black/50 group-hover:bg-black/60 flex items-center justify-center transition-colors">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current ml-0.5">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <span className="sr-only">Open video</span>
              </button>
            )}

            {/* Category badge */}
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORIES[selectedMarker.category]?.color || '#fff' }}
              />
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {CATEGORIES[selectedMarker.category]?.label || selectedMarker.category}
              </span>
              {selectedMarker.mediaType === 'video' && !selectedMarker.thumbnailUrl && (
                <span className="text-[9px] uppercase tracking-wider text-red-400 border border-red-400/30 rounded px-1.5 py-0.5 leading-none">
                  {selectedMarker.isLive ? 'LIVE' : 'VIDEO'}
                </span>
              )}
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

            {/* Coordinates — only when plottable */}
            {selectedMarker.lat != null && selectedMarker.lng != null && (
              <div className="text-[10px] text-[var(--text-muted)] font-mono opacity-50">
                {Math.abs(selectedMarker.lat).toFixed(2)}{selectedMarker.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(selectedMarker.lng).toFixed(2)}{selectedMarker.lng >= 0 ? 'E' : 'W'}
              </div>
            )}

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

                {selectedMarker.mediaType === 'video' &&
                  selectedMarker.url &&
                  !selectedMarker.url.startsWith('#') &&
                  extractYouTubeVideoId(selectedMarker.url) && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = extractYouTubeVideoId(selectedMarker.url)
                      if (!id) return
                      openYouTubeEmbed({
                        videoId: id,
                        title: selectedMarker.title,
                        url: selectedMarker.url,
                        isLive: !!selectedMarker.isLive,
                      })
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-white/90 hover:bg-white/10 cursor-pointer"
                  >
                    Play inline
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
