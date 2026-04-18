import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'
import { DIMENSION_COLORS, DIMENSION_LABELS, DIMENSION_ICONS, DIMENSION_KEYS } from '../../core/eventSchema'
import { legacyCategoryToDimension } from '../../utils/categoryColors'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function LiveTicker() {
  const newsItems = useAtlasStore((s) => s.newsItems)
  const events = useAtlasStore((s) => s.events)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const scrollRef = useRef(null)
  const dockRef = useRef(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const [feedSearch, setFeedSearch] = useState('')
  const [feedCategory, setFeedCategory] = useState('all')
  const hoverTimer = useRef(null)
  const feedRef = useRef(null)

  const tickerItems = useMemo(() => {
    // Ticker shows P1 events by default for a quiet globe
    const eventItems = events
      .filter(e => e.priority === 'p1')
      .sort((a, b) => b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 30)
      .map(e => ({
        id: `evt_${e.id}`,
        isEvent: true,
        event: e,
        title: e.title,
        source: e.source,
        color: DIMENSION_COLORS[e.dimension] || '#1a90ff',
        dimension: e.dimension,
        priority: e.priority,
        time: e.timestamp,
        severity: e.severity,
      }))

    const newsTickerItems = newsItems
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 45)
      .map(n => {
        const dim = legacyCategoryToDimension(n.category)
        return {
          id: `news_${n.id}`,
          isEvent: false,
          news: n,
          title: n.title,
          source: n.source,
          color: DIMENSION_COLORS[dim] || CATEGORIES[n.category]?.color || '#fff',
          dimension: dim,
          time: n.publishedAt,
          severity: 0,
          mediaType: n.mediaType,
          isLive: n.isLive,
          thumbnailUrl: n.thumbnailUrl,
        }
      })

    return [...eventItems, ...newsTickerItems]
      .sort((a, b) => b.severity - a.severity || new Date(b.time) - new Date(a.time))
      .slice(0, 40)
  }, [events, newsItems])

  const feedItems = useMemo(() => {
    const evtFeed = events
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 40)
      .map(e => ({
        id: `evt_${e.id}`,
        isEvent: true,
        event: e,
        title: e.title,
        source: e.source,
        description: e.detail,
        color: DIMENSION_COLORS[e.dimension] || '#1a90ff',
        dimension: e.dimension,
        priority: e.priority,
        time: e.timestamp,
        category: e.dimension,
        severity: e.severity,
      }))

    const newsFeed = newsItems
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 80)
      .map(n => {
        const dim = legacyCategoryToDimension(n.category)
        return {
          id: `news_${n.id}`,
          isEvent: false,
          news: n,
          title: n.title,
          source: n.source,
          description: n.description,
          color: DIMENSION_COLORS[dim] || CATEGORIES[n.category]?.color || '#fff',
          dimension: dim,
          time: n.publishedAt,
          category: n.category,
          severity: 0,
          mediaType: n.mediaType,
          isLive: n.isLive,
          thumbnailUrl: n.thumbnailUrl,
        }
      })

    return [...evtFeed, ...newsFeed]
      .sort((a, b) => b.severity - a.severity || new Date(b.time) - new Date(a.time))
      .slice(0, 120)
  }, [events, newsItems])

  const feedDimensionsInUse = useMemo(() => {
    const seen = new Set()
    for (const item of feedItems) {
      if (item.dimension) seen.add(item.dimension)
    }
    return DIMENSION_KEYS.filter((k) => seen.has(k))
  }, [feedItems])

  const normalizedQuery = feedSearch.trim().toLowerCase()

  const filteredFeedItems = useMemo(() => {
    return feedItems.filter((item) => {
      if (feedCategory !== 'all' && item.dimension !== feedCategory) return false
      if (!normalizedQuery) return true
      const hay = `${item.title || ''} ${item.description || ''} ${item.source || ''}`.toLowerCase()
      return hay.includes(normalizedQuery)
    })
  }, [feedItems, feedCategory, normalizedQuery])

  const feedCountLabel = useMemo(() => {
    const n = filteredFeedItems.length
    const t = feedItems.length
    if (feedCategory !== 'all' || normalizedQuery) {
      return t > 0 ? `${n} / ${t} items` : `${n} items`
    }
    return `${n} items`
  }, [filteredFeedItems.length, feedItems.length, feedCategory, normalizedQuery])

  useEffect(() => {
    if (feedCategory !== 'all' && !feedDimensionsInUse.includes(feedCategory)) {
      setFeedCategory('all')
    }
  }, [feedCategory, feedDimensionsInUse])

  const handleDockMouseEnter = useCallback(() => {
    if (mobileMode) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(true), 200)
  }, [mobileMode])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  // Close only via ✕ or pointerdown outside the dock (overlay + ticker). Do not use mouseleave —
  // it fires spuriously when moving into the search field, scrolling, or crossing subpixel gaps.
  useEffect(() => {
    if (!feedOpen) return

    function onPointerDownCapture(e) {
      const root = dockRef.current
      if (!root || root.contains(e.target)) return
      setFeedOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => window.removeEventListener('pointerdown', onPointerDownCapture, true)
  }, [feedOpen])

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

  const displayItems = [...tickerItems, ...tickerItems]

  const handleItemClick = (item) => {
    if (item.isEvent) {
      setSelectedEvent(item.event)
      setSelectedMarker(null)
    } else {
      setSelectedMarker(item.news)
      setSelectedEvent(null)
    }
    setFeedOpen(false)
  }

  return (
    <motion.div
      ref={dockRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.5 }}
      className="fixed bottom-0 left-0 right-0 z-30"
      onMouseEnter={handleDockMouseEnter}
    >
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
          >
            <div className="feed-header">
              <div className="feed-header-left">
                <div className="feed-live-dot" />
                <span className="feed-header-title">ATLAS Feed</span>
                <span className="feed-header-count">{feedCountLabel}</span>
              </div>
              <div className="feed-header-search-wrap">
                <input
                  type="search"
                  className="feed-search-input"
                  placeholder="Search headlines & descriptions…"
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Search feed"
                />
              </div>
              <button type="button" className="feed-close-btn" onClick={() => setFeedOpen(false)}>✕</button>
            </div>

            <div className="feed-tabs-row">
              <div className="feed-tabs-scroll">
                <button
                  type="button"
                  className={`feed-tab ${feedCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setFeedCategory('all')}
                >
                  All
                </button>
                {feedDimensionsInUse.map((dim) => (
                  <button
                    key={dim}
                    type="button"
                    className={`feed-tab ${feedCategory === dim ? 'active' : ''}`}
                    onClick={() => setFeedCategory(dim)}
                    style={{ '--feed-tab-accent': DIMENSION_COLORS[dim] || '#1a90ff' }}
                  >
                    <span className="feed-tab-icon" aria-hidden>{DIMENSION_ICONS[dim]}</span>
                    {DIMENSION_LABELS[dim] || dim}
                  </button>
                ))}
              </div>
            </div>

            <div className="feed-grid-scroll">
              <div className="feed-grid">
                {filteredFeedItems.length === 0 && (
                  <p className="feed-empty">No items match your search or category.</p>
                )}
                {filteredFeedItems.map((item) => (
                  <button
                    key={item.id}
                    className="feed-card"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="feed-card-stripe" style={{ background: item.color }} />
                    {item.mediaType === 'video' && item.thumbnailUrl && (
                      <div className="relative w-full h-24 overflow-hidden rounded-t" style={{ margin: '-12px -14px 8px -14px', width: 'calc(100% + 28px)' }}>
                        <img src={item.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        {item.isLive && (
                          <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-red-600/90 text-white text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </div>
                    )}
                    <div className="feed-card-body">
                      <div className="feed-card-meta">
                        <span className="feed-card-cat" style={{ color: item.color }}>
                          {item.isEvent
                            ? `${DIMENSION_ICONS[item.dimension] || ''} ${DIMENSION_LABELS[item.dimension] || item.dimension}`
                            : `${CATEGORIES[item.category]?.icon || ''} ${CATEGORIES[item.category]?.label || item.category}`
                          }
                        </span>
                        {item.mediaType === 'video' && !item.thumbnailUrl && (
                          <span style={{ fontSize: 9, color: item.isLive ? '#ef4444' : 'rgba(255,255,255,0.5)', marginLeft: 4 }}>
                            {item.isLive ? '● LIVE' : '▶ VIDEO'}
                          </span>
                        )}
                        <span className="feed-card-time">{timeAgo(item.time)}</span>
                      </div>
                      <h4 className="feed-card-title">{item.title}</h4>
                      {item.description && <p className="feed-card-desc">{item.description}</p>}
                      <div className="feed-card-source">
                        <div className="feed-card-source-dot" style={{ backgroundColor: item.color }} />
                        {item.source}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mobileMode && (
        <button
          onClick={() => setFeedOpen((v) => !v)}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 bg-black/60 border border-white/10 rounded-full px-3 py-1 text-[8px] tracking-[0.2em] text-white/50 uppercase font-mono backdrop-blur-sm"
        >
          {feedOpen ? 'Close Feed' : 'Open Feed'}
        </button>
      )}

      <div className="glass border-t border-white/5 ticker-shell">
        <div className={`ticker-hover-line ${feedOpen ? 'active' : ''}`} />
        <div
          ref={scrollRef}
          className="flex gap-6 px-4 py-2.5 overflow-hidden whitespace-nowrap"
          style={{ scrollBehavior: 'auto' }}
        >
          {displayItems.map((item, i) => (
            <button
              key={`${item.id}-${i}`}
              onClick={() => handleItemClick(item)}
              className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {item.mediaType === 'video' ? (
                <span className={`shrink-0 flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px leading-none ${
                  item.isLive
                    ? 'bg-red-600/80 text-white'
                    : 'bg-white/10 text-white/70'
                }`}>
                  {item.isLive ? '● LIVE' : '▶'}
                </span>
              ) : (
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span className="text-[10px] text-white/55 font-mono">
                {item.source}
              </span>
              <span
                className={`text-[12px] font-medium truncate ${mobileMode ? 'max-w-[180px]' : 'max-w-[280px]'}`}
                style={{
                  color: 'rgba(255, 255, 255, 0.92)',
                }}
              >
                {item.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
