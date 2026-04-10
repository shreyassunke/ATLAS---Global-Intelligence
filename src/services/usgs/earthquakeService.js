/**
 * USGS Earthquake Hazards Program — GeoJSON Feed Service
 *
 * Fetches real-time earthquake data from USGS.
 * Source: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *
 * No API key required. Free, public, authoritative data.
 * Rendered as magnitude-scaled pulsing rings on the globe.
 */

/**
 * Parse USGS GeoJSON FeatureCollection into earthquake point objects.
 */
export function parseUSGSGeoJSON(data) {
  if (!data?.features) return []

  return data.features
    .filter((f) => f.geometry?.coordinates && f.properties?.mag != null)
    .map((f) => {
      const p = f.properties
      const [lng, lat, depth] = f.geometry.coordinates
      const mag = parseFloat(p.mag)

      if (isNaN(lat) || isNaN(lng) || isNaN(mag)) return null

      // Classify severity by magnitude
      let priority = 'p3'
      let severity = 1
      if (mag >= 7.0) { priority = 'p1'; severity = 5 }
      else if (mag >= 6.0) { priority = 'p1'; severity = 4 }
      else if (mag >= 5.5) { priority = 'p2'; severity = 3 }
      else if (mag >= 5.0) { priority = 'p2'; severity = 2 }
      else if (mag >= 4.0) { priority = 'p3'; severity = 1 }
      else return null // Skip below M4.0 for globe visibility

      // Depth classification
      const depthKm = depth || 0
      const depthLabel = depthKm < 10 ? 'Shallow' : depthKm < 70 ? 'Intermediate' : 'Deep'

      return {
        lat,
        lng,
        magnitude: mag,
        depth: depthKm,
        depthLabel,
        priority,
        severity,
        dimension: 'environment',
        title: p.title || `M${mag.toFixed(1)} Earthquake`,
        detail: `Magnitude ${mag.toFixed(1)} at ${depthKm.toFixed(0)}km depth (${depthLabel}). ${p.place || ''}`.trim(),
        source: 'USGS',
        sourceUrl: p.url || 'https://earthquake.usgs.gov',
        layer: 'usgs',
        timestamp: p.time ? new Date(p.time).toISOString() : new Date().toISOString(),
        felt: p.felt || 0,
        tsunami: p.tsunami || 0,
        alert: p.alert || null, // green, yellow, orange, red
        tags: [
          'earthquake',
          `M${mag.toFixed(1)}`,
          depthLabel.toLowerCase(),
          p.tsunami ? 'tsunami-warning' : null,
          p.alert ? `alert-${p.alert}` : null,
        ].filter(Boolean),
      }
    })
    .filter(Boolean)
}

/**
 * Fetch recent earthquakes from USGS.
 * @param {number} minMag - Minimum magnitude (default 4.5)
 * @param {number} limit - Max events (default 100)
 */
export async function fetchEarthquakes(minMag = 4.5, limit = 100) {
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${minMag}&orderby=time&limit=${limit}`

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
    const data = await res.json()
    return parseUSGSGeoJSON(data)
  } catch (err) {
    console.warn('[USGS] Fetch failed:', err.message)
    return []
  }
}
