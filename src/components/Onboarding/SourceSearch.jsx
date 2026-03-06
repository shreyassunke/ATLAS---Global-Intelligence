import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { searchSourcesByLocation, fetchAllSources, NEWS_SOURCES } from '../../utils/newsSources'
import { useAtlasStore } from '../../store/atlasStore'

const DOMAIN_REGEX = /^([a-z0-9-]+\.)+[a-z]{2,}$/i

function isDomain(text) {
  return DOMAIN_REGEX.test(text.trim())
}

function extractDomain(text) {
  return text.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
}

export default function SourceSearch({ compact = false, variant = 'default' }) {
  const { selectedSources, addSource, sourceCatalog, setSourceCatalog } = useAtlasStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [catalogReady, setCatalogReady] = useState(sourceCatalog.length > 0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const catalog = useMemo(
    () => (sourceCatalog.length > 0 ? sourceCatalog : NEWS_SOURCES),
    [sourceCatalog],
  )

  useEffect(() => {
    if (sourceCatalog.length > 0) {
      setCatalogReady(true)
      return
    }
    const apiKey = import.meta.env.VITE_NEWS_API_KEY
    fetchAllSources(apiKey).then((data) => {
      setSourceCatalog(data)
      setCatalogReady(true)
    })
  }, [sourceCatalog.length, setSourceCatalog])

  useEffect(() => {
    if (compact && inputRef.current) inputRef.current.focus()
  }, [compact])

  const selectedIds = useMemo(
    () => new Set(selectedSources.map((s) => s.id)),
    [selectedSources],
  )

  const handleQueryChange = useCallback(
    (e) => {
      const val = e.target.value
      setQuery(val)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        if (val.trim().length < 2) {
          setResults([])
          return
        }
        const matches = await searchSourcesByLocation(val, catalog)
        setResults(matches)
      }, 400)
    },
    [catalog],
  )

  const handleAddSource = useCallback(
    (source) => {
      addSource({ id: source.id, name: source.name, type: 'source' })
      setQuery('')
      setResults([])
    },
    [addSource],
  )

  const handleAddDomain = useCallback(() => {
    const domain = extractDomain(query)
    if (!domain) return
    addSource({ id: domain, name: domain, type: 'domain' })
    setQuery('')
    setResults([])
  }, [query, addSource])

  const showDomainOption =
    query.trim().length > 3 &&
    results.length === 0 &&
    isDomain(extractDomain(query))

  const containerClass = compact
    ? 'w-full'
    : 'w-full mx-auto'
  const isUnderline = variant === 'underline'

  return (
    <div className={containerClass}>
      {/* Search input */}
      <div className="relative">
        <div
          className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] ${isUnderline ? 'left-0 w-3.5 h-3.5 opacity-25' : 'left-4'}`}
          aria-hidden
        >
          <svg width={isUnderline ? 14 : 16} height={isUnderline ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isUnderline ? '1.5' : '2'}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder={catalogReady
            ? 'Search by name, city, or region (e.g. Lagos, Africa)...'
            : 'Loading sources...'}
          className={
            isUnderline
              ? 'onboarding-search-underline w-full pl-6 pr-0 py-3 min-h-[44px] bg-transparent border-0 border-b border-b-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-b-[var(--accent)]/40 transition-colors caret-[var(--accent)]'
              : 'w-full pl-11 pr-5 py-3.5 min-h-[44px] rounded-xl text-sm text-white text-center bg-white/[0.04] border border-white/[0.08] placeholder:text-white/50 focus:outline-none focus:border-[var(--accent)]/40 focus:bg-white/[0.06] transition-all'
          }
        />
        {isUnderline && <div className="onboarding-search-line" aria-hidden />}
      </div>

      {/* Results dropdown */}
      <AnimatePresence>
        {(results.length > 0 || showDomainOption) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-2 rounded-xl border border-white/[0.08] bg-[#0a0f1e]/95 backdrop-blur-xl
                       max-h-72 overflow-y-auto shadow-2xl"
          >
            {results.map((source) => {
              const isSelected = selectedIds.has(source.id)
              return (
                <button
                  key={source.id}
                  onClick={() => !isSelected && handleAddSource(source)}
                  disabled={isSelected}
                  className={`w-full px-5 py-3 flex items-center justify-between text-left
                              transition-colors cursor-pointer
                              ${isSelected
                                ? 'opacity-40 cursor-default'
                                : 'hover:bg-white/[0.06]'
                              }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-medium truncate">{source.name}</div>
                    <div className="text-[11px] text-white/40 flex items-center gap-2.5 mt-1">
                      {source.country && <span>{source.country}</span>}
                      {source.category && (
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] tracking-wide">
                          {source.category}
                        </span>
                      )}
                      {source.url && (
                        <span className="truncate max-w-[180px] opacity-50">
                          {source.url.replace(/^https?:\/\//, '')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected ? (
                    <span className="text-[10px] text-[var(--accent)] ml-3 shrink-0 tracking-wide">Added</span>
                  ) : (
                    <span className="text-lg text-white/20 ml-3 shrink-0">+</span>
                  )}
                </button>
              )
            })}

            {showDomainOption && (
              <button
                onClick={handleAddDomain}
                className="w-full px-5 py-4 flex items-center gap-4 text-left
                           hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center
                                text-[var(--accent)] text-sm font-bold shrink-0">
                  +
                </div>
                <div>
                  <div className="text-sm text-white">
                    Add <span className="text-[var(--accent)] font-medium">{extractDomain(query)}</span> as custom source
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">
                    Fetches articles via domain search
                  </div>
                </div>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
