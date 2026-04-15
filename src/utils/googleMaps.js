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
