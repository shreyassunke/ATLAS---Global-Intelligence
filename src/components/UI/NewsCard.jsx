import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'
import { extractYouTubeVideoId } from '../../utils/youtube'
import { buildGdeltDocQuery } from '../../services/gdelt/analyticsService'

export default function NewsCard() {
  const selectedMarker = useAtlasStore((s) => s.selectedMarker)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const openStreetView = useAtlasStore((s) => s.openStreetView)
  const openYouTubeEmbed = useAtlasStore((s) => s.openYouTubeEmbed)
  const openGdeltAnalytics = useAtlasStore((s) => s.openGdeltAnalytics)
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
          <div className="bg-[#0a0f1a]/95 backdrop-blur-xl border border-slate-800 shadow-2xl rounded-xl p-5 space-y-4">
            {/* Close button */}
            <button
              onClick={() => setSelectedMarker(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
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
                className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                style={{ backgroundColor: CATEGORIES[selectedMarker.category]?.color || '#3b82f6', boxShadow: `0 0 8px ${CATEGORIES[selectedMarker.category]?.color || '#3b82f6'}` }}
              />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                {CATEGORIES[selectedMarker.category]?.label || selectedMarker.category}
              </span>
              {selectedMarker.mediaType === 'video' && !selectedMarker.thumbnailUrl && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.5 leading-none">
                  {selectedMarker.isLive ? 'LIVE' : 'VIDEO'}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg font-bold leading-tight text-white pr-4">
              {selectedMarker.title}
            </h3>

            {/* Source + Time */}
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              {selectedMarker.url && !selectedMarker.url.startsWith('#') ? (
                <a
                  href={selectedMarker.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors cursor-pointer"
                >
                  {selectedMarker.source}
                </a>
              ) : (
                <span className="text-cyan-400">{selectedMarker.source}</span>
              )}
              <span className="opacity-50">•</span>
              <span>
                {new Date(selectedMarker.publishedAt || selectedMarker.timestamp || Date.now()).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Description */}
            {selectedMarker.description && (
              <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                {selectedMarker.description}
              </p>
            )}

            {/* Coordinates */}
            {selectedMarker.lat != null && selectedMarker.lng != null && (
              <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {Math.abs(selectedMarker.lat).toFixed(3)}° {selectedMarker.lat >= 0 ? 'N' : 'S'},{' '}
                {Math.abs(selectedMarker.lng).toFixed(3)}° {selectedMarker.lng >= 0 ? 'E' : 'W'}
              </div>
            )}

            {/* Street View + source link row */}
            {(selectedMarker.lat != null && selectedMarker.lng != null) ||
              (selectedMarker.url && !selectedMarker.url.startsWith('#')) ? (
              <div className="mt-4 flex items-center gap-3 pt-2">
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
                    className="flex-1 flex justify-center items-center gap-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Street View
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
                    className="flex-1 flex justify-center items-center gap-2 rounded bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-800/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-400 transition-colors cursor-pointer"
                  >
                    Play Video
                  </button>
                )}

                {selectedMarker.url && !selectedMarker.url.startsWith('#') && (
                  <a
                    href={selectedMarker.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex justify-center items-center gap-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Source Link
                  </a>
                )}
              </div>
            ) : null}

            {Array.isArray(selectedMarker.corroborationSources) && (
              <button
                type="button"
                onClick={() =>
                  openGdeltAnalytics({
                    query: buildGdeltDocQuery({
                      title: selectedMarker.title,
                      dimension: selectedMarker.dimension,
                    }),
                    label: selectedMarker.title,
                    dimension: selectedMarker.dimension,
                  })
                }
                className="w-full rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-sky-300/90 transition hover:bg-sky-500/20 cursor-pointer"
              >
                ◎ GDELT Analyze
              </button>
            )}

            {/* Importance indicator */}
            <div className="flex gap-1.5 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full shadow-sm"
                  style={{
                    backgroundColor:
                      i < selectedMarker.importance
                        ? CATEGORIES[selectedMarker.category]?.color || '#3b82f6'
                        : '#1e293b',
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
