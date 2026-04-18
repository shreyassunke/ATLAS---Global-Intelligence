/**
 * Named, parameterised BigQuery SQL templates for the GDELT public dataset.
 *
 * The client never sends raw SQL — it passes a `template` name + `params`,
 * this module binds those to a hand-audited query, and the BigQuery library
 * parameterises them on the wire. This is the only injection barrier between
 * browser input and the query engine, so keep it disciplined:
 *
 *   - Every template must declare allowed params and their BigQuery types.
 *   - All templates must bound scan size with partition filters + LIMIT.
 *   - No template may interpolate user strings into SQL text.
 *
 * Tables used (all in the public `gdelt-bq` project):
 *   - gdelt-bq.gdeltv2.events_partitioned       (15-min event ticks, CAMEO)
 *   - gdelt-bq.gdeltv2.eventmentions_partitioned (per-mention granularity)
 *   - gdelt-bq.gdeltv2.gkg_partitioned          (Global Knowledge Graph)
 */

const MAX_LIMIT = 500

function clampLimit(n, fallback = 50) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(x)))
}

function clampYears(n, fallback = 5, min = 1, max = 30) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback
  return Math.max(min, Math.min(max, Math.floor(x)))
}

function clampMonths(n, fallback = 12, min = 1, max = 360) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback
  return Math.max(min, Math.min(max, Math.floor(x)))
}

