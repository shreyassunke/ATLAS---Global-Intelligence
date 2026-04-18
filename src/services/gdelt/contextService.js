/**
 * GDELT Context 2.0 API — sentence-level search across the news firehose.
 *
 * https://blog.gdeltproject.org/announcing-the-gdelt-context-2-0-api/
 *
 * Unlike the DOC API which matches at the article level, Context returns the
 * specific sentence(s) that satisfied the query along with surrounding
 * context — perfect for "what exactly are people saying about X?" panels.
 */

import { buildGdeltUrl, fetchGdeltJson } from './gdeltHttp.js'
import { timespanFromTimeFilter } from './gdeltQueries.js'

export const GDELT_CONTEXT_BASE = 'https://api.gdeltproject.org/api/v2/context/context'

export { timespanFromTimeFilter }

/**
 * Context API `mode` values (see GDELT blog post):
 *   - SentenceList   — default, list of matching sentences
 *   - SentenceArtList — matching sentences grouped by article
 *   - ArtList        — article-level hits
 */
const DEFAULT_MODE = 'SentenceList'

function buildContextUrl(query, { mode = DEFAULT_MODE, timespan = '1440min', maxrecords = 25 } = {}) {
  return buildGdeltUrl(GDELT_CONTEXT_BASE, {
    query: String(query || '').trim(),
    mode,
    format: 'json',
    timespan,
    maxrecords: Math.max(1, Math.min(100, Number(maxrecords) || 25)),
  })
}

function normalizeSentence(raw) {
  if (!raw || typeof raw !== 'object') return null
  const text = raw.sentence ?? raw.text ?? raw.snippet ?? raw.excerpt ?? raw.content
  if (!text) return null
  const url = raw.url ?? raw.documentIdentifier ?? raw.DocumentIdentifier ?? raw.sourceurl ?? ''
  const title = raw.title ?? raw.docTitle ?? raw.DocumentTitle ?? ''
  const domain = raw.domain ?? raw.sourceCommonName ?? raw.SourceCommonName ?? ''
  const seendate = raw.seendate ?? raw.date ?? raw.Date ?? raw.seenDate ?? ''
  const toneRaw = raw.tone ?? raw.Tone ?? raw.avgtone
  const tone = toneRaw == null ? null : parseFloat(typeof toneRaw === 'string' ? toneRaw.split(',')[0] : toneRaw)
  const language = raw.language ?? raw.docLang ?? raw.Lang ?? ''
  const sourcecountry = raw.sourcecountry ?? raw.sourceCountry ?? raw.SourceCountry ?? ''
  return {
    text: String(text).trim(),
    url: String(url),
    title: String(title),
    domain: String(domain),
    seendate: String(seendate),
    tone: Number.isFinite(tone) ? tone : null,
    language: String(language),
    sourcecountry: String(sourcecountry),
  }
}

function parseContextSentences(json) {
  const candidates = [json?.sentences, json?.Sentences, json?.articles, json?.Articles, json?.results].find((x) => Array.isArray(x))
  if (!candidates) return []
  return candidates.map(normalizeSentence).filter(Boolean)
}

/**
 * Fetch sentence-level Context results for an arbitrary query.
 * @param {string} query GDELT boolean query
 * @param {{ mode?: string, timespan?: string, maxrecords?: number, signal?: AbortSignal }} [opts]
 */
export async function fetchContextSentences(query, opts = {}) {
  const { mode, timespan = '1440min', maxrecords = 25, signal } = opts
  const url = buildContextUrl(query, { mode, timespan, maxrecords })
  const json = await fetchGdeltJson(url, { signal })
  return parseContextSentences(json)
}
