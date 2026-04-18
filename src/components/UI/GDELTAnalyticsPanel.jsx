import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'
import { useAtlasStore } from '../../store/atlasStore'
import {
  fetchGdeltAnalyticsBundle,
  formatGdeltDateTick,
  timespanFromTimeFilter,
} from '../../services/gdelt/analyticsService'
import { fetchContextSentences } from '../../services/gdelt/contextService'
import { fetchTvBundle } from '../../services/gdelt/tvService'
import {
  fetchCountryStability,
  fetchThemeTimeline,
  fetchGkgEntities,
  fetchEventSurge,
  fetchQuadClassBreakdown,
  fetchGcamEmotions,
  fetchSourceDomainNetwork,
  queryToThemeToken,
} from '../../services/gdelt/bigqueryService'
import { fetchGdeltSummary } from '../../services/gdelt/summaryService'
import { DIMENSION_COLORS, DIMENSION_LABELS } from '../../core/eventSchema'
import ForceNetworkGraph from './ForceNetworkGraph'
import ClipGallery from './ClipGallery'
import VgkgImageryPanel from './VgkgImageryPanel'
import TimeRangePicker from './TimeRangePicker'
import ThemeExplorer from './ThemeExplorer'
import GdeltAttribution from './GdeltAttribution'
import gcamEmotions from '../../config/gcamEmotions.json'
import {
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts'

// ── Shared chart styling (kept here so every panel chart stays visually consistent) ──
const AXIS_TICK = { fill: 'rgba(255,255,255,0.35)', fontSize: 9 }
const GRID_STROKE = 'rgba(255,255,255,0.06)'
const TOOLTIP_STYLE = {
  background: '#0c1018',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontSize: 11,
}

const TIME_OPTIONS = [
  { value: 'live', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

const TABS = [
  { id: 'trends', label: 'Trends' },
  { id: 'tv', label: 'TV' },
  { id: 'context', label: 'Context' },
  { id: 'history', label: 'Historical' },
  { id: 'imagery', label: 'Imagery' },
  { id: 'network', label: 'Network' },
  { id: 'themes', label: 'Themes' },
]

function seriesToRows(dates, seriesList, seriesIndex = 0) {
  const s = seriesList?.[seriesIndex]
  if (!dates?.length || !s?.values?.length) return []
  const n = Math.min(dates.length, s.values.length)
  const rows = new Array(n)
  for (let i = 0; i < n; i++) {
    rows[i] = { x: formatGdeltDateTick(dates[i]), v: s.values[i] }
  }
  return rows
}

// ── Small display primitives (extracted to kill the 5× chart boilerplate) ──

function Section({ title, children }) {
  return (
    <section>
      <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ children }) {
  return <p className="text-[11px] text-white/35">{children}</p>
}

function TimelineCard({ rows, color, height = 160, label = 'Value', emptyText = 'No data.' }) {
  if (!rows.length) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="x" tick={AXIS_TICK} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} width={32} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'rgba(255,255,255,0.5)' }} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} name={label} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function VerticalBarCard({ data, color, height = 208, label = 'Value', emptyText = 'No data.' }) {
  if (!data?.length) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} name={label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function HistogramCard({ data, color, height = 176, label = 'Count', emptyText = 'No data.' }) {
  if (!data?.length) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="bin" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 8 }} interval={0} angle={-25} textAnchor="end" height={48} />
          <YAxis tick={AXIS_TICK} width={28} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} name={label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/90">
      {message}
    </div>
  )
}

function WarnBanner({ errors }) {
  if (!errors?.length) return null
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-100/80">
      {errors.map((e) => `${e.key}: ${e.message}`).join(' · ')}
    </div>
  )
}

function Loading({ text = 'Loading…' }) {
  return <div className="py-10 text-center text-[11px] uppercase tracking-widest text-white/35">{text}</div>
}

// ── Per-tab data hooks ──

/** Generic "lazy fetch on activation" hook, with cancellation + refresh trigger. */
function useLazyFetch(enabled, deps, fetcher) {
  const [state, setState] = useState({ data: null, loading: false, error: null })
  const reqIdRef = useRef(0)

  const run = useCallback(async () => {
    if (!enabled) return
    const id = ++reqIdRef.current
    const ac = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetcher(ac.signal)
      if (id !== reqIdRef.current) return
      setState({ data, loading: false, error: null })
    } catch (e) {
      if (id !== reqIdRef.current) return
      setState({ data: null, loading: false, error: e?.message || 'Request failed' })
    }
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!enabled) return
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return { ...state, refresh: run }
}

