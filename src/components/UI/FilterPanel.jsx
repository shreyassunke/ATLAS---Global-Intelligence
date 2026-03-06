import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES, CATEGORY_KEYS } from '../../utils/categoryColors'

export default function FilterPanel() {
  const activeCategories = useAtlasStore((s) => s.activeCategories)
  const toggleCategory = useAtlasStore((s) => s.toggleCategory)
  const setAllCategories = useAtlasStore((s) => s.setAllCategories)
  const zoomLevel = useAtlasStore((s) => s.zoomLevel)

  const allActive = CATEGORY_KEYS.every((k) => activeCategories.has(k))

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 24, y: 64 })
  const [dragging, setDragging] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    const width = typeof window !== 'undefined' ? window.innerWidth || 0 : 0
    const height = typeof window !== 'undefined' ? window.innerHeight || 0 : 0
    const minMargin = 8
    const newX = e.clientX - dragOffsetRef.current.x
    const newY = e.clientY - dragOffsetRef.current.y
    const clampedX = width
      ? Math.min(Math.max(minMargin, newX), Math.max(minMargin, width - 200))
      : newX
    const clampedY = height
      ? Math.min(Math.max(minMargin, newY), Math.max(minMargin, height - 200))
      : newY
    setPosition({ x: clampedX, y: clampedY })
  }

  const handleMouseUp = () => {
    setDragging(false)
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    setDragging(true)
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
  }

  const handleToggleAll = () => {
    if (allActive) setAllCategories([])
    else setAllCategories(CATEGORY_KEYS)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 1.8, duration: 0.5 }}
      className="fixed z-30 w-44"
      style={{
        left: position.x,
        top: position.y,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Collapsed trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hud-btn mb-2 px-3 py-1.5"
      >
        Filters
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="filters-dropdown"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            <div className="rounded-xl p-3 space-y-1 filters-panel">

              <button
                onClick={handleToggleAll}
                className={`filters-row ${allActive ? 'filters-row-active' : ''}`}
              >
                <div
                  className="filters-dot"
                  style={{
                    backgroundColor: allActive ? 'var(--accent)' : 'rgba(148,163,184,0.65)',
                  }}
                />
                <span className="filters-label">All Categories</span>
              </button>

              {CATEGORY_KEYS.map((key) => {
                const cat = CATEGORIES[key]
                const isActive = activeCategories.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleCategory(key)}
                    className={`filters-row ${isActive ? 'filters-row-active' : ''}`}
                  >
                    <div
                      className="filters-dot"
                      style={{
                        backgroundColor: isActive
                          ? cat.color
                          : 'rgba(148,163,184,0.5)',
                      }}
                    />
                    <span className="filters-label">{cat.label}</span>
                    <span className="filters-icon">{cat.icon}</span>
                  </button>
                )
              })}

              <div className="pt-2 mt-2">
                <div className="text-[10px] text-white/35 font-mono px-1 tracking-[0.16em] uppercase">
                  Zoom: {Math.round((1 - zoomLevel) * 100)}%
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
