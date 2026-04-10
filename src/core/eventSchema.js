// ═══════════════════════════════════════════════════════════════════════════
//  ATLAS Event Schema — Civilian Intelligence Taxonomy
//
//  Six dimensions derived from PMESII, reframed in civilian language.
//  Color encodes DIMENSION (what kind of event).
//  Size  encodes SEVERITY  (how intense).
//  Pulse encodes RECENCY   (how fresh).
//
//  Priority tiers control default visibility:
//    P1 BREAKING → rapid onset, high severity, time-sensitive
//    P2 ACTIVE   → ongoing situation tracked over days/weeks
//    P3 CONTEXT  → structural background, historical density
// ═══════════════════════════════════════════════════════════════════════════

// ── The six civilian dimensions ──
export const DIMENSIONS = {
  SAFETY:      'safety',       // Armed conflict, violence, displacement, physical threat
  GOVERNANCE:  'governance',   // Elections, legislation, sanctions, coups, judicial events
  ECONOMY:     'economy',      // Markets, trade, labor, supply chains, currency
  PEOPLE:      'people',       // Protests, migration, public health, hunger, social unrest
  ENVIRONMENT: 'environment',  // Disasters, seismic, weather, climate, infrastructure failure
  NARRATIVE:   'narrative',    // Media tone shifts, press freedom, disinfo, censorship
}

export const DIMENSION_KEYS = Object.values(DIMENSIONS)

// ── Color encodes dimension — never sequence, never arbitrary ──
export const DIMENSION_COLORS = {
  [DIMENSIONS.SAFETY]:      '#E24B4A',   // red
  [DIMENSIONS.GOVERNANCE]:  '#7F77DD',   // purple
  [DIMENSIONS.ECONOMY]:     '#EF9F27',   // amber
  [DIMENSIONS.PEOPLE]:      '#1D9E75',   // teal
  [DIMENSIONS.ENVIRONMENT]: '#888780',   // gray
  [DIMENSIONS.NARRATIVE]:   '#378ADD',   // blue
}

// ── Civilian labels — never expose acronyms or military jargon ──
export const DIMENSION_LABELS = {
  [DIMENSIONS.SAFETY]:      'Safety',
  [DIMENSIONS.GOVERNANCE]:  'Governance',
  [DIMENSIONS.ECONOMY]:     'Economy',
  [DIMENSIONS.PEOPLE]:      'People',
  [DIMENSIONS.ENVIRONMENT]: 'Environment',
  [DIMENSIONS.NARRATIVE]:   'Narrative',
}

// ── Dimension icons (editorial, minimal) ──
export const DIMENSION_ICONS = {
  [DIMENSIONS.SAFETY]:      '🛡',   // shield
  [DIMENSIONS.GOVERNANCE]:  '⚖',   // scales
  [DIMENSIONS.ECONOMY]:     '📊',  // chart
  [DIMENSIONS.PEOPLE]:      '👥',  // people
  [DIMENSIONS.ENVIRONMENT]: '🌿',  // leaf
  [DIMENSIONS.NARRATIVE]:   '💬',  // speech
}

// ── Priority tiers (visibility control, not color) ──
export const PRIORITIES = {
  P1: 'p1',    // BREAKING — rapid onset, high severity, time-sensitive
  P2: 'p2',    // ACTIVE — ongoing situation tracked over days/weeks
  P3: 'p3',    // CONTEXT — structural background, historical density
}

export const PRIORITY_LABELS = {
  [PRIORITIES.P1]: 'Breaking',
  [PRIORITIES.P2]: 'Active',
  [PRIORITIES.P3]: 'Context',
}

// ── Size encodes severity ──
export const SEVERITY_SIZES = { 1: 8, 2: 14, 3: 20, 4: 30, 5: 44 }

// ── Corroboration affects opacity (data confidence) ──
export const CORROBORATION_OPACITY = {
  1: 0.35,
  2: 0.55,
  3: 0.75,
  4: 0.88,
  5: 1.0,
}


// ═══════════════════════════════════════════════════════════════════════════
//  Recency — pulse encodes how fresh an event is
// ═══════════════════════════════════════════════════════════════════════════

const TWO_HOURS  = 2 * 3600_000
const TWENTY_FOUR_HOURS = 24 * 3600_000

