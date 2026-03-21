import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'
import { TIER_COLORS } from '../../core/eventSchema'

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

const TIER_LABELS = { latent: 'LATENT', active: 'ACTIVE', critical: 'CRITICAL' }

export default function LiveTicker() {
  const newsItems = useAtlasStore((s) => s.newsItems)
  const events = useAtlasStore((s) => s.events)
  const setSelectedMarker = useAtlasStore((s) => s.setSelectedMarker)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const scrollRef = useRef(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const hoverTimer = useRef(null)
  const feedRef = useRef(null)

  const tickerItems = useMemo(() => {
    const eventItems = events
      .sort((a, b) => b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 30)
      .map(e => ({
        id: `evt_${e.id}`,
        isEvent: true,
        event: e,
        title: e.title,
        source: e.source,
        color: TIER_COLORS[e.tier],
        tier: e.tier,
        time: e.timestamp,
        severity: e.severity,
      }))

    const newsTickerItems = newsItems
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20)
      .map(n => ({
        id: `news_${n.id}`,
        isEvent: false,
        news: n,
        title: n.title,
        source: n.source,
        color: CATEGORIES[n.category]?.color || '#fff',
        time: n.publishedAt,
        severity: 0,
        mediaType: n.mediaType,
        isLive: n.isLive,
        thumbnailUrl: n.thumbnailUrl,
      }))

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
        color: TIER_COLORS[e.tier],
        tier: e.tier,
        time: e.timestamp,
        category: e.domain,
        severity: e.severity,
      }))

    const newsFeed = newsItems
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 30)
      .map(n => ({
        id: `news_${n.id}`,
        isEvent: false,
        news: n,
        title: n.title,
        source: n.source,
        description: n.description,
        color: CATEGORIES[n.category]?.color || '#fff',
        time: n.publishedAt,
        category: n.category,
        severity: 0,
        mediaType: n.mediaType,
        isLive: n.isLive,
        thumbnailUrl: n.thumbnailUrl,
      }))

    return [...evtFeed, ...newsFeed]
      .sort((a, b) => b.severity - a.severity || new Date(b.time) - new Date(a.time))
      .slice(0, 60)
  }, [events, newsItems])

  const handleMouseEnter = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(true), 200)
  }, [])

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setFeedOpen(false), 350)
  }, [])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.5 }}
      className="fixed bottom-0 left-0 right-0 z-30"
      onMouseEnter={mobileMode ? undefined : handleMouseEnter}
      onMouseLeave={mobileMode ? undefined : handleMouseLeave}
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
            onMouseEnter={mobileMode ? undefined : handleMouseEnter}
            onMouseLeave={mobileMode ? undefined : handleMouseLeave}
          >
            <div className="feed-header">
              <div className="feed-header-left">
                <div className="feed-live-dot" />
                <span className="feed-header-title">INTEL FEED</span>
                <span className="feed-header-count">{feedItems.length} events</span>
              </div>
              <button className="feed-close-btn" onClick={() => setFeedOpen(false)}>✕</button>
            </div>

            <div className="feed-grid-scroll">
              <div className="feed-grid">
                {feedItems.map((item) => (
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
                          {item.isEvent && item.tier && (
                            <span style={{ opacity: 0.7, marginRight: 4 }}>{TIER_LABELS[item.tier]}</span>
                          )}
                          {item.isEvent
                            ? item.event?.domain?.toUpperCase()
                            : CATEGORIES[item.category]?.icon + ' ' + (CATEGORIES[item.category]?.label || item.category)
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
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.tier === 'critical' ? 'ticker-dot-critical' :
                    item.tier === 'active' ? 'ticker-dot-active' :
                    item.tier === 'latent' ? 'ticker-dot-latent' : ''
                  }`}
                  style={!item.tier ? { backgroundColor: item.color } : {}}
                />
              )}
              <span className="text-[10px] text-white/55 font-mono">
                {item.source}
              </span>
              <span
                className={`text-[12px] font-medium truncate ${mobileMode ? 'max-w-[180px]' : 'max-w-[280px]'}`}
                style={{
                  color: item.tier === 'critical'
                    ? 'rgba(255, 80, 80, 0.95)'
                    : item.tier === 'active'
                    ? 'rgba(255, 200, 60, 0.9)'
                    : 'rgba(255, 255, 255, 0.92)',
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
