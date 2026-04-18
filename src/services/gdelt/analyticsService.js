/**
 * GDELT DOC 2.0 API — timeline, tone, source-country, tone histogram, word cloud.
 * https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 *
 * This module owns DOC-specific response parsing. Query vocabulary and
 * transport live in `./gdeltQueries.js` and `./gdeltHttp.js`.
 */

import { buildGdeltUrl, fetchGdeltJson } from './gdeltHttp.js'
import {
  DIMENSION_GDELT_QUERIES,
  buildGdeltDocQuery,
  formatGdeltDateTick,
  timespanFromTimeFilter,
} from './gdeltQueries.js'

export const GDELT_DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'

// Re-exports for backwards compatibility with existing callers.
export { DIMENSION_GDELT_QUERIES, buildGdeltDocQuery, formatGdeltDateTick, timespanFromTimeFilter }

function buildDocUrl(query, mode, timespan) {
  return buildGdeltUrl(GDELT_DOC_BASE, {
    query: String(query || '').trim(),
    mode,
    format: 'json',
    timespan,
  })
}

function fetchDocJson(query, mode, timespan, opts) {
  return fetchGdeltJson(buildDocUrl(query, mode, timespan), opts)
}

/** GDELT timeline JSON: `{ timeline: [{ series, data: [{ date, value, norm? }] }] }` */
export function parseTimelineJson(json) {
  const timeline = json?.timeline
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { dates: [], series: [] }
  }
  const firstData = timeline[0]?.data
  if (!Array.isArray(firstData)) return { dates: [], series: [] }
  const dates = firstData.map((d) => d.date)
  const series = timeline.map((s) => ({
    name: String(s.series ?? 'series'),
    values: (s.data || []).map((d) => (Number.isFinite(d.value) ? d.value : parseFloat(d.value) || 0)),
  }))
  return { dates, series }
}

/** Aggregate each country series across the whole window (share of attention). */
export function aggregateSourceCountryTotals(parsed) {
  const { dates, series } = parsed
  if (!dates.length || !series.length) return []
  const totals = series.map((s) => ({
    name: s.name,
    value: s.values.reduce((a, b) => a + Math.abs(b), 0),
  }))
  totals.sort((a, b) => b.value - a.value)
  return totals.slice(0, 14)
}

function parseToneChartJson(json) {
  const candidates = [json?.tonechart, json?.toneChart, json?.histogram, json?.chart].find((x) => Array.isArray(x))
  if (!candidates) return []
  return candidates
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const bin = row.bin ?? row.tone ?? row.x ?? row.label ?? row.range
      const count = row.count ?? row.value ?? row.y ?? row.freq
      return {
        bin: bin != null ? String(bin) : '',
        count: Number.isFinite(count) ? count : parseFloat(count) || 0,
      }
    })
    .filter(Boolean)
}

function parseWordCloudJson(json) {
  const candidates = [json?.wordcloud, json?.wordCloud, json?.themes, json?.words].find((x) => Array.isArray(x))
  if (!candidates) return []
  return candidates
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const word = row.word ?? row.term ?? row.label ?? row.theme
      const weight = row.weight ?? row.count ?? row.value ?? row.score
      if (!word) return null
      return {
        word: String(word),
        weight: Number.isFinite(weight) ? weight : parseFloat(weight) || 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 48)
}

export async function fetchTimelineVol(query, timespan, opts) {
  return parseTimelineJson(await fetchDocJson(query, 'timelinevol', timespan, opts))
}

export async function fetchTimelineTone(query, timespan, opts) {
  return parseTimelineJson(await fetchDocJson(query, 'timelinetone', timespan, opts))
}

export async function fetchSourceCountries(query, timespan, opts) {
  const parsed = parseTimelineJson(await fetchDocJson(query, 'timelinesourcecountry', timespan, opts))
  return aggregateSourceCountryTotals(parsed)
}

export async function fetchToneChart(query, timespan, opts) {
  return parseToneChartJson(await fetchDocJson(query, 'tonechart', timespan, opts))
}

export async function fetchWordCloud(query, timespan, opts) {
  return parseWordCloudJson(await fetchDocJson(query, 'wordcloudenglish', timespan, opts))
}

/**
 * Parallel bundle for the analytics HUD. Partial failures are collected in
 * `errors` so the panel can render what succeeded.
 */
export async function fetchGdeltAnalyticsBundle(query, timespan, opts) {
  const keys = ['volume', 'toneTimeline', 'sourceCountries', 'toneBins', 'words']
  const fns = [
    () => fetchTimelineVol(query, timespan, opts),
    () => fetchTimelineTone(query, timespan, opts),
    () => fetchSourceCountries(query, timespan, opts),
    () => fetchToneChart(query, timespan, opts),
    () => fetchWordCloud(query, timespan, opts),
  ]
  const settled = await Promise.allSettled(fns.map((fn) => fn()))
  const out = {
    volume: { dates: [], series: [] },
    toneTimeline: { dates: [], series: [] },
    sourceCountries: [],
    toneBins: [],
    words: [],
    errors: [],
  }
  settled.forEach((res, i) => {
    const key = keys[i]
    if (res.status === 'fulfilled') out[key] = res.value
    else out.errors.push({ key, message: res.reason?.message || String(res.reason) })
  })
  return out
}
