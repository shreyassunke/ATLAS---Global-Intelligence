/**
 * GDELT TV 2.0 API — television news monitoring (150+ stations since 2009).
 *
 * https://blog.gdeltproject.org/gdelt-2-0-television-api-debuts/
 *
 * ATLAS uses this as a second-signal timeline alongside the DOC API
 * article-volume timeline — if TV and print move in sync we can flag
 * cross-medium coverage surges.
 */

import { buildGdeltUrl, fetchGdeltJson } from './gdeltHttp.js'
import { parseTimelineJson } from './analyticsService.js'
import { timespanFromTimeFilter } from './gdeltQueries.js'

export const GDELT_TV_BASE = 'https://api.gdeltproject.org/api/v2/tv/tv'

export { timespanFromTimeFilter }

/**
 * Dataset identifiers exposed by the TV API.
 *   - iatv    : Internet Archive Television (150+ US + int'l stations)
 *   - custom  : legacy curated set
 * Caller can override via `opts.dataset`. Default mirrors what the GDELT
 * web UI ships.
 */
const DEFAULT_DATASET = 'iatv'

function buildTvUrl(query, mode, { timespan = '1440min', dataset = DEFAULT_DATASET, maxrecords = 25, station } = {}) {
  return buildGdeltUrl(GDELT_TV_BASE, {
    query: String(query || '').trim(),
    mode,
    format: 'json',
    datanorm: 'perc',
    timespan,
    dataset,
    maxrecords: mode === 'clipgallery' ? Math.max(1, Math.min(50, Number(maxrecords) || 12)) : null,
    station: station || null,
  })
}

/** TV TimelineVol — percentage of 15-second clips matching the query per day. */
export async function fetchTvTimeline(query, { timespan = '1440min', dataset, signal } = {}) {
  const url = buildTvUrl(query, 'timelinevol', { timespan, dataset })
  const json = await fetchGdeltJson(url, { signal })
  return parseTimelineJson(json)
}

/** TV StationChart — share of coverage per station. */
export async function fetchTvStationChart(query, { timespan = '1440min', dataset, signal } = {}) {
  const url = buildTvUrl(query, 'stationchart', { timespan, dataset })
  const json = await fetchGdeltJson(url, { signal })
  const rows = [json?.stationchart, json?.stationChart, json?.chart, json?.data].find((x) => Array.isArray(x)) || []
  return rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const name = row.station ?? row.name ?? row.label
      const value = row.value ?? row.count ?? row.percent ?? row.freq
      if (!name) return null
      return { name: String(name), value: Number.isFinite(value) ? value : parseFloat(value) || 0 }
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
}

/**
 * TV ClipGallery — recent matching clips with Internet Archive preview links.
 */
export async function fetchTvClips(query, { timespan = '1440min', dataset, maxrecords = 12, station, signal } = {}) {
  const url = buildTvUrl(query, 'clipgallery', { timespan, dataset, maxrecords, station })
  const json = await fetchGdeltJson(url, { signal })
  const rows = [json?.clips, json?.Clips, json?.results, json?.data].find((x) => Array.isArray(x)) || []
  return rows
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null
      const stationId = row.station ?? row.Station ?? row.network ?? ''
      const show = row.show ?? row.Show ?? row.program ?? ''
      const snippet = row.snippet ?? row.Snippet ?? row.preview ?? row.text ?? ''
      const previewUrl = row.previewurl ?? row.previewUrl ?? row.preview_url ?? row.preview ?? ''
      const archiveUrl = row.archive ?? row.archiveUrl ?? row.url ?? row.iaShowId ?? ''
      const date = row.date ?? row.showDate ?? row.Date ?? ''
      return {
        station: String(stationId),
        show: String(show),
        snippet: String(snippet),
        previewUrl: String(previewUrl),
        archiveUrl: String(archiveUrl),
        date: String(date),
      }
    })
    .filter((r) => r && (r.snippet || r.archiveUrl))
    .slice(0, maxrecords)
}

/**
 * Parallel bundle for the TV section of the analytics panel.
 */
export async function fetchTvBundle(query, timespan, opts = {}) {
  const settled = await Promise.allSettled([
    fetchTvTimeline(query, { timespan, ...opts }),
    fetchTvStationChart(query, { timespan, ...opts }),
  ])
  const out = {
    timeline: { dates: [], series: [] },
    stations: [],
    errors: [],
  }
  const keys = ['timeline', 'stations']
  settled.forEach((res, i) => {
    const key = keys[i]
    if (res.status === 'fulfilled') out[key] = res.value
    else out.errors.push({ key, message: res.reason?.message || String(res.reason) })
  })
  return out
}