// ── Per-tab views ──

function SummaryCard({ query, timespan }) {
  const { data, loading, error } = useLazyFetch(
    !!query,
    [query, timespan],
    (signal) => fetchGdeltSummary(query, { timespan, signal }),
  )
  if (loading && !data) return null
  if (error || !data || (!data.summary && !data.sources?.length)) return null
  return (
    <section className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <h3 className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">AI summary</h3>
      {data.summary ? (
        <p className="text-[11px] leading-relaxed text-white/80">{data.summary}</p>
      ) : null}
      {data.sources?.length ? (
        <details className="mt-2 text-[10px] text-white/45">
          <summary className="cursor-pointer select-none hover:text-white/70">
            Sources consulted ({data.sources.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {data.sources.map((s, i) => (
              <li key={`${s.url}-${i}`}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-300/80 hover:text-sky-200">
                  {s.domain || new URL(s.url).hostname}
                </a>
                {s.title ? <span className="ml-1 text-white/60">— {s.title.slice(0, 80)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

function MentionsSpreadCard({ query, timespan, dimColor }) {
  // Use DOC timelinevol as a live proxy for "how this story is spreading"
  // when we don't have a BigQuery globalEventId. Same endpoint as the main
  // timeline but bucketed at 15-min resolution.
  const { data } = useLazyFetch(
    !!query,
    [query, timespan],
    (signal) =>
      import('../../services/gdelt/analyticsService').then((mod) =>
        mod.fetchTimelineVol(query, timespan, { signal, timelinesmooth: 3 }),
      ),
  )
  const rows = useMemo(() => seriesToRows(data?.dates, data?.series, 0), [data])
  if (!rows.length) return null
  return (
    <section>
      <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">How this story spread</h3>
      <div style={{ height: 120 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="x" tick={AXIS_TICK} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} width={28} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="v" stroke={dimColor} fill={dimColor} fillOpacity={0.15} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function HistoricalPrecedentCard({ query }) {
  // Overlay the current week's volume against the 30-day baseline using the
  // eventSurge BigQuery template. No country? Return nothing — the surge
  // query is country-scoped.
  const theme = query ? queryToThemeToken(query) : null
  const { data } = useLazyFetch(
    !!theme,
    [theme],
    async (signal) => {
      try { return await fetchEventSurge('US', { limit: 30, signal, bust: false }) }
      catch { return [] }
    },
  )
  const rows = Array.isArray(data) ? [...data].reverse() : []
  if (!rows.length) return null

  const mean = rows.reduce((a, r) => a + (Number(r.events) || 0), 0) / rows.length
  const last = rows[rows.length - 1]
  const z = Number(last?.zScore)
  const hasZ = Number.isFinite(z)
  const badge = hasZ
    ? `${Math.abs(z).toFixed(1)}σ ${z >= 0 ? 'above' : 'below'} 30-day baseline`
    : 'baseline ready'
  const badgeColor = hasZ && Math.abs(z) >= 2
    ? (z >= 0 ? 'rgba(248,113,113,0.9)' : 'rgba(96,165,250,0.9)')
    : 'rgba(203,213,225,0.75)'

  return (
    <section className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Historical precedent (30d)</h3>
        <span
          className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{ color: badgeColor, borderColor: badgeColor }}
        >
          {badge}
        </span>
      </div>
      <div style={{ height: 110 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="date" tick={AXIS_TICK} interval="preserveStartEnd" hide />
            <YAxis tick={AXIS_TICK} width={28} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={mean} stroke="#94a3b8" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="events" stroke="#EF9F27" fill="#EF9F27" fillOpacity={0.15} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function GcamRadarCard({ query }) {
  const theme = query ? queryToThemeToken(query) : null
  const { data } = useLazyFetch(
    !!theme,
    [theme],
    async (signal) => {
      try { return await fetchGcamEmotions(theme, { months: 3, limit: 8, signal }) }
      catch { return [] }
    },
  )
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) return null
  const descByCode = new Map(gcamEmotions.map((e) => [e.code, e.description]))
  const points = rows.map((r) => ({
    emotion: descByCode.get(r.code) || r.code,
    value: Number(r.avgValue) || 0,
  }))
  return (
    <section>
      <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">GCAM emotions (3m)</h3>
      <div style={{ height: 220 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={points} outerRadius="75%">
            <PolarGrid stroke={GRID_STROKE} />
            <PolarAngleAxis dataKey="emotion" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }} />
            <PolarRadiusAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 8 }} />
            <Radar dataKey="value" stroke="#7F77DD" fill="#7F77DD" fillOpacity={0.25} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function TrendsTab({ ctx, timespan, dimColor }) {
  const { data, loading, error, refresh } = useLazyFetch(
    !!ctx?.query,
    [ctx?.query, timespan],
    (signal) => fetchGdeltAnalyticsBundle(ctx.query, timespan, { signal }),
  )

  const volRows = useMemo(() => seriesToRows(data?.volume?.dates, data?.volume?.series, 0), [data])
  const toneRows = useMemo(() => seriesToRows(data?.toneTimeline?.dates, data?.toneTimeline?.series, 0), [data])
  const maxWordWeight = useMemo(() => Math.max(data?.words?.[0]?.weight || 1, 1), [data])

  if (loading && !data) return <Loading text="Loading GDELT…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  return (
    <div className="space-y-4">
      <WarnBanner errors={data.errors} />
      <SummaryCard query={ctx?.query} timespan={timespan} />
      <Section title="Coverage volume">
        <TimelineCard rows={volRows} color={dimColor} label="Articles" emptyText="No timeline data." />
      </Section>
      <MentionsSpreadCard query={ctx?.query} timespan={timespan} dimColor={dimColor} />
      <HistoricalPrecedentCard query={ctx?.query} />
      <Section title="Tone trajectory">
        <TimelineCard rows={toneRows} color="#7F77DD" label="Avg tone" emptyText="No tone timeline." />
      </Section>
      <GcamRadarCard query={ctx?.query} />
      <Section title="Source countries (window)">
        <VerticalBarCard data={data.sourceCountries} color={dimColor} label="Attention" emptyText="No country breakdown." />
      </Section>
      <Section title="Tone distribution">
        <HistogramCard data={data.toneBins} color="#EF9F27" label="Articles" emptyText="No histogram returned for this query." />
      </Section>
      <Section title="Themes (word cloud)">
        {!data.words?.length ? (
          <Empty>No word cloud data.</Empty>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-lg border border-white/5 bg-black/20 px-2 py-3">
            {data.words.map(({ word, weight }) => {
              const t = 0.35 + (weight / maxWordWeight) * 0.65
              const px = 10 + t * 14
              return (
                <span
                  key={word}
                  style={{
                    fontSize: `${px}px`,
                    lineHeight: 1.1,
                    color: `rgba(200,220,255,${0.35 + t * 0.55})`,
                    fontFamily: 'var(--font-data)',
                    fontWeight: t > 0.75 ? 600 : 400,
                  }}
                >
                  {word}
                </span>
              )
            })}
          </div>
        )}
      </Section>
      <RefreshFooter onClick={refresh} loading={loading}>
        Data: GDELT 2.0 DOC API · Volume shown as share of global monitoring where applicable.
      </RefreshFooter>
      <GdeltAttribution compact />
    </div>
  )
}

function TvTab({ ctx, timespan }) {
  const { data, loading, error, refresh } = useLazyFetch(
    !!ctx?.query,
    [ctx?.query, timespan],
    (signal) => fetchTvBundle(ctx.query, timespan, { signal }),
  )
  const timelineRows = useMemo(
    () => seriesToRows(data?.timeline?.dates, data?.timeline?.series, 0),
    [data],
  )

  if (loading && !data) return <Loading text="Loading television data…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  const visualEntityRows = useMemo(
    () => (data?.visualEntities || []).slice(0, 10).map((e) => ({ name: e.name, value: e.value })),
    [data],
  )

  return (
    <div className="space-y-4">
      <WarnBanner errors={data.errors} />
      <Section title="Television airtime">
        <TimelineCard
          rows={timelineRows}
          color="#E24B4A"
          label="% of 15-sec clips"
          emptyText="No television coverage in this window."
        />
      </Section>
      <Section title="Top stations">
        <VerticalBarCard
          data={data.stations}
          color="#378ADD"
          label="Share"
          emptyText="No station breakdown returned."
        />
      </Section>
      <Section title="On-screen entities (TV AI)">
        <VerticalBarCard
          data={visualEntityRows}
          color="#7F77DD"
          label="Share of airtime"
          emptyText="TV AI returned no visual entities for this query."
        />
      </Section>
      <Section title="Recent clips">
        <ClipGallery clips={data.clips} emptyText="No matching clips in window." />
      </Section>
      <RefreshFooter onClick={refresh} loading={loading}>
        Data: GDELT TV 2.0 + TV AI 2.0 · Measured against the Internet Archive TV News feed.
      </RefreshFooter>
      <GdeltAttribution compact />
    </div>
  )
}

function ContextTab({ ctx, timespan }) {
  const { data, loading, error, refresh } = useLazyFetch(
    !!ctx?.query,
    [ctx?.query, timespan],
    (signal) => fetchContextSentences(ctx.query, { timespan, maxrecords: 30, signal }),
  )

  if (loading && !data) return <Loading text="Pulling sentence-level matches…" />
  if (error) return <ErrorBanner message={error} />

  const sentences = Array.isArray(data) ? data : []

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-relaxed text-white/40">
        Sentence-level matches from global media — exactly where the query appears, not just the article list.
      </p>
      {sentences.length === 0 ? (
        <Empty>No sentence matches in this window.</Empty>
      ) : (
        <ul className="space-y-2">
          {sentences.map((s, i) => (
            <li
              key={`${s.url}-${i}`}
              className="rounded-lg border border-white/5 bg-black/20 px-3 py-2.5 text-[11px] leading-relaxed text-white/80"
            >
              <p className="break-words">“{s.text}”</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-white/40">
                {s.domain && <span>{s.domain}</span>}
                {s.sourcecountry && <span>· {s.sourcecountry}</span>}
                {s.language && <span>· {s.language}</span>}
                {s.tone != null && <span>· tone {s.tone.toFixed(1)}</span>}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-sky-300/80 hover:text-sky-200"
                  >
                    open ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RefreshFooter onClick={refresh} loading={loading}>
        Data: GDELT Context 2.0 API · Sentences extracted from full-text crawled coverage.
      </RefreshFooter>
    </div>
  )
}

function HistoryTab({ ctx, dimColor }) {
  // Phase 5 + C5: TimeRangePicker drives every template's months param.
  const enabled = !!ctx?.query
  const [months, setMonths] = useState(60)

  const { data, loading, error, refresh } = useLazyFetch(
    enabled,
    [ctx?.query, months],
    async (signal) => {
      const years = Math.max(1, Math.min(30, Math.round(months / 12)))
      const [timeline, stability, quad, domains] = await Promise.allSettled([
        fetchThemeTimeline(ctx.query, { months, limit: 500, signal }),
        fetchCountryStability(null, { years, limit: 20, signal }),
        fetchQuadClassBreakdown({ months: Math.min(months, 120), limit: 250, signal }),
        fetchSourceDomainNetwork(ctx.query, { months: Math.min(months, 24), limit: 15, signal }),
      ])
      return {
        timeline: timeline.status === 'fulfilled' ? timeline.value : [],
        stability: stability.status === 'fulfilled' ? stability.value : [],
        quad: quad.status === 'fulfilled' ? quad.value : [],
        domains: domains.status === 'fulfilled' ? domains.value : [],
        errors: [timeline, stability, quad, domains]
          .map((r, i) => (r.status === 'rejected'
            ? { key: ['timeline', 'stability', 'quad', 'domains'][i], message: r.reason?.message || String(r.reason) }
            : null))
          .filter(Boolean),
      }
    },
  )

  const timelineRows = data?.timeline?.length
    ? data.timeline.map((r) => ({ x: formatGdeltDateTick(r.date), v: r.value }))
    : []
  const stabilityRows = (data?.stability || [])
    .slice(0, 12)
    .map((r) => ({ name: r.country || r.name || '—', value: Math.abs(r.avgGoldstein ?? r.value ?? 0) }))
  const quadRows = useMemo(() => {
    // Aggregate across countries so the panel shows a global QuadClass split.
    const totals = [0, 0, 0, 0]
    for (const row of data?.quad || []) {
      const qc = Number(row.QuadClass)
      const events = Number(row.events) || 0
      if (qc >= 1 && qc <= 4) totals[qc - 1] += events
    }
    const labels = ['Verbal coop', 'Material coop', 'Verbal conflict', 'Material conflict']
    return labels.map((name, i) => ({ name, value: totals[i] }))
  }, [data])
  const domainRows = (data?.domains || [])
    .slice(0, 12)
    .map((r) => ({ name: r.source || '—', value: Number(r.documents) || 0 }))

  return (
    <div className="space-y-4">
      <TimeRangePicker value={months} onChange={setMonths} defaultMonths={60} syncToUrl />
      {loading && !data && <Loading text="Querying BigQuery historical archive…" />}
      {error && <ErrorBanner message={error} />}
      {data && <WarnBanner errors={data.errors} />}
      {data && (
        <>
          <Section title={`Theme timeline (${months}m)`}>
            <TimelineCard rows={timelineRows} color={dimColor} label="Monthly mentions" emptyText="No historical theme data." />
          </Section>
          <Section title="CAMEO QuadClass split">
            <VerticalBarCard data={quadRows} color="#378ADD" label="Events" emptyText="No QuadClass data." />
          </Section>
          <Section title="Top source domains">
            <VerticalBarCard data={domainRows} color="#7F77DD" label="Documents" emptyText="No domain network returned." />
          </Section>
          <Section title="Least-stable countries (avg Goldstein)">
            <VerticalBarCard data={stabilityRows} color="#E24B4A" label="|Goldstein|" emptyText="No stability data returned." />
          </Section>
        </>
      )}
      <RefreshFooter onClick={refresh} loading={loading}>
        Data: GDELT BigQuery archive (events_partitioned, gkg_partitioned, eventmentions_partitioned, vgkg_partitioned, iatv).
      </RefreshFooter>
      <GdeltAttribution compact />
    </div>
  )
}

function ImageryTab({ ctx }) {
  const theme = ctx?.query ? queryToThemeToken(ctx.query) : null
  if (!theme) return <Empty>Select a cluster to explore imagery.</Empty>
  return (
    <div className="space-y-3">
      <VgkgImageryPanel theme={theme} months={3} country={null} />
      <GdeltAttribution compact />
    </div>
  )
}

function ThemesTab() {
  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-relaxed text-white/40">
        Browse GDELT's 4,000+ GKG themes and 2,300+ GCAM emotion dimensions. Selecting a theme
        makes it the active ATLAS analytics query across every tab.
      </p>
      <ThemeExplorer />
      <GdeltAttribution compact />
    </div>
  )
}

function NetworkTab({ ctx }) {
  const enabled = !!ctx?.query
  const { data, loading, error, refresh } = useLazyFetch(
    enabled,
    [ctx?.query],
    async (signal) => {
      const [persons, orgs] = await Promise.allSettled([
        fetchGkgEntities(ctx.query, { field: 'persons', months: 3, limit: 25, signal }),
        fetchGkgEntities(ctx.query, { field: 'organizations', months: 3, limit: 25, signal }),
      ])
      return {
        persons: persons.status === 'fulfilled' ? persons.value : [],
        organizations: orgs.status === 'fulfilled' ? orgs.value : [],
        errors: [persons, orgs]
          .map((r, i) => (r.status === 'rejected'
            ? { key: ['persons', 'organizations'][i], message: r.reason?.message || String(r.reason) }
            : null))
          .filter(Boolean),
      }
    },
  )

  const graph = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    const theme = queryToThemeToken(ctx?.query || 'world')
    const nodes = [{ id: `theme:${theme}`, group: 'theme', weight: 100, label: theme }]
    const links = []
    const maxMentions = Math.max(
      1,
      ...(data.persons || []).map((p) => p.mentions || 0),
      ...(data.organizations || []).map((o) => o.mentions || 0),
    )
    const pushEntities = (list, group) => {
      for (const row of list || []) {
        const name = row.entity || row.name
        if (!name) continue
        const id = `${group}:${name}`
        const weight = Number(row.mentions) || 0
        nodes.push({ id, group, weight, label: name })
        links.push({ source: `theme:${theme}`, target: id, value: weight / maxMentions })
      }
    }
    pushEntities(data.persons, 'person')
    pushEntities(data.organizations, 'organization')
    return { nodes, links }
  }, [data, ctx?.query])

  if (loading && !data) return <Loading text="Building GKG network from BigQuery…" />
  if (error) return <ErrorBanner message={error} />
  if (!data) return null

  return (
    <div className="space-y-3">
      <WarnBanner errors={data.errors} />
      <p className="text-[10px] leading-relaxed text-white/40">
        Persons and organizations co-occurring with this theme in the GDELT Global Knowledge Graph (last 3 months).
        Drag a node to rearrange the layout.
      </p>
      <div className="rounded-lg border border-white/5 bg-black/20">
        <ForceNetworkGraph nodes={graph.nodes} links={graph.links} width={400} height={360} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[9px] text-white/40">
        <LegendSwatch color="#EF9F27" label="Theme" />
        <LegendSwatch color="#7F77DD" label="Person" />
        <LegendSwatch color="#1D9E75" label="Organization" />
      </div>
      <RefreshFooter onClick={refresh} loading={loading}>
        Data: GDELT GKG (gkg_partitioned) · entity co-occurrence with theme.
      </RefreshFooter>
      <GdeltAttribution compact />
    </div>
  )
}

function LegendSwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function RefreshFooter({ onClick, loading, children }) {
  return (
    <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-[9px] leading-relaxed text-white/30">
      <span className="flex-1">{children}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/50 hover:bg-white/10 disabled:opacity-40"
      >
        {loading ? '…' : 'Refresh'}
      </button>
    </div>
  )
}

// ── Panel shell ──

export default function GDELTAnalyticsPanel() {
  const ctx = useAtlasStore((s) => s.gdeltAnalytics)
  const closeGdeltAnalytics = useAtlasStore((s) => s.closeGdeltAnalytics)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const setTimeFilter = useAtlasStore((s) => s.setTimeFilter)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const [tab, setTab] = useState('trends')

  const timespan = useMemo(() => timespanFromTimeFilter(timeFilter), [timeFilter])
  const dimColor = ctx ? DIMENSION_COLORS[ctx.dimension] || '#378ADD' : '#378ADD'

  // Reset back to Trends every time a new analysis is opened so users land on the default view.
  useEffect(() => {
    if (ctx) setTab('trends')
  }, [ctx?.query])

  return (
    <AnimatePresence>
      {ctx ? (
        <motion.div
          key="gdelt-analytics"
          role="dialog"
          aria-label="GDELT analytics"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={
            mobileMode
              ? 'fixed z-[46] left-3 right-3 bottom-14 max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-[#080c18]/95 backdrop-blur-xl shadow-2xl'
              : 'fixed z-[46] right-[var(--hud-padding,16px)] top-[52px] w-[min(440px,calc(100vw-32px))] max-h-[calc(100vh-72px)] overflow-y-auto rounded-xl border border-white/10 bg-[#080c18]/95 backdrop-blur-xl shadow-2xl'
          }
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#080c18]/98 px-4 py-3 backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <div
                className="inline-flex items-center gap-2 rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  color: dimColor,
                  border: `1px solid color-mix(in srgb, ${dimColor} 35%, transparent)`,
                  background: `color-mix(in srgb, ${dimColor} 12%, transparent)`,
                }}
              >
                GDELT · {DIMENSION_LABELS[ctx.dimension] || ctx.dimension}
              </div>
              <h2 className="mt-1.5 font-semibold leading-snug text-white/95" style={{ fontFamily: 'var(--font-ui)' }}>
                {ctx.label || 'Topic analytics'}
              </h2>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-white/45" title={ctx.query}>
                {ctx.query}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-white/50 transition hover:bg-white/5 hover:text-white/90"
              onClick={() => closeGdeltAnalytics()}
              aria-label="Close analytics"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 px-4 py-3">
            {/* Tabs */}
            <div className="flex gap-1 rounded-md border border-white/5 bg-white/[0.02] p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                    tab === t.id
                      ? 'bg-white/10 text-white shadow-inner'
                      : 'text-white/40 hover:bg-white/5 hover:text-white/70'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Timespan selector (BigQuery tabs own their own time range) */}
            {tab !== 'history' && tab !== 'network' && tab !== 'imagery' && tab !== 'themes' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/35">Timespan</span>
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimeFilter(opt.value)}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                      timeFilter === opt.value
                        ? 'bg-[var(--accent)]/25 text-[var(--accent)] ring-1 ring-[var(--accent)]/40'
                        : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white/75'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {tab === 'trends' && <TrendsTab ctx={ctx} timespan={timespan} dimColor={dimColor} />}
            {tab === 'tv' && <TvTab ctx={ctx} timespan={timespan} />}
            {tab === 'context' && <ContextTab ctx={ctx} timespan={timespan} />}
            {tab === 'history' && <HistoryTab ctx={ctx} dimColor={dimColor} />}
            {tab === 'imagery' && <ImageryTab ctx={ctx} />}
            {tab === 'network' && <NetworkTab ctx={ctx} />}
            {tab === 'themes' && <ThemesTab />}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