function requireString(v, name, max = 256) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Param '${name}' must be a non-empty string`)
  const s = v.trim()
  if (s.length > max) throw new Error(`Param '${name}' exceeds ${max} chars`)
  return s
}

/**
 * Template registry. Each template is a function returning
 * `{ query, params, types, maxRows }`. Keep param names unique to each.
 */
export const TEMPLATES = {
  /**
   * Per-country stability: avg Goldstein + event count over the last `years`,
   * optionally scoped to a single country ISO2.
   */
  countryStability: (input) => {
    const years = clampYears(input?.years, 5)
    const country = input?.country ? requireString(input.country, 'country', 3).toUpperCase() : null
    const limit = clampLimit(input?.limit, 50)
    const sql = `
      SELECT
        ActionGeo_CountryCode AS country,
        AVG(GoldsteinScale)    AS avgGoldstein,
        SUM(NumMentions)       AS mentions,
        COUNT(*)               AS events
      FROM \`gdelt-bq.gdeltv2.events_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @years YEAR)
        AND ActionGeo_CountryCode IS NOT NULL
        ${country ? 'AND ActionGeo_CountryCode = @country' : ''}
      GROUP BY country
      ORDER BY avgGoldstein ASC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { years, limit, ...(country ? { country } : {}) },
      types: { years: 'INT64', limit: 'INT64', ...(country ? { country: 'STRING' } : {}) },
      maxRows: limit,
    }
  },

  /**
   * Monthly theme timeline from the GKG table. Matches GKG.V1Themes containing
   * the requested substring token (uppercased, as GDELT stores themes in ALLCAPS).
   */
  themeTimeline: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const months = clampMonths(input?.months, 60, 1, 360)
    const limit = clampLimit(input?.limit, MAX_LIMIT)
    const sql = `
      SELECT
        FORMAT_DATE('%Y%m', DATE(PARSE_TIMESTAMP('%Y%m%d', SUBSTR(CAST(DATE AS STRING), 1, 8)))) AS date,
        COUNT(*) AS value
      FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
        AND STRPOS(UPPER(V2Themes), @theme) > 0
      GROUP BY date
      ORDER BY date
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * Top actor pairs for a CAMEO-coded theme over the last `months`.
   * Uses event mentions to weight by coverage volume.
   */
  actorNetwork: (input) => {
    const months = clampMonths(input?.months, 6, 1, 60)
    const minMentions = clampLimit(input?.minMentions, 10)
    const limit = clampLimit(input?.limit, 100)
    const sql = `
      SELECT
        Actor1Name AS actor1,
        Actor2Name AS actor2,
        COUNT(*)   AS pairs,
        SUM(NumMentions) AS mentions,
        AVG(GoldsteinScale) AS avgGoldstein
      FROM \`gdelt-bq.gdeltv2.events_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
        AND Actor1Name IS NOT NULL
        AND Actor2Name IS NOT NULL
        AND Actor1Name != Actor2Name
      GROUP BY actor1, actor2
      HAVING mentions >= @minMentions
      ORDER BY mentions DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { months, minMentions, limit },
      types: { months: 'INT64', minMentions: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * Average tone per country for a theme token over the last N months.
   */
  toneByCountry: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const months = clampMonths(input?.months, 12, 1, 120)
    const limit = clampLimit(input?.limit, 120)
    const sql = `
      SELECT
        V2Locations_CountryCode AS country,
        AVG(V2Tone_Polarity)    AS avgTone,
        COUNT(*)                AS documents
      FROM (
        SELECT
          SPLIT(V2Locations, '#')[SAFE_OFFSET(3)] AS V2Locations_CountryCode,
          CAST(SPLIT(V2Tone, ',')[SAFE_OFFSET(0)] AS FLOAT64) AS V2Tone_Polarity,
          V2Themes
        FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
        WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
          AND STRPOS(UPPER(V2Themes), @theme) > 0
      )
      WHERE V2Locations_CountryCode IS NOT NULL
        AND LENGTH(V2Locations_CountryCode) BETWEEN 2 AND 3
      GROUP BY country
      ORDER BY documents DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * Detect unusual surges: events this week vs the 30-day baseline, scoped
   * to a country.
   */
  eventSurge: (input) => {
    const country = requireString(input?.country, 'country', 3).toUpperCase()
    const limit = clampLimit(input?.limit, 50)
    const sql = `
      WITH recent AS (
        SELECT DATE(_PARTITIONTIME) AS d, COUNT(*) AS c
        FROM \`gdelt-bq.gdeltv2.events_partitioned\`
        WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND ActionGeo_CountryCode = @country
        GROUP BY d
      ),
      stats AS (
        SELECT AVG(c) AS mean, STDDEV(c) AS sd FROM recent
      )
      SELECT r.d AS date, r.c AS events,
        SAFE_DIVIDE(r.c - s.mean, NULLIF(s.sd, 0)) AS zScore
      FROM recent r, stats s
      ORDER BY r.d DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { country, limit },
      types: { country: 'STRING', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * GKG entity co-occurrence — top persons/organisations that appeared in
   * documents matching a theme token. Feeds the Phase 6 network graph.
   */
  gkgEntities: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const field = input?.field === 'organizations' ? 'V2Organizations' : 'V2Persons'
    const months = clampMonths(input?.months, 3, 1, 24)
    const limit = clampLimit(input?.limit, 80)
    const sql = `
      SELECT
        entity,
        COUNT(*) AS mentions
      FROM (
        SELECT TRIM(SPLIT(entity_raw, ',')[SAFE_OFFSET(0)]) AS entity
        FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`,
          UNNEST(SPLIT(${field}, ';')) AS entity_raw
        WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
          AND STRPOS(UPPER(V2Themes), @theme) > 0
          AND ${field} IS NOT NULL
      )
      WHERE entity IS NOT NULL AND entity != ''
      GROUP BY entity
      ORDER BY mentions DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * How a single story spreads — per-mention cadence (15-min buckets) for a
   * specific GlobalEventID over the last N days, joined to the event row so
   * we get location + CAMEO context alongside the timeline.
   */
  mentionsProgression: (input) => {
    const globalEventId = Number.isFinite(Number(input?.globalEventId))
      ? Math.floor(Number(input.globalEventId))
      : null
    if (globalEventId == null || globalEventId <= 0) {
      throw new Error(`Param 'globalEventId' must be a positive integer`)
    }
    const days = clampMonths(input?.days, 14, 1, 60)
    const limit = clampLimit(input?.limit, 500)
    const sql = `
      SELECT
        TIMESTAMP_TRUNC(TIMESTAMP(PARSE_DATETIME('%Y%m%d%H%M%S', CAST(MentionTimeDate AS STRING))), HOUR) AS bucket,
        COUNT(*)               AS mentions,
        AVG(MentionDocTone)    AS avgTone,
        COUNT(DISTINCT MentionSourceName) AS distinctOutlets
      FROM \`gdelt-bq.gdeltv2.eventmentions_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        AND GLOBALEVENTID = @globalEventId
      GROUP BY bucket
      ORDER BY bucket
      LIMIT @limit
    `
    return {
      query: sql,
      params: { globalEventId, days, limit },
      types: { globalEventId: 'INT64', days: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * CAMEO QuadClass breakdown per country — counts of (1) Verbal Coop,
   * (2) Material Coop, (3) Verbal Conflict, (4) Material Conflict over the
   * last N months. Feeds stacked bar charts and country cards.
   */
  quadClassBreakdown: (input) => {
    const months = clampMonths(input?.months, 6, 1, 120)
    const country = input?.country ? requireString(input.country, 'country', 3).toUpperCase() : null
    const limit = clampLimit(input?.limit, 250)
    const sql = `
      SELECT
        ActionGeo_CountryCode AS country,
        QuadClass,
        COUNT(*) AS events,
        SUM(NumMentions) AS mentions,
        AVG(GoldsteinScale) AS avgGoldstein
      FROM \`gdelt-bq.gdeltv2.events_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
        AND ActionGeo_CountryCode IS NOT NULL
        AND QuadClass BETWEEN 1 AND 4
        ${country ? 'AND ActionGeo_CountryCode = @country' : ''}
      GROUP BY country, QuadClass
      ORDER BY country, QuadClass
      LIMIT @limit
    `
    return {
      query: sql,
      params: { months, limit, ...(country ? { country } : {}) },
      types: { months: 'INT64', limit: 'INT64', ...(country ? { country: 'STRING' } : {}) },
      maxRows: limit,
    }
  },

  /**
   * Top Cloud Vision labels from the Visual Global Knowledge Graph for a
   * theme token (and optional country). Powers the "Imagery" analytics card.
   *
   * VGKG table documented at
   *   http://data.gdeltproject.org/documentation/GDELT-Global_Visual_Knowledge_Graph_(GVKG)_Codebook.pdf
   */
  visualGkgLabels: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const months = clampMonths(input?.months, 3, 1, 24)
    const country = input?.country ? requireString(input.country, 'country', 3).toUpperCase() : null
    const limit = clampLimit(input?.limit, 60)
    const sql = `
      SELECT
        label,
        COUNT(*) AS occurrences,
        AVG(confidence) AS avgConfidence,
        ANY_VALUE(DocumentIdentifier) AS exampleUrl
      FROM (
        SELECT
          TRIM(SPLIT(entry, ',')[SAFE_OFFSET(0)]) AS label,
          SAFE_CAST(SPLIT(entry, ',')[SAFE_OFFSET(1)] AS FLOAT64) AS confidence,
          DocumentIdentifier,
          V2Themes,
          V2LocationsCountryCode
        FROM \`gdelt-bq.gdeltv2.vgkg_partitioned\`,
          UNNEST(SPLIT(COALESCE(ImgLabels, ''), ';')) AS entry
        WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
          AND STRPOS(UPPER(COALESCE(V2Themes, '')), @theme) > 0
      )
      WHERE label IS NOT NULL AND label != ''
        ${country ? 'AND STRPOS(UPPER(COALESCE(V2LocationsCountryCode, \'\')), @country) > 0' : ''}
      GROUP BY label
      ORDER BY occurrences DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit, ...(country ? { country } : {}) },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64', ...(country ? { country: 'STRING' } : {}) },
      maxRows: limit,
    }
  },

  /**
   * Top GCAM emotion codes for a theme. V2GCAM is a comma-separated list of
   * `codebook.dimension:value` tokens — we split, average the numeric
   * dimension values, and return the top-K so the radar chart stays legible.
   */
  gcamEmotions: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const months = clampMonths(input?.months, 3, 1, 24)
    const limit = clampLimit(input?.limit, 40)
    const sql = `
      SELECT
        code,
        AVG(value) AS avgValue,
        COUNT(*)   AS samples
      FROM (
        SELECT
          SPLIT(token, ':')[SAFE_OFFSET(0)] AS code,
          SAFE_CAST(SPLIT(token, ':')[SAFE_OFFSET(1)] AS FLOAT64) AS value
        FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`,
          UNNEST(SPLIT(COALESCE(V2GCAM, ''), ',')) AS token
        WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
          AND STRPOS(UPPER(COALESCE(V2Themes, '')), @theme) > 0
      )
      WHERE code IS NOT NULL
        AND code != ''
        AND STARTS_WITH(code, 'v')
        AND value IS NOT NULL
      GROUP BY code
      ORDER BY samples DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * Co-citation network: which news outlets publish the same GKG theme. The
   * client can render this as a force graph alongside the actor network.
   */
  sourceDomainNetwork: (input) => {
    const theme = requireString(input?.theme, 'theme', 96).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    const months = clampMonths(input?.months, 3, 1, 24)
    const limit = clampLimit(input?.limit, 150)
    const sql = `
      SELECT
        SourceCommonName AS source,
        COUNT(*) AS documents,
        AVG(SAFE_CAST(SPLIT(V2Tone, ',')[SAFE_OFFSET(0)] AS FLOAT64)) AS avgTone,
        COUNT(DISTINCT DATE(_PARTITIONTIME)) AS activeDays
      FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
        AND STRPOS(UPPER(COALESCE(V2Themes, '')), @theme) > 0
        AND SourceCommonName IS NOT NULL
      GROUP BY source
      ORDER BY documents DESC
      LIMIT @limit
    `
    return {
      query: sql,
      params: { theme, months, limit },
      types: { theme: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },

  /**
   * Long-range TV timeline from the Internet Archive TV News Archive
   * (`gdelt-bq.gdeltv2.iatv`). The public HTTP TV API caps at ~1y; BigQuery
   * lets us trend a keyword across the full archive (2009 → today).
   */
  tvTimeline: (input) => {
    const keyword = requireString(input?.keyword, 'keyword', 96)
    const months = clampMonths(input?.months, 24, 1, 360)
    const limit = clampLimit(input?.limit, MAX_LIMIT)
    const sql = `
      SELECT
        FORMAT_DATE('%Y%m', DATE(_PARTITIONTIME)) AS month,
        COUNT(*) AS mentions,
        COUNT(DISTINCT station) AS distinctStations
      FROM \`gdelt-bq.gdeltv2.iatv\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @months MONTH)
        AND REGEXP_CONTAINS(LOWER(snippet), LOWER(@keyword))
      GROUP BY month
      ORDER BY month
      LIMIT @limit
    `
    return {
      query: sql,
      params: { keyword, months, limit },
      types: { keyword: 'STRING', months: 'INT64', limit: 'INT64' },
      maxRows: limit,
    }
  },
}

export function resolveTemplate(name, params) {
  const fn = TEMPLATES[name]
  if (!fn) throw new Error(`Unknown template: ${name}`)
  return fn(params || {})
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES)
