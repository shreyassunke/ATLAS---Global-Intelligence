import { DIMENSIONS } from './eventSchema.js'

export const MODULES = {
  SEISMIC: 'seismic',
  NEWS: 'news',
  CONFLICT: 'conflict',
  FLIGHT: 'flight',
  MARITIME: 'maritime',
  WEATHER: 'weather',
  FINANCIAL: 'financial',
  CYBER: 'cyber',
  PREDICTION: 'prediction',
  SPACE: 'space',
  HUMANITARIAN: 'humanitarian',
  DISEASE: 'disease',
  DIPLOMATIC: 'diplomatic',
  ENERGY: 'energy',
  NUCLEAR: 'nuclear',
  ENVIRONMENT: 'environment',
  SENTIMENT: 'sentiment',
}

export const SOURCE_CATALOG = {
  usgs:             { name: 'USGS Earthquakes',     module: MODULES.SEISMIC,       dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 120_000 },
  gdacs:            { name: 'GDACS Disasters',       module: MODULES.SEISMIC,       dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 300_000 },
  eonet:            { name: 'NASA EONET',            module: MODULES.WEATHER,       dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 600_000 },
  'open-meteo':     { name: 'Open-Meteo',            module: MODULES.WEATHER,       dimension: DIMENSIONS.ENVIRONMENT,  authoritative: false, requiresKey: false,  pollInterval: 600_000 },
  'noaa-kp':        { name: 'NOAA Kp Index',         module: MODULES.SPACE,         dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 300_000 },
  'noaa-xray':      { name: 'NOAA X-Ray Flux',       module: MODULES.SPACE,         dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 300_000 },
  'noaa-solar-wind': { name: 'NOAA Solar Wind',      module: MODULES.SPACE,         dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: false,  pollInterval: 300_000 },
  gdelt:            { name: 'GDELT',                  module: MODULES.NEWS,          dimension: DIMENSIONS.NARRATIVE,    authoritative: false, requiresKey: false,  pollInterval: 300_000 },
  'gdelt-events':   { name: 'GDELT Events',          module: MODULES.CONFLICT,      dimension: DIMENSIONS.SAFETY,       authoritative: false, requiresKey: false,  pollInterval: 900_000 },
  firms:            { name: 'NASA FIRMS',             module: MODULES.ENVIRONMENT,   dimension: DIMENSIONS.ENVIRONMENT,  authoritative: true,  requiresKey: true,   pollInterval: 600_000 },
  ucdp:             { name: 'UCDP Conflict',          module: MODULES.CONFLICT,      dimension: DIMENSIONS.SAFETY,       authoritative: false, requiresKey: false,  pollInterval: 600_000 },
  coingecko:        { name: 'CoinGecko',              module: MODULES.FINANCIAL,     dimension: DIMENSIONS.ECONOMY,      authoritative: false, requiresKey: false,  pollInterval: 300_000 },
  'alt-fng':        { name: 'Fear & Greed Index',     module: MODULES.PREDICTION,    dimension: DIMENSIONS.ECONOMY,      authoritative: false, requiresKey: false,  pollInterval: 900_000 },
  'cisa-kev':       { name: 'CISA KEV',               module: MODULES.CYBER,         dimension: DIMENSIONS.SAFETY,       authoritative: true,  requiresKey: false,  pollInterval: 300_000 },
  reliefweb:        { name: 'ReliefWeb',               module: MODULES.HUMANITARIAN,  dimension: DIMENSIONS.PEOPLE,       authoritative: false, requiresKey: false,  pollInterval: 1_800_000 },
  'who-don':        { name: 'WHO News',                module: MODULES.DISEASE,       dimension: DIMENSIONS.PEOPLE,       authoritative: true,  requiresKey: false,  pollInterval: 900_000 },
  promed:           { name: 'ProMED',                  module: MODULES.DISEASE,       dimension: DIMENSIONS.PEOPLE,       authoritative: false, requiresKey: false,  pollInterval: 900_000 },
  'ofac-sdn':       { name: 'OFAC SDN',               module: MODULES.DIPLOMATIC,    dimension: DIMENSIONS.GOVERNANCE,   authoritative: true,  requiresKey: false,  pollInterval: 86_400_000 },
  'loc-legal':      { name: 'Global Legal Monitor',   module: MODULES.DIPLOMATIC,    dimension: DIMENSIONS.GOVERNANCE,   authoritative: false, requiresKey: false,  pollInterval: 3_600_000 },
  celestrak:        { name: 'Celestrak SOCRATES',      module: MODULES.SPACE,         dimension: DIMENSIONS.ENVIRONMENT,  authoritative: false, requiresKey: false,  pollInterval: 3_600_000 },
}

export function getSourceInfo(sourceId) {
  return SOURCE_CATALOG[sourceId] || null
}

export function getNoKeySourceIds() {
  return Object.entries(SOURCE_CATALOG)
    .filter(([, s]) => !s.requiresKey)
    .map(([id]) => id)
}

export function getAuthoritativeSources() {
  return Object.entries(SOURCE_CATALOG)
    .filter(([, s]) => s.authoritative)
    .map(([id, s]) => ({ id, ...s }))
}

export function computeTTL(pollInterval) {
  return Math.floor((pollInterval / 1000) * 3)
}
