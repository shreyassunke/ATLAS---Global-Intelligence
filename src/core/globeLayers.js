export const NUCLEAR_FACILITIES = [
  { name: 'Zaporizhzhia', lat: 47.51, lng: 34.59, country: 'UA' },
  { name: 'Fukushima Daiichi', lat: 37.42, lng: 141.03, country: 'JP' },
  { name: 'Chernobyl', lat: 51.39, lng: 30.10, country: 'UA' },
  { name: 'Sellafield', lat: 54.42, lng: -3.50, country: 'GB' },
  { name: 'La Hague', lat: 49.68, lng: -1.88, country: 'FR' },
  { name: 'Hanford', lat: 46.55, lng: -119.49, country: 'US' },
  { name: 'Natanz', lat: 33.72, lng: 51.73, country: 'IR' },
  { name: 'Yongbyon', lat: 39.80, lng: 125.75, country: 'KP' },
  { name: 'Dimona', lat: 31.00, lng: 35.15, country: 'IL' },
  { name: 'Bushehr', lat: 28.83, lng: 50.89, country: 'IR' },
  { name: 'Koodankulam', lat: 8.17, lng: 77.71, country: 'IN' },
  { name: 'Barakah', lat: 23.96, lng: 52.26, country: 'AE' },
  { name: 'Hinkley Point C', lat: 51.21, lng: -3.13, country: 'GB' },
  { name: 'Vogtle', lat: 33.14, lng: -81.76, country: 'US' },
  { name: 'Taishan', lat: 21.92, lng: 112.98, country: 'CN' },
]

export const SUBMARINE_CABLE_PATHS = [
  { name: 'Transatlantic', points: [[-73.9, 40.7], [-5.5, 50.1]] },
  { name: 'Trans-Pacific N', points: [[-122.4, 37.8], [139.7, 35.7]] },
  { name: 'Trans-Pacific S', points: [[-118.2, 34.0], [151.2, -33.9]] },
  { name: 'Europe-Asia', points: [[-5.5, 36.0], [32.3, 30.0], [43.3, 12.6], [56.3, 26.6], [72.8, 21.0], [80.2, 13.1], [101.8, 2.5], [103.8, 1.3]] },
  { name: 'US-SA', points: [[-73.9, 40.7], [-43.2, -22.9]] },
  { name: 'Africa-India', points: [[-18.5, 14.7], [39.3, -6.8], [72.8, 19.1]] },
]

export const ARC_TYPES = {
  CORRELATION: 'correlation',
  TRAJECTORY: 'trajectory',
  BLACKOUT: 'blackout',
}

/** Data-layer keys for GDELT GEO overlays (heatmap + choropleth). See `atlasStore` defaults. */
export const GLOBE_OVERLAY_LAYER_KEYS = {
  GDELT_HEATMAP: 'gdeltHeatmap',
  GDELT_CHOROPLETH: 'gdeltChoropleth',
}

/**
 * Globe pins (Map3D / Globe.GL / FlatMap) are limited to GDELT and NASA natural / satellite
 * feeds (EONET, FIRMS). Commercial news API items use the dock feed only.
 * @returns {'gdelt'|'eonet'|'firms'|null}
 */
export function eventSourceToGlobeDataLayerKey(source) {
  const s = (source || '').toLowerCase()
  if (s.includes('gdelt')) return 'gdelt'
  if (s.includes('eonet')) return 'eonet'
  if (s.includes('firms')) return 'firms'
  return null
}

/**
 * Closed ring of lat/lng/alt samples around a point (for Map3D polygon “blobs”).
 * @param {number} radiusDeg approximate angular radius in degrees
 */
export function ringAroundLatLng(lat, lng, radiusDeg, steps = 14, altitudeM = 0) {
  const ring = []
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6
  const n = Math.max(8, steps)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const dlat = radiusDeg * Math.sin(a)
    const dlng = (radiusDeg * Math.cos(a)) / cosLat
    ring.push({ lat: lat + dlat, lng: lng + dlng, altitude: altitudeM })
  }
  return ring
}

export const ARC_LIMIT = 15

export function clusterEvents(events, radiusKm = 200, minClusterSize = 5) {
  const clusters = []
  const assigned = new Set()

  const sorted = [...events].sort((a, b) => b.severity - a.severity)

  for (const evt of sorted) {
    if (assigned.has(evt.id)) continue

    const cluster = [evt]
    assigned.add(evt.id)

    for (const other of sorted) {
      if (assigned.has(other.id)) continue
      // Cluster by dimension (not priority/tier)
      if (other.dimension !== evt.dimension) continue
      const dist = haversineKm(evt.lat, evt.lng, other.lat, other.lng)
      if (dist <= radiusKm) {
        cluster.push(other)
        assigned.add(other.id)
      }
    }

    if (cluster.length >= minClusterSize) {
      let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
      let sumLat = 0, sumLng = 0

      for (const e of cluster) {
        sumLat += e.lat
        sumLng += e.lng
        if (e.lat < minLat) minLat = e.lat
        if (e.lat > maxLat) maxLat = e.lat
        if (e.lng < minLng) minLng = e.lng
        if (e.lng > maxLng) maxLng = e.lng
      }

      clusters.push({
        centroid: { lat: sumLat / cluster.length, lng: sumLng / cluster.length },
        bounds: { minLat, maxLat, minLng, maxLng },
        dimension: evt.dimension,
        priority: evt.priority,
        count: cluster.length,
        maxSeverity: Math.max(...cluster.map(e => e.severity)),
        events: cluster,
      })
    }
  }

  return clusters
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function buildCorrelationArcs(anomalies, eventMap) {
  const arcs = []

  for (const anomaly of anomalies) {
    if (anomaly.type === 'CHOKEPOINT_COMPOSITE') {
      const e1 = eventMap[anomaly.conflictEventId]
      const e2 = eventMap[anomaly.economicEventId]
      if (e1 && e2) {
        arcs.push({
          type: ARC_TYPES.CORRELATION,
          from: { lat: e1.lat, lng: e1.lng },
          to: { lat: e2.lat, lng: e2.lng },
          priority: 'p1',
          label: `Chokepoint: ${anomaly.chokepoint}`,
        })
      }
    }
  }

  return arcs.slice(0, ARC_LIMIT)
}
