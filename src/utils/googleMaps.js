const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

let loadPromise = null
let isLoaded = false

export function loadGoogleMapsSDK() {
  if (isLoaded && window.google?.maps) return Promise.resolve(window.google.maps)
  if (loadPromise) return loadPromise

  if (!API_KEY) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not configured'))
  }

  // Prefer the same loader as @vis.gl/react-google-maps (importLibrary). A second
  // classic script tag without importLibrary breaks Map3D with:
  // "google.maps.importLibrary is not installed."
  if (typeof window.google?.maps?.importLibrary === 'function') {
    loadPromise = window.google.maps
      .importLibrary('streetView')
      .then(() => {
        isLoaded = true
        return window.google.maps
      })
      .catch((err) => {
        loadPromise = null
        throw err
      })
    return loadPromise
  }

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = '__atlas_gmaps_cb_' + Date.now()
    window[callbackName] = () => {
      isLoaded = true
      delete window[callbackName]
      resolve(window.google.maps)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=${callbackName}&libraries=streetView&v=weekly`
    script.async = true
    script.defer = true
    script.onerror = () => {
      delete window[callbackName]
      loadPromise = null
      reject(new Error('Failed to load Google Maps SDK'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

export function checkStreetViewCoverage(lat, lng, radius = 200) {
  return loadGoogleMapsSDK().then((maps) => {
    const service = new maps.StreetViewService()
    return service.getPanorama({
      location: { lat, lng },
      radius,
      preference: maps.StreetViewPreference.NEAREST,
      source: maps.StreetViewSource.OUTDOOR,
    }).then((response) => ({
      available: true,
      location: response.data.location.latLng.toJSON(),
      panoId: response.data.location.pano,
      description: response.data.location.description || '',
    })).catch(() => ({
      available: false,
      location: null,
      panoId: null,
      description: '',
    }))
  })
}

/**
 * Lazy-load the Places library on top of whatever the app already
 * initialised (react-google-maps loads only `maps3d`). Uses the modern
 * `importLibrary` entrypoint so it cooperates with vis.gl's bootstrap.
 */
let placesLibPromise = null
export function loadPlacesLibrary() {
  if (placesLibPromise) return placesLibPromise
  placesLibPromise = loadGoogleMapsSDK().then(async (maps) => {
    if (typeof maps.importLibrary === 'function') {
      return maps.importLibrary('places')
    }
    return maps.places
  }).catch((err) => {
    placesLibPromise = null
    throw err
  })
  return placesLibPromise
}

/**
 * Thin wrapper around `AutocompleteService.getPlacePredictions` that
 * returns a plain array of `{ placeId, main, secondary, description }`
 * so the UI layer never touches Maps objects directly.
 */
export function searchPlacePredictions(input, sessionToken) {
  const q = typeof input === 'string' ? input.trim() : ''
  if (!q) return Promise.resolve([])
  return loadPlacesLibrary().then((places) => {
    const svc = new places.AutocompleteService()
    return new Promise((resolve) => {
      svc.getPlacePredictions(
        {
          input: q,
          sessionToken,
        },
        (preds, status) => {
          if (!preds || status !== 'OK') return resolve([])
          resolve(
            preds.map((p) => ({
              placeId: p.place_id,
              main: p.structured_formatting?.main_text || p.description,
              secondary: p.structured_formatting?.secondary_text || '',
              description: p.description,
              types: p.types || [],
            })),
          )
        },
      )
    })
  }).catch(() => [])
}

/**
 * Resolve a place id to `{ lat, lng, name, viewport }` using the legacy
 * PlacesService (still the most reliable source of viewport bounds for
 * cities / regions, which we use to frame the highlight ring).
 */
export function resolvePlaceDetails(placeId, sessionToken) {
  if (!placeId) return Promise.resolve(null)
  return loadPlacesLibrary().then((places) => {
    const svc = new places.PlacesService(document.createElement('div'))
    return new Promise((resolve) => {
      svc.getDetails(
        {
          placeId,
          // `photos` + `editorial_summary` power the Google-Earth-style
          // info card. `editorial_summary` is a Places SKU-gated field but
          // is the cleanest source of Wikipedia-style blurbs for cities /
          // landmarks — falls back to `formatted_address` when missing.
          fields: [
            'name',
            'formatted_address',
            'geometry',
            'types',
            'photos',
            'editorial_summary',
          ],
          sessionToken,
        },
        (place, status) => {
          if (!place || status !== 'OK' || !place.geometry?.location) return resolve(null)
          const loc = place.geometry.location
          const vp = place.geometry.viewport
          let viewport = null
          if (vp && typeof vp.getNorthEast === 'function') {
            const ne = vp.getNorthEast()
            const sw = vp.getSouthWest()
            viewport = {
              north: ne.lat(),
              east: ne.lng(),
              south: sw.lat(),
              west: sw.lng(),
            }
          }

          let photoUrl = null
          let photoAttribution = ''
          if (Array.isArray(place.photos) && place.photos.length > 0) {
            const photo = place.photos[0]
            try {
              photoUrl = photo.getUrl({ maxWidth: 520, maxHeight: 360 })
            } catch {
              photoUrl = null
            }
            const attrs = photo.html_attributions || []
            if (attrs.length > 0) photoAttribution = attrs[0]
          }

          resolve({
            lat: loc.lat(),
            lng: loc.lng(),
            name: place.name || '',
            formattedAddress: place.formatted_address || '',
            types: place.types || [],
            viewport,
            photoUrl,
            photoAttribution,
            description: place.editorial_summary?.overview || '',
          })
        },
      )
    })
  }).catch(() => null)
}

/**
 * Places `types` → Nominatim reverse-geocode zoom level. The zoom
 * parameter is Nominatim's way of saying "give me the polygon at this
 * admin level". Matching Google Earth's behaviour: a country search
 * paints the country outline, a city search paints the city outline.
 *
 * Reference: https://nominatim.org/release-docs/latest/api/Reverse/#result-restriction
 *
 *   zoom  addressdetails
 *   3     country
 *   5     state
 *   6     region
 *   8     county
 *   10    city
 *   12    town / borough
 *   13    village
 *   14    suburb
 *   16    major streets
 */
const PLACES_TYPE_TO_ZOOM = [
  // Order matters: first match wins, so the more specific types come first.
  ['sublocality_level_1', 14],
  ['sublocality', 14],
  ['neighborhood', 14],
  ['postal_code', 12],
  ['locality', 10],
  ['administrative_area_level_3', 10],
  ['administrative_area_level_2', 8],
  ['administrative_area_level_1', 5],
  ['country', 3],
  ['continent', 3],
]

function zoomForPlaceTypes(types) {
  if (!Array.isArray(types)) return 10
  for (const [key, zoom] of PLACES_TYPE_TO_ZOOM) {
    if (types.includes(key)) return zoom
  }
  // Default to city-level for generic / political results; reverse()
  // will still return the closest admin polygon at that zoom.
  return 10
}

/**
 * Is this place a real administrative area that *has* an official
 * boundary? Landmarks, businesses, parks, train stations and similar
 * point-like results don't have one — matching Google Earth, we should
 * render only the pin for those and skip the outline entirely.
 */
const ADMIN_TYPE_SET = new Set([
  'country',
  'continent',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'locality',
  'sublocality',
  'sublocality_level_1',
  'neighborhood',
  'postal_code',
  'political',
  'colloquial_area',
])

export function placeHasOfficialBoundary(types) {
  if (!Array.isArray(types)) return false
  return types.some((t) => ADMIN_TYPE_SET.has(t))
}

/**
 * Fetch the official administrative boundary polygon for a Google
 * Places result. This is the same style of outline Google Earth paints
 * around search hits — Google doesn't expose the raw polygons via their
 * public API (their boundary dataset is license-restricted), so we use
 * OpenStreetMap Nominatim, which shares upstream national survey data
 * with Google for the vast majority of admin regions.
 *
 * Strategy, in order:
 *   1. **Reverse geocode** at the zoom level derived from the Places
 *      `types` — this returns the *exact* admin polygon containing the
 *      lat/lng at that hierarchy level (city, county, state, country).
 *      No name-matching, so "Bothell, WA" can't collide with "Bothell"
 *      somewhere else.
 *   2. **Forward search** by name as a fallback, with a distance guard
 *      against same-named hits in other parts of the world.
 *
 * Browser fetches don't set `User-Agent`; Nominatim's usage policy
 * tolerates browser origins as long as traffic is user-driven (one
 * fetch per search, never a loop), which matches this flow.
 *
 * Returns `{ type: 'Polygon'|'MultiPolygon', coordinates, displayName } | null`.
 */
export async function fetchPlaceBoundary({ name, lat, lng, types } = {}) {
  if (!placeHasOfficialBoundary(types)) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const zoom = zoomForPlaceTypes(types)

  const reverseUrl =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      zoom: String(zoom),
      polygon_geojson: '1',
      format: 'json',
      'accept-language': 'en',
    }).toString()

  try {
    const res = await fetch(reverseUrl, { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const hit = await res.json()
      const geo = hit?.geojson
      if (geo && (geo.type === 'Polygon' || geo.type === 'MultiPolygon')) {
        return {
          type: geo.type,
          coordinates: geo.coordinates,
          displayName: hit.display_name || '',
          source: 'osm-reverse',
        }
      }
    }
  } catch {
    /* fall through to name search */
  }

  if (!name) return null
  const searchUrl =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: name,
      format: 'json',
      polygon_geojson: '1',
      limit: '5',
      addressdetails: '0',
      'accept-language': 'en',
    }).toString()

  try {
    const res = await fetch(searchUrl, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list)) return null

    let best = null
    let bestDist = Infinity
    for (const hit of list) {
      const geo = hit?.geojson
      if (!geo || (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon')) continue
      const hlat = parseFloat(hit.lat)
      const hlng = parseFloat(hit.lon)
      if (!Number.isFinite(hlat) || !Number.isFinite(hlng)) continue
      const d = Math.hypot(lat - hlat, lng - hlng)
      if (d > 2.5) continue // ≳250 km off → wrong match
      if (d < bestDist) {
        best = hit
        bestDist = d
      }
    }
    if (!best) return null
    return {
      type: best.geojson.type,
      coordinates: best.geojson.coordinates,
      displayName: best.display_name || '',
      source: 'osm-search',
    }
  } catch {
    return null
  }
}

export function newPlacesSessionToken() {
  return loadPlacesLibrary()
    .then((places) => new places.AutocompleteSessionToken())
    .catch(() => null)
}

export function geocodeQuery(query, countryHint) {
  return loadGoogleMapsSDK().then((maps) => {
    const geocoder = new maps.Geocoder()
    const request = { address: query }
    if (countryHint) {
      request.componentRestrictions = { country: countryHint }
    }

    return geocoder.geocode(request).then((response) => {
      if (response.results && response.results.length > 0) {
        const result = response.results[0]
        const loc = result.geometry.location
        return {
          lat: loc.lat(),
          lng: loc.lng(),
          formattedAddress: result.formatted_address,
          types: result.types,
          precision: result.geometry.location_type,
        }
      }
      return null
    }).catch(() => null)
  })
}

export function extractLocationHints(title, detail) {
  if (!title) return []

  const text = `${title} ${detail || ''}`
  const hints = []

  const cityCountryMatch = text.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g)
  if (cityCountryMatch) {
    for (const m of cityCountryMatch) {
      hints.push(m.replace(/^in\s+/i, '').trim())
    }
  }

  const nearMatch = text.match(/\bnear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g)
  if (nearMatch) {
    for (const m of nearMatch) {
      hints.push(m.replace(/^near\s+/i, '').trim())
    }
  }

  const kmMatch = text.match(/(\d+)\s*km\s+(?:from|of|south|north|east|west)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi)
  if (kmMatch) {
    for (const m of kmMatch) {
      const city = m.replace(/^\d+\s*km\s+(?:from|of|south|north|east|west)\s+/i, '').trim()
      if (city) hints.push(city)
    }
  }

  return hints
}

export { API_KEY as GOOGLE_MAPS_API_KEY }
