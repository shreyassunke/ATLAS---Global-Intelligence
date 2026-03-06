import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { CATEGORIES } from '../../utils/categoryColors'

export default function HoverLabel() {
  const hoveredMarker = useAtlasStore((s) => s.hoveredMarker)

  return (
    <AnimatePresence>
      {hoveredMarker && (
        <motion.div
          key={hoveredMarker.id}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 pointer-events-none"
          style={{
            left:
              hoveredMarker._screenX != null
                ? hoveredMarker._screenX + 12
                : '50%',
            top:
              hoveredMarker._screenY != null
                ? hoveredMarker._screenY - 12
                : 'auto',
            bottom:
              hoveredMarker._screenY == null
                ? '72px'
                : 'auto',
            transform:
              hoveredMarker._screenX != null
                ? 'translate(-50%, -100%)'
                : 'translateX(-50%)',
          }}
        >
          <div className="glass rounded-lg px-3 py-2 flex items-center gap-2 max-w-sm">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: CATEGORIES[hoveredMarker.category]?.color || '#fff' }}
            />
            <span className="text-xs text-white truncate">{hoveredMarker.title}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">
              {hoveredMarker.source}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