/**
 * Determine the recency animation state for an event.
 *   'pulsing' → < 2 hours old (animated pulse)
 *   'glowing' → 2–24 hours old (steady glow)
 *   'static'  → > 24 hours old (no animation)
 */
export function getRecencyState(timestamp) {
  const age = Date.now() - new Date(timestamp).getTime()
  if (age < TWO_HOURS) return 'pulsing'
  if (age < TWENTY_FOUR_HOURS) return 'glowing'
  return 'static'
}


// ═══════════════════════════════════════════════════════════════════════════
//  Priority classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify an event into P1/P2/P3 priority.
 *   P1 BREAKING: severity >= 4 AND pulsing (< 2h old)
 *   P2 ACTIVE:   severity >= 2 OR not static (< 24h old)
 *   P3 CONTEXT:  everything else
 */
export function classifyPriority(severity, timestamp) {
  const recency = getRecencyState(timestamp)
  if (severity >= 4 && recency === 'pulsing') return PRIORITIES.P1
  if (severity >= 2 || recency !== 'static') return PRIORITIES.P2
  return PRIORITIES.P3
}


// ═══════════════════════════════════════════════════════════════════════════
//  CAMEO → Dimension mapping (for GDELT events)
// ═══════════════════════════════════════════════════════════════════════════

const SAFETY_CAMEO     = new Set(['17', '18', '19', '20'])  // Coerce, Assault, Fight, Mass Violence
const PEOPLE_CAMEO     = new Set(['14'])                     // Protest
const GOVERNANCE_CAMEO = new Set(['04', '05', '06', '10', '12', '13']) // Consult, Diplomacy, Cooperate, Demand, Reject, Threaten

/**
 * Map a CAMEO root code + quad class to an ATLAS dimension + severity.
 *
 * @param {string} cameoRoot  - CAMEO root event code (e.g. '14' for Protest)
 * @param {number} quadClass  - GDELT QuadClass (1-4)
 * @param {number} goldstein  - Goldstein scale score
 * @returns {{ dimension: string, severity: number }}
 */
export function cameoToDimension(cameoRoot, quadClass, goldstein) {
  const gs = goldstein || 0

  // Material conflict → SAFETY
  if (quadClass === 4 || SAFETY_CAMEO.has(cameoRoot)) {
    return {
      dimension: DIMENSIONS.SAFETY,
      severity: gs <= -8 ? 5 : gs <= -6 ? 4 : gs <= -3 ? 3 : 2,
    }
  }

  // Protest → PEOPLE
  if (PEOPLE_CAMEO.has(cameoRoot)) {
    return {
      dimension: DIMENSIONS.PEOPLE,
      severity: gs <= -5 ? 3 : gs <= -2 ? 2 : 1,
    }
  }

  // Verbal conflict, demands, diplomacy → GOVERNANCE
  if (GOVERNANCE_CAMEO.has(cameoRoot)) {
    return {
      dimension: DIMENSIONS.GOVERNANCE,
      severity: gs <= -5 ? 3 : gs >= 7 ? 2 : 1,
    }
  }

  // Material cooperation → ECONOMY (trade, aid)
  if (quadClass === 2) {
    return { dimension: DIMENSIONS.ECONOMY, severity: 1 }
  }

  // Verbal cooperation → GOVERNANCE
  if (quadClass === 1) {
    return { dimension: DIMENSIONS.GOVERNANCE, severity: 1 }
  }

  // Fallback
  return { dimension: DIMENSIONS.NARRATIVE, severity: 1 }
}


// ═══════════════════════════════════════════════════════════════════════════
//  GDELT Tone → Display
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format a GDELT AvgTone score for display.
 * @param {number} tone - The raw AvgTone value from GDELT
 * @returns {{ label: string, score: string, sentiment: 'negative'|'neutral'|'positive' }}
 */
export function formatToneScore(tone) {
  const t = parseFloat(tone) || 0
  let label, sentiment
  if (t <= -2) {
    label = 'Negative'
    sentiment = 'negative'
  } else if (t >= 2) {
    label = 'Positive'
    sentiment = 'positive'
  } else {
    label = 'Neutral'
    sentiment = 'neutral'
  }
  return { label, score: t.toFixed(1), sentiment }
}


