/**
 * NASA FIRMS (Fire Information for Resource Management System) Service
 *
 * Fetches active fire/thermal anomaly data via the FIRMS VIIRS REST API.
 * Renders as heat dots/clusters on the globe.
 *
 * Requires a MAP_KEY from: https://firms.modaps.eosdis.nasa.gov/api/map_key
 * Set as VITE_FIRMS_MAP_KEY in .env
 *
 * Data: VIIRS SNPP Near Real-Time (NRT) active fires, global, last 24 hours.
 */

/**
 * Parse FIRMS CSV response into fire point objects.
 * CSV columns: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
 *              instrument,confidence,version,bright_ti5,frp,daynight
 */
export function parseFirmsCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return []

  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const latIdx = headers.indexOf('latitude')
  const lngIdx = headers.indexOf('longitude')
  const confIdx = headers.indexOf('confidence')
  const frpIdx = headers.indexOf('frp')
  const dateIdx = headers.indexOf('acq_date')
  const timeIdx = headers.indexOf('acq_time')
  const brightIdx = headers.indexOf('bright_ti4')

  if (latIdx < 0 || lngIdx < 0) return []

  const fires = []
  // Process up to 200 fire points (global data can be very large)
  const maxRows = Math.min(lines.length, 201)

  for (let i = 1; i < maxRows; i++) {
    const cols = lines[i].split(',')
    const lat = parseFloat(cols[latIdx])
    const lng = parseFloat(cols[lngIdx])
    if (isNaN(lat) || isNaN(lng)) continue

    const confidence = cols[confIdx] || 'nominal'
    const frp = parseFloat(cols[frpIdx]) || 0
    const brightness = parseFloat(cols[brightIdx]) || 0
    const acqDate = cols[dateIdx] || ''
    const acqTime = cols[timeIdx] || ''

    // Classify severity based on Fire Radiative Power (FRP) in megawatts
    let priority = 'p3'
    let severity = 1
    if (frp > 500 || confidence === 'high') {
      priority = 'p1'
      severity = 5
    } else if (frp > 100) {
      priority = 'p2'
      severity = 3
    } else if (frp > 30) {
      priority = 'p2'
      severity = 2
    }

    fires.push({
      lat,
      lng,
      confidence,
      frp,
      brightness,
      acqDate,
      acqTime,
      priority,
      severity,
      dimension: 'environment',
      title: `Active Fire — FRP ${Math.round(frp)} MW`,
      detail: `Confidence: ${confidence}. Fire radiative power: ${frp.toFixed(1)} MW. Brightness: ${brightness.toFixed(1)}K.`,
      source: 'NASA FIRMS',
      sourceUrl: 'https://firms.modaps.eosdis.nasa.gov',
      layer: 'firms',
      timestamp: acqDate
        ? new Date(`${acqDate}T${acqTime ? acqTime.padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2') : '00:00'}:00Z`).toISOString()
        : new Date().toISOString(),
    })
  }

  return fires
}

/**
 * Fetch active fires from NASA FIRMS.
 * @param {string} mapKey - FIRMS API MAP_KEY
 * @param {string} source - Satellite source: VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, MODIS_NRT
 * @param {number} dayRange - Number of days (1, 2, or 10)
 */
export async function fetchFirmsData(mapKey, source = 'VIIRS_SNPP_NRT', dayRange = 1) {
  if (!mapKey) {
    console.warn('[FIRMS] No MAP_KEY provided. Register at https://firms.modaps.eosdis.nasa.gov/api/map_key')
    return []
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/world/${dayRange}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`)
    const csv = await res.text()
    return parseFirmsCSV(csv)
  } catch (err) {
    console.warn('[FIRMS] Fetch failed:', err.message)
    return []
  }
}
