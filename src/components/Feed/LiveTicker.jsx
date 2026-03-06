import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'

/**
 * Formats a date string into a relative time string (e.g. "2h ago", "5m ago").
 */
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function LiveTicker() {
  const newsItems = useAtlasStore((s) => s.newsItems)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const scrollRef = useRef(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const hoverTimer = useRef(null)
  const feedRef = useRef(null)

  const tickerItems = useMemo(() => {
    if (newsItems.length === 0) return []
    return [...newsItems].sort((a, b) => b.importance - a.importance).slice(0, 20)
  }, [newsItems])

  // Full feed: show more items, grouped by category
  const feedItems = useMemo(() => {
    if (newsItems.length === 0) return []
    return [...newsItems]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 60)
  }, [newsItems])

  // Hover intent: open after 200ms, close after leaving both ticker + feed
  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(true), 200)
  }, [])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(false), 350)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  // Auto-scroll animation
  useEffect(() => {
    const el = scrollRef.current
    if (!el || tickerItems.length === 0) return

    let animFrame
    let scrollPos = 0
    const speed = 0.5

    function tick() {
      scrollPos += speed
      if (scrollPos >= el.scrollWidth / 2) scrollPos = 0
      el.scrollLeft = scrollPos
      animFrame = requestAnimationFrame(tick)
    }

    animFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrame)
  }, [tickerItems.length])

  if (tickerItems.length === 0) return null

  // Duplicate items for infinite scroll illusion
  const displayItems = [...tickerItems, ...tickerItems]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.5 }}
      className="fixed bottom-0 left-0 right-0 z-30"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Feed Overlay ── */}
      <AnimatePresence>
        {feedOpen && (
          <motion.div
            ref={feedRef}
            key="news-feed"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="feed-overlay"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Header */}
            <div className="feed-header">
              <div className="feed-header-left">
                <div className="feed-live-dot" />
                <span className="feed-header-title">LIVE FEED</span>
                <span className="feed-header-count">{feedItems.length} stories</span>
              </div>
              <button
                className="feed-close-btn"
                onClick={() => setFeedOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* Scrollable card grid */}
            <div className="feed-grid-scroll">
              <div className="feed-grid">
                {feedItems.map((item) => {
                  const cat = CATEGORIES[item.category]
                  const catColor = cat?.color || '#fff'
                  return (
                    <button
                      key={item.id}
                      className="feed-card"
                      onClick={() => {
                        setSelectedMarker(item)
                        setFeedOpen(false)
                      }}
                    >
                      {/* Accent stripe */}
                      <div className="feed-card-stripe" style={{ background: catColor }} />

                      <div className="feed-card-body">
                        {/* Category + time row */}
                        <div className="feed-card-meta">
                          <span className="feed-card-cat" style={{ color: catColor }}>
                            {cat?.icon} {cat?.label || item.category}
                          </span>
                          <span className="feed-card-time">{timeAgo(item.publishedAt)}</span>
                        </div>

                        {/* Title */}
                        <h4 className="feed-card-title">{item.title}</h4>

                        {/* Description */}
                        {item.description && (
                          <p className="feed-card-desc">{item.description}</p>
                        )}

                        {/* Source */}
                        <div className="feed-card-source">
                          <div className="feed-card-source-dot" style={{ backgroundColor: catColor }} />
                          {item.source}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ticker bar (always visible) ── */}
      <div className="glass border-t border-white/5 ticker-shell">
        {/* Hover hint glow line */}
        <div className={`ticker-hover-line ${feedOpen ? 'active' : ''}`} />
        <div
          ref={scrollRef}
          className="flex gap-6 px-4 py-2.5 overflow-hidden whitespace-nowrap"
          style={{ scrollBehavior: 'auto' }}
        >
          {displayItems.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              onClick={() => setSelectedMarker(item)}
              className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORIES[item.category]?.color || '#fff' }}
              />
              <span className="text-[10px] text-white/55 font-mono">
                {item.source}
              </span>
              <span className="text-[12px] text-white/92 font-medium truncate max-w-[280px]">
                {item.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
