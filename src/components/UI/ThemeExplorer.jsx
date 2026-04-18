import { useMemo, useState } from 'react'
import themes from '../../config/gkgThemes.json'
import emotions from '../../config/gcamEmotions.json'
import { useAtlasStore } from '../../store/atlasStore'

/**
 * Typeahead over the full GDELT GKG theme taxonomy (~4k themes) and the
 * GCAM emotion codebook. Selecting an entry sets it as the active ATLAS
 * analytics query so the Trends / History / Network tabs re-fetch.
 */

function matchScore(needle, haystack) {
  if (!needle) return 0
  const h = haystack.toUpperCase()
  if (h === needle) return 100
  if (h.startsWith(needle)) return 80
  if (h.includes(needle)) return 50
  return 0
}

export default function ThemeExplorer({ onSelect }) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('themes')
  const openGdeltAnalytics = useAtlasStore((s) => s.openGdeltAnalytics)

  const filtered = useMemo(() => {
    const needle = query.trim().toUpperCase()
    if (!needle) return tab === 'themes' ? themes.slice(0, 40) : emotions.slice(0, 40)
    if (tab === 'themes') {
      return themes
        .map((t) => ({ ...t, score: matchScore(needle, t.theme) }))
        .filter((t) => t.score > 0)
        .sort((a, b) => b.score - a.score || b.count - a.count)
        .slice(0, 40)
    }
    return emotions
      .map((e) => ({
        ...e,
        score:
          matchScore(needle, e.code) ||
          matchScore(needle, (e.description || '').toUpperCase()),
      }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
  }, [query, tab])

  const pickTheme = (theme) => {
    onSelect?.({ kind: 'theme', value: theme })
    openGdeltAnalytics?.({ query: theme, label: theme, dimension: 'narrative' })
  }

  const pickEmotion = (row) => {
    onSelect?.({ kind: 'emotion', value: row.code, label: row.description })
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
      <div className="flex items-center gap-1">
        {['themes', 'emotions'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
              tab === t ? 'bg-white/15 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white/75'
            }`}
          >
            {t}
          </button>
        ))}
        <input
          type="search"
          placeholder={tab === 'themes' ? 'Search 4k GKG themes…' : 'Search GCAM emotions…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto w-48 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/85 outline-none focus:border-white/25"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto pr-1 text-[10px]">
        {filtered.length === 0 && (
          <li className="py-2 text-center text-[10px] text-white/35">No matches.</li>
        )}
        {tab === 'themes' &&
          filtered.map((row) => (
            <li key={row.theme}>
              <button
                type="button"
                onClick={() => pickTheme(row.theme)}
                className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-white/5"
              >
                <span className="font-mono text-white/80">{row.theme}</span>
                {row.count ? (
                  <span className="text-[9px] text-white/35">{row.count.toLocaleString()}</span>
                ) : null}
              </button>
            </li>
          ))}
        {tab === 'emotions' &&
          filtered.map((row) => (
            <li key={row.code}>
              <button
                type="button"
                onClick={() => pickEmotion(row)}
                className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-white/5"
              >
                <span className="font-mono text-white/80">{row.code}</span>
                <span className="truncate text-[9px] text-white/55">{row.description}</span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}
