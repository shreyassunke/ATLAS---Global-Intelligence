/**
 * SearchResultCard — Google-Earth-style info panel for the active place
 * search highlight. Mounts whenever `searchHighlight` is set on the
 * store and renders the place name, hero photo (from Google Places
 * `photos`), and a short description (from Places `editorial_summary`,
 * falling back to the formatted address when Google doesn't have a
 * blurb).
 *
 * Positioned on the right edge of the viewport, below the header HUD,
 * so it never collides with the left filter sidebar or bottom ticker.
 * Pure read-only UI: closing the card clears the highlight, which in
 * turn wipes the pin + boundary from the active globe.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'

const IconPin = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const IconClose = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </svg>
)

export default function SearchResultCard() {
  const highlight = useAtlasStore((s) => s.searchHighlight)
  const clearSearchHighlight = useAtlasStore((s) => s.clearSearchHighlight)

  return (
    <AnimatePresence>
      {highlight && (
        <motion.aside
          key={`search-card-${highlight.createdAt}`}
          className="search-result-card"
          role="dialog"
          aria-label={`Place: ${highlight.label || 'location'}`}
          initial={{ opacity: 0, x: 24, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="search-result-card__header">
            <div className="search-result-card__title-row">
              <span className="search-result-card__pin" aria-hidden>
                <IconPin />
              </span>
              <h3 className="search-result-card__title" title={highlight.label || ''}>
                {highlight.label || 'Selected place'}
              </h3>
            </div>
            <button
              type="button"
              className="search-result-card__close"
              aria-label="Close"
              onClick={() => clearSearchHighlight()}
            >
              <IconClose />
            </button>
          </header>

          {highlight.photoUrl && (
            <div className="search-result-card__photo">
              <img
                src={highlight.photoUrl}
                alt={highlight.label || ''}
                loading="lazy"
                draggable={false}
              />
              {highlight.photoAttribution && (
                <span
                  className="search-result-card__photo-credit"
                  dangerouslySetInnerHTML={{ __html: highlight.photoAttribution }}
                />
              )}
            </div>
          )}

          <div className="search-result-card__body">
            {highlight.description ? (
              <p className="search-result-card__desc">{highlight.description}</p>
            ) : highlight.formattedAddress ? (
              <p className="search-result-card__desc search-result-card__desc--address">
                {highlight.formattedAddress}
              </p>
            ) : null}

            {highlight.secondary && highlight.secondary !== highlight.formattedAddress && (
              <p className="search-result-card__meta">{highlight.secondary}</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