// ═══════════════════════════════════════════════════════════════════════════
//  Event factory
// ═══════════════════════════════════════════════════════════════════════════

export function createEventId(lat, lng, timestamp, source, title) {
  const raw = `${lat}|${lng}|${timestamp}|${source}|${title}`
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36) + '_' + timestamp.toString(36)
}

export function createEvent(fields) {
  const corrobCount = Math.min(Math.max(fields.corroborationCount || 1, 1), 5)
  const isAuthoritative = fields.authoritative || false
  const baseOpacity = CORROBORATION_OPACITY[corrobCount] || 0.35
  const opacity = isAuthoritative && corrobCount === 1
    ? Math.max(0.75, baseOpacity)
    : baseOpacity

  const timestamp = fields.timestamp || new Date().toISOString()
  const severity = Math.max(1, Math.min(5, fields.severity || 1))
  const priority = fields.priority || classifyPriority(severity, timestamp)
  const dimension = fields.dimension || DIMENSIONS.NARRATIVE

  return {
    id: fields.id || createEventId(
      fields.lat || 0,
      fields.lng || 0,
      Date.parse(timestamp),
      fields.source || '',
      fields.title || ''
    ),
    // Civilian taxonomy
    dimension,
    priority,
    color: DIMENSION_COLORS[dimension] || DIMENSION_COLORS[DIMENSIONS.NARRATIVE],
    // Timing
    timestamp,
    fetchedAt: new Date().toISOString(),
    // Location
    lat: fields.lat || 0,
    lng: fields.lng || 0,
    latApproximate: fields.latApproximate || false,
    // Severity & confidence
    severity,
    corroborationCount: corrobCount,
    corroborationSources: fields.corroborationSources || [fields.source || 'unknown'],
    opacity,
    disputed: fields.disputed || false,
    authoritative: isAuthoritative,
    // Lifecycle
    ttl: fields.ttl || 600,
    trajectory: fields.trajectory || null,
    correlatedEventIds: fields.correlatedEventIds || [],
    // Content
    title: fields.title || '',
    detail: fields.detail || '',
    source: fields.source || '',
    sourceUrl: fields.sourceUrl || '',
    tags: fields.tags || [],
    // GDELT enrichment (when available)
    toneScore: fields.toneScore ?? null,   // raw AvgTone number
    actor1: fields.actor1 || '',
    actor2: fields.actor2 || '',
    locationName: fields.locationName || '',
    // Legacy compatibility — components that still read .domain or .tier
    domain: dimension,
    tier: priority === PRIORITIES.P1 ? 'critical'
        : priority === PRIORITIES.P2 ? 'active'
        : 'latent',
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  Legacy compatibility aliases
//
//  Old code reads DOMAINS, TIERS, TIER_COLORS, TIER_SHAPES etc.
//  These aliases prevent import errors during the migration.
//  TODO: remove once all consumers are migrated.
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use DIMENSIONS */
export const DOMAINS = {
  CONFLICT:      DIMENSIONS.SAFETY,
  CYBER:         DIMENSIONS.NARRATIVE,
  NATURAL:       DIMENSIONS.ENVIRONMENT,
  HUMANITARIAN:  DIMENSIONS.PEOPLE,
  ECONOMIC:      DIMENSIONS.ECONOMY,
  SIGNALS:       DIMENSIONS.NARRATIVE,
  HAZARD:        DIMENSIONS.ENVIRONMENT,
}

/** @deprecated Use PRIORITIES */
export const TIERS = {
  LATENT:   'latent',
  ACTIVE:   'active',
  CRITICAL: 'critical',
}

/** @deprecated — color now encodes dimension, not tier */
export const TIER_COLORS = {
  latent:   '#378ADD',   // map to NARRATIVE blue (safe fallback)
  active:   '#EF9F27',   // map to ECONOMY amber
  critical: '#E24B4A',   // map to SAFETY red
}

/** @deprecated — all events use circles now */
export const TIER_SHAPES = {
  latent:   'circle',
  active:   'circle',
  critical: 'circle',
}

export const SHAPES = { CIRCLE: 'circle' }

/** @deprecated Use DIMENSION_ICONS */
export const DOMAIN_ICONS = Object.fromEntries(
  Object.entries(DOMAINS).map(([key, dim]) => [dim, DIMENSION_ICONS[dim] || '◎'])
)
