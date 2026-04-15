import * as THREE from 'three'

/** Geocode a place name (city, region, country) to get country code. Uses Nominatim (free). */
export async function geocodePlace(query) {
  if (!query || query.trim().length < 2) return null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
        new URLSearchParams({
          q: query.trim(),
          format: 'json',
          addressdetails: '1',
          limit: '1',
        }),
      {
        headers: { 'Accept-Language': 'en' },
      },
    )
    const data = await res.json()
    const first = Array.isArray(data) ? data[0] : null
    if (!first?.address) return null
    const cc = first.address.country_code
    return cc ? { countryCode: cc.toUpperCase(), displayName: first.display_name } : null
  } catch {
    return null
  }
}

export function latLngToVector3(lat, lng, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

export function vector3ToLatLng(vec3, radius = 1) {
  const normalized = vec3.clone().normalize()
  const lat = 90 - Math.acos(normalized.y) * (180 / Math.PI)
  const lng = ((270 + Math.atan2(normalized.x, normalized.z) * (180 / Math.PI)) % 360) - 180
  return { lat, lng }
}

export function importanceThresholdForZoom(zoomLevel) {
  if (zoomLevel > 0.8) return 5
  if (zoomLevel > 0.6) return 4
  if (zoomLevel > 0.4) return 3
  if (zoomLevel > 0.25) return 2
  return 1
}

/** Geographic region key for bucketing markers (Americas, Europe, Asia, etc.) */
export function getRegionKey(lat, lng) {
  if (lat >= 0 && lng >= -170 && lng < -30) return 'americas_n'
  if (lat < 0 && lng >= -170 && lng < -30) return 'americas_s'
  if (lng >= -30 && lng < 60 && lat > -20) return 'europe_africa'
  if (lng >= 60 && lng < 150) return 'asia'
  if (lng >= 150 || lng < -170) return 'pacific'
  if (lat < -20 && lng >= -30 && lng < 60) return 'africa_s'
  return 'other'
}

/** Country code (ISO 2-letter) to approximate center coords for NewsAPI source.country fallback */
export const COUNTRY_COORDS = {
  ae: { lat: 23.42, lng: 53.85 }, ar: { lat: -34.60, lng: -58.38 }, au: { lat: -25.27, lng: 133.78 },
  be: { lat: 50.85, lng: 4.35 }, br: { lat: -14.24, lng: -51.93 }, ca: { lat: 56.13, lng: -106.35 },
  ch: { lat: 46.82, lng: 8.23 }, cn: { lat: 35.86, lng: 104.20 }, de: { lat: 51.17, lng: 10.45 },
  eg: { lat: 26.82, lng: 30.80 }, es: { lat: 40.46, lng: -3.75 }, fr: { lat: 46.60, lng: 1.89 },
  gb: { lat: 51.51, lng: -0.13 }, hk: { lat: 22.40, lng: 114.11 }, ie: { lat: 53.14, lng: -7.69 },
  in: { lat: 20.59, lng: 78.96 }, it: { lat: 41.87, lng: 12.57 }, jp: { lat: 36.20, lng: 138.25 },
  kr: { lat: 35.91, lng: 127.77 }, mx: { lat: 23.63, lng: -102.55 }, ng: { lat: 9.08, lng: 8.68 },
  nl: { lat: 52.13, lng: 5.29 }, nz: { lat: -40.90, lng: 174.89 }, pk: { lat: 30.38, lng: 69.35 },
  pl: { lat: 51.92, lng: 19.15 }, qa: { lat: 25.29, lng: 51.53 }, ru: { lat: 61.52, lng: 105.32 },
  sa: { lat: 23.89, lng: 45.08 },
  sg: { lat: 1.35, lng: 103.82 }, tr: { lat: 38.96, lng: 35.24 }, tw: { lat: 23.70, lng: 120.96 },
  ua: { lat: 48.38, lng: 31.17 }, us: { lat: 39.83, lng: -98.58 }, za: { lat: -30.56, lng: 22.94 },
  // Africa
  ke: { lat: -0.02, lng: 37.91 }, gh: { lat: 7.95, lng: -1.02 }, et: { lat: 9.15, lng: 40.49 },
  ma: { lat: 31.79, lng: -7.09 }, dz: { lat: 28.03, lng: 1.66 }, tn: { lat: 33.89, lng: 9.54 },
  zw: { lat: -19.02, lng: 29.15 }, tz: { lat: -6.37, lng: 34.89 }, ug: { lat: 1.37, lng: 32.29 },
  ci: { lat: 7.54, lng: -5.55 }, cm: { lat: 6.37, lng: 12.35 }, sn: { lat: 14.50, lng: -14.45 },
  rw: { lat: -1.94, lng: 29.87 }, mu: { lat: -20.35, lng: 57.55 }, bw: { lat: -22.33, lng: 24.68 },
  ly: { lat: 26.34, lng: 17.23 }, sd: { lat: 15.59, lng: 32.53 }, so: { lat: 5.15, lng: 46.20 },
  // Middle East & Asia
  jo: { lat: 30.59, lng: 36.24 }, lb: { lat: 33.85, lng: 35.86 }, kw: { lat: 29.31, lng: 47.48 },
  om: { lat: 21.47, lng: 55.97 }, ye: { lat: 15.55, lng: 48.52 }, my: { lat: 4.21, lng: 101.98 },
  th: { lat: 15.87, lng: 100.99 }, id: { lat: -0.79, lng: 113.92 }, ph: { lat: 12.88, lng: 121.77 },
  vn: { lat: 14.06, lng: 108.28 }, bn: { lat: 4.54, lng: 114.73 },
  // Americas
  co: { lat: 4.57, lng: -74.30 }, pe: { lat: -9.19, lng: -75.02 }, cl: { lat: -35.68, lng: -71.54 },
  ec: { lat: -1.83, lng: -78.18 }, ve: { lat: 6.42, lng: -66.59 }, cu: { lat: 21.52, lng: -77.78 },
}

/** IANA timezone ID -> { lng, lat } for centering the globe on that region (used on initial load) */
const TIMEZONE_VIEW_CENTERS = {
  UTC: { lng: 20, lat: 25 },
  'America/Los_Angeles': { lng: -118, lat: 34 },
  'America/Denver': { lng: -105, lat: 39 },
  'America/Phoenix': { lng: -112, lat: 33 },
  'America/Chicago': { lng: -87, lat: 41 },
  'America/New_York': { lng: -74, lat: 40 },
  'America/Indianapolis': { lng: -86, lat: 39.7 },
  'America/Detroit': { lng: -83, lat: 42 },
  'America/Toronto': { lng: -79, lat: 43 },
  'America/Halifax': { lng: -63, lat: 44 },
  'America/St_Johns': { lng: -52, lat: 47 },
  'America/Anchorage': { lng: -149, lat: 61 },
  'America/Sao_Paulo': { lng: -46, lat: -23 },
  'America/Buenos_Aires': { lng: -58, lat: -34 },
  'America/Mexico_City': { lng: -99, lat: 19 },
  'Europe/London': { lng: 0, lat: 51 },
  'Europe/Berlin': { lng: 13, lat: 52 },
  'Europe/Paris': { lng: 2, lat: 48 },
  'Europe/Moscow': { lng: 37, lat: 55 },
  'Europe/Istanbul': { lng: 28, lat: 41 },
  'Africa/Johannesburg': { lng: 28, lat: -26 },
  'Africa/Cairo': { lng: 31, lat: 30 },
  'Africa/Lagos': { lng: 3, lat: 6 },
  'Asia/Dubai': { lng: 55, lat: 25 },
  'Asia/Kolkata': { lng: 77, lat: 28 },
  'Asia/Singapore': { lng: 103, lat: 1 },
  'Asia/Shanghai': { lng: 121, lat: 31 },
  'Asia/Tokyo': { lng: 139, lat: 35 },
  'Asia/Seoul': { lng: 126, lat: 37 },
  'Australia/Sydney': { lng: 151, lat: -33 },
  'Australia/Melbourne': { lng: 145, lat: -37 },
  'Pacific/Auckland': { lng: 174, lat: -36 },
}

/** Default view (Atlantic / mid-belt) when timezone cannot be resolved */
const DEFAULT_VIEW_CENTER = { lng: 20, lat: 25 }

/**
 * Returns { lng, lat } to center the globe on the user's timezone region.
 * Uses Intl for current timezone, then TIMEZONE_VIEW_CENTERS or region fallback.
 */
export function getTimezoneViewCenter() {
  let tz = 'UTC'
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return DEFAULT_VIEW_CENTER
  }
  if (TIMEZONE_VIEW_CENTERS[tz]) return TIMEZONE_VIEW_CENTERS[tz]
  const [region] = tz.split('/')
  const regionDefaults = {
    America: { lng: -95, lat: 39 },
    Europe: { lng: 15, lat: 50 },
    Asia: { lng: 100, lat: 30 },
    Africa: { lng: 20, lat: 0 },
    Australia: { lng: 135, lat: -25 },
    Pacific: { lng: -160, lat: -20 },
    Atlantic: { lng: -30, lat: 25 },
    Indian: { lng: 75, lat: -10 },
    Antarctica: { lng: 0, lat: -75 },
  }
  return regionDefaults[region] || DEFAULT_VIEW_CENTER
}
