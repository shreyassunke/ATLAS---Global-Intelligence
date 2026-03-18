import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { MOCK_NEWS } from '../utils/mockData'
import { COUNTRY_COORDS } from '../utils/geo'
import { fetchAllSources } from '../utils/newsSources'
import { getAvailableProviders } from '../config/newsProviders'
import { fetchFromProviders } from '../services/newsAPI/fetcher'

const MIN_GLOBE_POINTS = 100
const NEWS_CACHE_KEY = 'atlas_cached_news_items'
const LAST_AUTO_REFRESH_DATE_KEY = 'atlas_last_auto_refresh_date'
const MANUAL_REFRESH_DATE_KEY = 'atlas_manual_refresh_date'

function getTodayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Source ID -> country code for fallback when title/description geocoding fails */
const SOURCE_TO_COUNTRY = {
  'bbc-news': 'gb', 'reuters': 'gb', 'the-guardian-uk': 'gb', 'independent': 'gb',
  'financial-times': 'gb', 'cnn': 'us', 'fox-news': 'us', 'nbc-news': 'us',
  'abc-news': 'us', 'cbs-news': 'us', 'the-washington-post': 'us', 'politico': 'us',
  'npr': 'us', 'usa-today': 'us', 'axios': 'us', 'associated-press': 'us',
  'bloomberg': 'us', 'business-insider': 'us', 'cnbc': 'us', 'techcrunch': 'us',
  'the-verge': 'us', 'ars-technica': 'us', 'wired': 'us', 'engadget': 'us',
  'the-wall-street-journal': 'us', 'al-jazeera-english': 'qa', 'the-times-of-india': 'in',
  'the-hindu': 'in', 'abc-news-au': 'au', 'nhk': 'jp', 'le-monde': 'fr',
  'der-spiegel': 'de', 'focus': 'de', 'ansa': 'it', 'el-mundo': 'es',
  'globo': 'br', 'infobae': 'ar', 'cnn-spanish': 'us', 'rt': 'ru',
  'xinhua': 'cn', 'scmp': 'hk', 'the-jakarta-post': 'id', 'straits-times': 'sg',
}
const GEOCODE_CACHE_KEY = 'atlas_geocode_cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

const LOCATION_DB = {
  // ─── US cities & landmarks ───
  'new york city': { lat: 40.71, lng: -74.01 }, 'new york': { lat: 40.71, lng: -74.01 },
  'los angeles': { lat: 34.05, lng: -118.24 }, 'chicago': { lat: 41.88, lng: -87.63 },
  'houston': { lat: 29.76, lng: -95.37 }, 'phoenix': { lat: 33.45, lng: -112.07 },
  'philadelphia': { lat: 39.95, lng: -75.17 }, 'san antonio': { lat: 29.42, lng: -98.49 },
  'san diego': { lat: 32.72, lng: -117.16 }, 'dallas': { lat: 32.78, lng: -96.80 },
  'san francisco': { lat: 37.77, lng: -122.42 }, 'austin': { lat: 30.27, lng: -97.74 },
  'seattle': { lat: 47.61, lng: -122.33 }, 'denver': { lat: 39.74, lng: -104.99 },
  'boston': { lat: 42.36, lng: -71.06 }, 'miami': { lat: 25.76, lng: -80.19 },
  'atlanta': { lat: 33.75, lng: -84.39 }, 'detroit': { lat: 42.33, lng: -83.05 },
  'minneapolis': { lat: 44.98, lng: -93.27 }, 'portland': { lat: 45.52, lng: -122.68 },
  'las vegas': { lat: 36.17, lng: -115.14 }, 'nashville': { lat: 36.16, lng: -86.78 },
  'baltimore': { lat: 39.29, lng: -76.61 }, 'pittsburgh': { lat: 40.44, lng: -80.00 },
  'st. louis': { lat: 38.63, lng: -90.20 }, 'tampa': { lat: 27.95, lng: -82.46 },
  'orlando': { lat: 28.54, lng: -81.38 }, 'charlotte': { lat: 35.23, lng: -80.84 },
  'washington': { lat: 38.91, lng: -77.04 }, 'washington d.c.': { lat: 38.91, lng: -77.04 },
  'washington dc': { lat: 38.91, lng: -77.04 },
  'capitol hill': { lat: 38.89, lng: -77.01 }, 'pentagon': { lat: 38.87, lng: -77.06 },
  'white house': { lat: 38.90, lng: -77.04 }, 'wall street': { lat: 40.71, lng: -74.01 },
  'silicon valley': { lat: 37.39, lng: -122.08 }, 'mar-a-lago': { lat: 26.68, lng: -80.04 },
  'camp david': { lat: 39.65, lng: -77.46 }, 'guantanamo': { lat: 20.01, lng: -75.14 },
  'pearl harbor': { lat: 21.36, lng: -157.95 }, 'hollywood': { lat: 34.10, lng: -118.33 },
  'broadway': { lat: 40.76, lng: -73.98 },

  // ─── US states (centre coords) ───
  'alabama': { lat: 32.32, lng: -86.90 }, 'alaska': { lat: 63.59, lng: -154.49 },
  'arizona': { lat: 34.05, lng: -111.09 }, 'arkansas': { lat: 35.20, lng: -91.83 },
  'california': { lat: 36.78, lng: -119.42 }, 'colorado': { lat: 39.55, lng: -105.78 },
  'connecticut': { lat: 41.60, lng: -72.76 }, 'delaware': { lat: 38.91, lng: -75.53 },
  'florida': { lat: 27.66, lng: -81.52 }, 'georgia': { lat: 32.16, lng: -82.90 },
  'hawaii': { lat: 19.90, lng: -155.58 }, 'idaho': { lat: 44.07, lng: -114.74 },
  'illinois': { lat: 40.63, lng: -89.40 }, 'indiana': { lat: 40.27, lng: -86.13 },
  'iowa': { lat: 41.88, lng: -93.10 }, 'kansas': { lat: 39.01, lng: -98.48 },
  'kentucky': { lat: 37.84, lng: -84.27 }, 'louisiana': { lat: 31.17, lng: -91.87 },
  'maine': { lat: 45.25, lng: -69.45 }, 'maryland': { lat: 39.05, lng: -76.64 },
  'massachusetts': { lat: 42.41, lng: -71.38 }, 'michigan': { lat: 44.31, lng: -85.60 },
  'minnesota': { lat: 46.73, lng: -94.69 }, 'mississippi': { lat: 32.35, lng: -89.40 },
  'missouri': { lat: 37.96, lng: -91.83 }, 'montana': { lat: 46.88, lng: -110.36 },
  'nebraska': { lat: 41.49, lng: -99.90 }, 'nevada': { lat: 38.80, lng: -116.42 },
  'new hampshire': { lat: 43.19, lng: -71.57 }, 'new jersey': { lat: 40.06, lng: -74.41 },
  'new mexico': { lat: 34.52, lng: -105.87 }, 'north carolina': { lat: 35.76, lng: -79.02 },
  'north dakota': { lat: 47.55, lng: -101.00 }, 'ohio': { lat: 40.42, lng: -82.91 },
  'oklahoma': { lat: 35.47, lng: -97.52 }, 'oregon': { lat: 43.80, lng: -120.55 },
  'pennsylvania': { lat: 41.20, lng: -77.19 }, 'rhode island': { lat: 41.58, lng: -71.48 },
  'south carolina': { lat: 33.84, lng: -81.16 }, 'south dakota': { lat: 43.97, lng: -99.90 },
  'tennessee': { lat: 35.52, lng: -86.58 }, 'texas': { lat: 31.97, lng: -99.90 },
  'utah': { lat: 39.32, lng: -111.09 }, 'vermont': { lat: 44.56, lng: -72.58 },
  'virginia': { lat: 37.43, lng: -78.66 }, 'west virginia': { lat: 38.60, lng: -80.95 },
  'wisconsin': { lat: 43.78, lng: -88.79 }, 'wyoming': { lat: 43.08, lng: -107.29 },
  'united states': { lat: 39.83, lng: -98.58 },

  // ─── Europe ───
  'london': { lat: 51.51, lng: -0.13 }, 'uk': { lat: 51.51, lng: -0.13 },
  'britain': { lat: 51.51, lng: -0.13 }, 'england': { lat: 51.51, lng: -0.13 },
  'scotland': { lat: 56.49, lng: -4.20 }, 'wales': { lat: 52.13, lng: -3.78 },
  'northern ireland': { lat: 54.79, lng: -6.49 }, 'belfast': { lat: 54.60, lng: -5.93 },
  'manchester': { lat: 53.48, lng: -2.24 }, 'birmingham': { lat: 52.49, lng: -1.90 },
  'downing street': { lat: 51.50, lng: -0.13 }, 'buckingham palace': { lat: 51.50, lng: -0.14 },
  'paris': { lat: 48.86, lng: 2.35 }, 'france': { lat: 46.60, lng: 1.89 },
  'marseille': { lat: 43.30, lng: 5.37 }, 'lyon': { lat: 45.76, lng: 4.84 },
  'berlin': { lat: 52.52, lng: 13.41 }, 'germany': { lat: 51.17, lng: 10.45 },
  'munich': { lat: 48.14, lng: 11.58 }, 'hamburg': { lat: 53.55, lng: 9.99 },
  'moscow': { lat: 55.76, lng: 37.62 }, 'russia': { lat: 61.52, lng: 105.32 },
  'kremlin': { lat: 55.75, lng: 37.62 }, 'st. petersburg': { lat: 59.93, lng: 30.32 },
  'rome': { lat: 41.90, lng: 12.50 }, 'italy': { lat: 41.87, lng: 12.57 },
  'milan': { lat: 45.46, lng: 9.19 }, 'vatican': { lat: 41.90, lng: 12.45 },
  'madrid': { lat: 40.42, lng: -3.70 }, 'spain': { lat: 40.46, lng: -3.75 },
  'barcelona': { lat: 41.39, lng: 2.17 },
  'lisbon': { lat: 38.72, lng: -9.14 }, 'portugal': { lat: 39.40, lng: -8.22 },
  'vienna': { lat: 48.21, lng: 16.37 }, 'austria': { lat: 47.52, lng: 14.55 },
  'warsaw': { lat: 52.23, lng: 21.01 }, 'poland': { lat: 51.92, lng: 19.15 },
  'prague': { lat: 50.08, lng: 14.44 }, 'czech republic': { lat: 49.82, lng: 15.47 },
  'budapest': { lat: 47.50, lng: 19.04 }, 'hungary': { lat: 47.16, lng: 19.50 },
  'bucharest': { lat: 44.43, lng: 26.10 }, 'romania': { lat: 45.94, lng: 24.97 },
  'amsterdam': { lat: 52.37, lng: 4.90 }, 'netherlands': { lat: 52.13, lng: 5.29 },
  'brussels': { lat: 50.85, lng: 4.35 }, 'belgium': { lat: 50.50, lng: 4.47 },
  'zurich': { lat: 47.38, lng: 8.54 }, 'switzerland': { lat: 46.82, lng: 8.23 },
  'geneva': { lat: 46.20, lng: 6.14 }, 'davos': { lat: 46.80, lng: 9.84 },
  'the hague': { lat: 52.08, lng: 4.31 },
  'stockholm': { lat: 59.33, lng: 18.07 }, 'sweden': { lat: 60.13, lng: 18.64 },
  'oslo': { lat: 59.91, lng: 10.75 }, 'norway': { lat: 60.47, lng: 8.47 },
  'copenhagen': { lat: 55.68, lng: 12.57 }, 'denmark': { lat: 56.26, lng: 9.50 },
  'helsinki': { lat: 60.17, lng: 24.94 }, 'finland': { lat: 61.92, lng: 25.75 },
  'athens': { lat: 37.98, lng: 23.73 }, 'greece': { lat: 39.07, lng: 21.82 },
  'istanbul': { lat: 41.01, lng: 28.98 }, 'ankara': { lat: 39.93, lng: 32.86 },
  'turkey': { lat: 38.96, lng: 35.24 },
  'kyiv': { lat: 50.45, lng: 30.52 }, 'ukraine': { lat: 48.38, lng: 31.17 },
  'europe': { lat: 54.53, lng: 15.26 },
  'eu': { lat: 50.85, lng: 4.35 }, 'european union': { lat: 50.85, lng: 4.35 },
  'nato': { lat: 50.85, lng: 4.35 },

  // ─── Conflict zones & disputed areas ───
  'gaza': { lat: 31.35, lng: 34.31 }, 'gaza strip': { lat: 31.35, lng: 34.31 },
  'west bank': { lat: 31.95, lng: 35.30 }, 'rafah': { lat: 31.28, lng: 34.25 },
  'golan heights': { lat: 32.97, lng: 35.80 },
  'donbas': { lat: 48.01, lng: 37.80 }, 'crimea': { lat: 44.95, lng: 34.10 },
  'mariupol': { lat: 47.10, lng: 37.54 }, 'kherson': { lat: 46.63, lng: 32.62 },
  'zaporizhzhia': { lat: 47.84, lng: 35.14 }, 'odessa': { lat: 46.47, lng: 30.73 },
  'kashmir': { lat: 34.08, lng: 74.80 },
  'south china sea': { lat: 12.00, lng: 114.00 }, 'taiwan strait': { lat: 24.50, lng: 119.00 },
  'horn of africa': { lat: 8.00, lng: 48.00 }, 'sahel': { lat: 14.50, lng: 2.00 },

  // ─── Middle East ───
  'israel': { lat: 31.05, lng: 34.85 }, 'tel aviv': { lat: 32.09, lng: 34.78 },
  'jerusalem': { lat: 31.77, lng: 35.23 }, 'palestine': { lat: 31.95, lng: 35.23 },
  'iran': { lat: 32.43, lng: 53.69 }, 'tehran': { lat: 35.69, lng: 51.39 },
  'iraq': { lat: 33.22, lng: 43.68 }, 'baghdad': { lat: 33.31, lng: 44.37 },
  'syria': { lat: 34.80, lng: 38.99 }, 'damascus': { lat: 33.51, lng: 36.29 },
  'lebanon': { lat: 33.85, lng: 35.86 }, 'beirut': { lat: 33.89, lng: 35.50 },
  'saudi arabia': { lat: 23.89, lng: 45.08 }, 'riyadh': { lat: 24.69, lng: 46.72 },
  'yemen': { lat: 15.55, lng: 48.52 }, 'qatar': { lat: 25.29, lng: 51.53 },
  'doha': { lat: 25.29, lng: 51.53 },
  'dubai': { lat: 25.20, lng: 55.27 }, 'uae': { lat: 23.42, lng: 53.85 },
  'jordan': { lat: 30.59, lng: 36.24 }, 'amman': { lat: 31.96, lng: 35.95 },
  'kuwait': { lat: 29.31, lng: 47.48 }, 'oman': { lat: 21.47, lng: 55.97 },
  'bahrain': { lat: 26.07, lng: 50.56 },

  // ─── Asia ───
  'beijing': { lat: 39.90, lng: 116.40 }, 'china': { lat: 35.86, lng: 104.20 },
  'shanghai': { lat: 31.23, lng: 121.47 }, 'shenzhen': { lat: 22.54, lng: 114.06 },
  'guangzhou': { lat: 23.13, lng: 113.26 },
  'tokyo': { lat: 35.68, lng: 139.69 }, 'japan': { lat: 36.20, lng: 138.25 },
  'osaka': { lat: 34.69, lng: 135.50 },
  'delhi': { lat: 28.61, lng: 77.21 }, 'india': { lat: 20.59, lng: 78.96 },
  'mumbai': { lat: 19.08, lng: 72.88 }, 'bangalore': { lat: 12.97, lng: 77.59 },
  'south korea': { lat: 35.91, lng: 127.77 }, 'seoul': { lat: 37.57, lng: 126.98 },
  'north korea': { lat: 40.34, lng: 127.51 }, 'pyongyang': { lat: 39.04, lng: 125.76 },
  'taiwan': { lat: 23.70, lng: 120.96 }, 'taipei': { lat: 25.03, lng: 121.57 },
  'singapore': { lat: 1.35, lng: 103.82 }, 'hong kong': { lat: 22.40, lng: 114.11 },
  'pakistan': { lat: 30.38, lng: 69.35 }, 'islamabad': { lat: 33.69, lng: 73.04 },
  'afghanistan': { lat: 33.94, lng: 67.71 }, 'kabul': { lat: 34.53, lng: 69.17 },
  'manila': { lat: 14.60, lng: 120.98 }, 'philippines': { lat: 12.88, lng: 121.77 },
  'jakarta': { lat: -6.21, lng: 106.85 }, 'indonesia': { lat: -0.79, lng: 113.92 },
  'hanoi': { lat: 21.03, lng: 105.85 }, 'vietnam': { lat: 14.06, lng: 108.28 },
  'bangkok': { lat: 13.76, lng: 100.50 }, 'thailand': { lat: 15.87, lng: 100.99 },
  'kuala lumpur': { lat: 3.14, lng: 101.69 }, 'malaysia': { lat: 4.21, lng: 101.98 },
  'myanmar': { lat: 19.76, lng: 96.08 }, 'cambodia': { lat: 11.55, lng: 104.92 },

  // ─── Oceania ───
  'sydney': { lat: -33.87, lng: 151.21 }, 'melbourne': { lat: -37.81, lng: 144.96 },
  'australia': { lat: -25.27, lng: 133.78 }, 'new zealand': { lat: -40.90, lng: 174.89 },

  // ─── Africa ───
  'cairo': { lat: 30.04, lng: 31.24 }, 'egypt': { lat: 26.82, lng: 30.80 },
  'south africa': { lat: -30.56, lng: 22.94 }, 'cape town': { lat: -33.93, lng: 18.42 },
  'johannesburg': { lat: -26.20, lng: 28.05 },
  'nigeria': { lat: 9.08, lng: 8.68 }, 'lagos': { lat: 6.45, lng: 3.40 },
  'kenya': { lat: -0.02, lng: 37.91 }, 'nairobi': { lat: -1.29, lng: 36.82 },
  'ethiopia': { lat: 9.15, lng: 40.49 }, 'addis ababa': { lat: 9.01, lng: 38.75 },
  'sudan': { lat: 15.59, lng: 32.53 }, 'somalia': { lat: 5.15, lng: 46.20 },
  'libya': { lat: 26.34, lng: 17.23 }, 'tunisia': { lat: 33.89, lng: 9.54 },
  'morocco': { lat: 31.79, lng: -7.09 }, 'algeria': { lat: 28.03, lng: 1.66 },
  'congo': { lat: -4.04, lng: 21.76 }, 'ghana': { lat: 7.95, lng: -1.02 },
  'africa': { lat: 1.65, lng: 17.78 },

  // ─── Americas ───
  'canada': { lat: 56.13, lng: -106.35 }, 'toronto': { lat: 43.65, lng: -79.38 },
  'ottawa': { lat: 45.42, lng: -75.70 }, 'vancouver': { lat: 49.28, lng: -123.12 },
  'montreal': { lat: 45.50, lng: -73.57 },
  'mexico': { lat: 23.63, lng: -102.55 }, 'mexico city': { lat: 19.43, lng: -99.13 },
  'brazil': { lat: -14.24, lng: -51.93 }, 'sao paulo': { lat: -23.55, lng: -46.63 },
  'rio de janeiro': { lat: -22.91, lng: -43.17 }, 'brasilia': { lat: -15.79, lng: -47.88 },
  'argentina': { lat: -38.42, lng: -63.62 }, 'buenos aires': { lat: -34.60, lng: -58.38 },
  'colombia': { lat: 4.57, lng: -74.30 }, 'bogota': { lat: 4.71, lng: -74.07 },
  'peru': { lat: -9.19, lng: -75.02 }, 'lima': { lat: -12.05, lng: -77.04 },
  'chile': { lat: -35.68, lng: -71.54 }, 'santiago': { lat: -33.45, lng: -70.67 },
  'venezuela': { lat: 6.42, lng: -66.59 }, 'cuba': { lat: 21.52, lng: -77.78 },
  'havana': { lat: 23.11, lng: -82.37 }, 'puerto rico': { lat: 18.22, lng: -66.59 },

  // ─── Organizations & landmarks ───
  'un': { lat: 40.75, lng: -73.97 }, 'united nations': { lat: 40.75, lng: -73.97 },
  'world bank': { lat: 38.90, lng: -77.04 }, 'imf': { lat: 38.90, lng: -77.03 },
  'world health organization': { lat: 46.23, lng: 6.13 }, 'who': { lat: 46.23, lng: 6.13 },

  // ─── Regions ───
  'middle east': { lat: 29.00, lng: 41.00 }, 'southeast asia': { lat: 5.00, lng: 115.00 },
  'central asia': { lat: 42.00, lng: 63.00 }, 'central america': { lat: 14.00, lng: -87.00 },
  'caribbean': { lat: 17.00, lng: -68.00 }, 'balkans': { lat: 42.00, lng: 21.00 },
  'nordic': { lat: 63.00, lng: 16.00 }, 'baltic': { lat: 57.00, lng: 24.00 },
  'latin america': { lat: -10.00, lng: -55.00 }, 'south america': { lat: -14.00, lng: -58.00 },
  'north america': { lat: 45.00, lng: -100.00 }, 'asia pacific': { lat: 10.00, lng: 130.00 },
}

/** Publisher HQ coordinates — used as fallback when article has no geographic subject */
const SOURCE_HQ_COORDS = {
  'cnn': { lat: 33.76, lng: -84.39 },   // Atlanta
  'fox-news': { lat: 40.76, lng: -73.99 },   // NYC
  'nbc-news': { lat: 40.76, lng: -73.98 },   // NYC 30 Rock
  'abc-news': { lat: 40.77, lng: -73.98 },   // NYC
  'cbs-news': { lat: 40.76, lng: -73.97 },   // NYC
  'the-washington-post': { lat: 38.90, lng: -77.03 },   // DC
  'politico': { lat: 38.90, lng: -77.02 },   // DC
  'npr': { lat: 38.89, lng: -77.01 },   // DC
  'usa-today': { lat: 38.85, lng: -77.07 },   // McLean VA
  'axios': { lat: 38.91, lng: -77.04 },   // DC
  'associated-press': { lat: 40.76, lng: -73.98 },   // NYC
  'bloomberg': { lat: 40.76, lng: -73.97 },   // NYC
  'business-insider': { lat: 40.74, lng: -73.99 },   // NYC
  'cnbc': { lat: 40.76, lng: -73.98 },   // NYC / Englewood Cliffs
  'the-wall-street-journal': { lat: 40.71, lng: -74.01 },  // NYC
  'techcrunch': { lat: 37.77, lng: -122.42 },  // SF
  'the-verge': { lat: 40.74, lng: -73.99 },   // NYC
  'ars-technica': { lat: 40.74, lng: -74.00 },   // NYC
  'wired': { lat: 37.77, lng: -122.40 },  // SF
  'engadget': { lat: 37.78, lng: -122.39 },  // SF
  'bbc-news': { lat: 51.52, lng: -0.14 },    // London
  'reuters': { lat: 51.51, lng: -0.11 },    // London
  'the-guardian-uk': { lat: 51.53, lng: -0.12 },    // London
  'independent': { lat: 51.50, lng: -0.12 },    // London
  'financial-times': { lat: 51.51, lng: -0.09 },    // London
  'al-jazeera-english': { lat: 25.29, lng: 51.53 },    // Doha
  'the-times-of-india': { lat: 19.08, lng: 72.88 },    // Mumbai
  'the-hindu': { lat: 13.06, lng: 80.25 },    // Chennai
  'abc-news-au': { lat: -33.88, lng: 151.20 },  // Sydney
  'nhk': { lat: 35.67, lng: 139.70 },   // Tokyo
  'le-monde': { lat: 48.84, lng: 2.33 },     // Paris
  'der-spiegel': { lat: 53.55, lng: 10.00 },    // Hamburg
  'focus': { lat: 48.14, lng: 11.58 },    // Munich
  'scmp': { lat: 22.28, lng: 114.17 },   // Hong Kong
}

const CATEGORY_KEYWORDS = {
  // Hard news
  war_conflict: [
    'war', 'military', 'troops', 'sanctions', 'conflict', 'nato', 'airstrike', 'missile',
    'invasion', 'battle', 'frontline', 'ceasefire', 'shelling',
  ],
  politics_government: [
    'election', 'vote', 'parliament', 'senate', 'congress', 'lawmakers', 'campaign',
    'government', 'prime minister', 'president', 'minister', 'cabinet', 'policy', 'bill',
    'referendum', 'coalition', 'democracy',
  ],
  crime_justice: [
    'crime', 'murder', 'shooting', 'police', 'court', 'trial', 'lawsuit', 'verdict',
    'arrested', 'charged', 'indicted', 'sentenced', 'investigation',
  ],
  environment_climate: [
    'climate', 'emissions', 'carbon', 'renewable', 'wildfire', 'hurricane', 'cyclone',
    'flood', 'drought', 'storm', 'typhoon', 'heatwave', 'earthquake', 'tsunami',
  ],
  health_medicine: [
    'covid', 'vaccine', 'virus', 'disease', 'cancer', 'hospital', 'doctor', 'patients',
    'public health', 'pandemic', 'epidemic', 'outbreak', 'medicine', 'therapy',
  ],
  science_technology: [
    'ai', 'artificial intelligence', 'machine learning', 'nasa', 'research', 'study',
    'quantum', 'robot', 'chip', 'semiconductor', 'startup', 'innovation', 'tech',
  ],
  space_astronomy: [
    'space', 'orbit', 'astronaut', 'rocket', 'launch', 'spacecraft', 'moon', 'mars',
  ],
  business_economy: [
    'gdp', 'inflation', 'recession', 'economy', 'economic', 'fiscal', 'tariff', 'trade',
  ],
  finance_markets: [
    'market', 'stock', 'stocks', 'shares', 'ipo', 'bond', 'bonds', 'crypto', 'bitcoin',
    'ethereum', 'bank', 'banks', 'merger', 'acquisition', 'deal', 'earnings', 'investor',
  ],

  // Soft news
  sports: [
    'match', 'tournament', 'league', 'championship', 'cup', 'olympics', 'goal', 'score',
    'coach', 'player', 'team', 'season',
  ],
  entertainment_celebrity: [
    'celebrity', 'hollywood', 'movie star', 'actor', 'actress', 'festival', 'oscars',
    'emmys', 'box office',
  ],
  arts_music: [
    'album', 'song', 'concert', 'tour', 'artist', 'musician', 'band', 'museum', 'gallery',
    'exhibit',
  ],
  lifestyle_culture: [
    'lifestyle', 'culture', 'trend', 'social media', 'influencer', 'festival', 'holiday',
  ],
  food_travel: [
    'restaurant', 'cuisine', 'food', 'chef', 'travel', 'tourism', 'destination', 'flight',
    'hotel', 'resort',
  ],
  fashion_beauty: [
    'fashion', 'runway', 'collection', 'designer', 'makeup', 'beauty', 'style',
  ],
  human_interest: [
    'heartwarming', 'personal story', 'profile', 'community', 'kindness', 'volunteer',
    'charity', 'nonprofit',
  ],

  // Specialty
  real_estate: [
    'real estate', 'housing market', 'home prices', 'mortgage', 'property',
  ],
  automotive: [
    'car', 'cars', 'automaker', 'ev', 'electric vehicle', 'automotive', 'truck',
  ],
  agriculture: [
    'farm', 'farmer', 'agriculture', 'crop', 'harvest', 'soy', 'corn', 'wheat',
  ],
  energy: [
    'oil', 'gas', 'energy', 'power plant', 'nuclear plant', 'grid', 'pipeline',
  ],
  religion_faith: [
    'church', 'mosque', 'temple', 'religion', 'faith', 'pope', 'vatican',
  ],
  labor_workforce: [
    'union', 'strike', 'workers', 'wage', 'labor', 'employment', 'jobless',
  ],
  immigration: [
    'immigration', 'migrant', 'migrants', 'border crossing', 'asylum', 'refugee',
  ],

  // Local & opinion
  local_politics: [
    'mayor', 'city council', 'local election', 'county', 'municipal',
  ],
  community_events: [
    'parade', 'festival', 'fair', 'community event', 'local celebration',
  ],
  weather: [
    'forecast', 'temperatures', 'rain', 'snow', 'heatwave', 'storm warning',
  ],
  traffic_transportation: [
    'traffic', 'congestion', 'highway', 'commute', 'subway', 'metro', 'train', 'bus',
  ],
  obituaries: [
    'obituary', 'dies at', 'passes away', 'funeral', 'memorial',
  ],
  editorials: [
    'editorial', 'editorial board',
  ],
  op_eds: [
    'op-ed', 'op ed', 'opinion', 'columnist',
  ],
  fact_checks: [
    'fact check', 'fact-check', 'truth-o-meter',
  ],
  investigations: [
    'investigation', 'longform', 'in-depth', 'special report',
  ],
}

const HIGH_PROMINENCE_SOURCES = [
  'associated-press', 'reuters', 'bbc-news', 'cnn', 'bloomberg',
  'the-wall-street-journal', 'the-washington-post', 'al-jazeera-english',
]

const CATEGORY_WEIGHTS = {
  war_conflict: 5,
  politics_government: 4,
  world_international: 4,
  crime_justice: 4,
  finance_markets: 4,
  business_economy: 3,
  science_technology: 3,
  health_medicine: 3,
  environment_climate: 3,
  human_interest: 3,
  sports: 2,
  entertainment_celebrity: 2,
}

function categorizeArticle(article) {
  const text = `${article.title} ${article.description || ''}`.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return cat
  }
  const apiCat = article.source?.category?.toLowerCase()
  if (apiCat === 'business') return 'finance_markets'
  if (apiCat === 'technology' || apiCat === 'science') return 'science_technology'
  if (apiCat === 'health') return 'health_medicine'
  if (apiCat === 'sports') return 'sports'
  if (apiCat === 'entertainment') return 'entertainment_celebrity'
  // Default: treat as world/international hard news
  return 'world_international'
}

function scoreImportance(article, category) {
  let score = CATEGORY_WEIGHTS[category] || 2
  const age = Date.now() - new Date(article.publishedAt).getTime()
  if (age < 60 * 60 * 1000) score += 1
  const sourceId = article.source?.id || ''
  if (HIGH_PROMINENCE_SOURCES.includes(sourceId)) score += 1
  return Math.max(1, Math.min(5, score))
}

/** Pre-sort LOCATION_DB keys by length descending so longest match wins
 *  e.g. 'new york city' matches before 'new york' before 'york' */
const _LOCATION_KEYS_SORTED = Object.keys(LOCATION_DB)
  .sort((a, b) => b.length - a.length)

function extractLocation(text) {
  const lower = text.toLowerCase()
  for (const key of _LOCATION_KEYS_SORTED) {
    if (lower.includes(key)) return LOCATION_DB[key]
  }
  return null
}

function hashToUnitFloat(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Map uint32 -> [0,1)
  return ((h >>> 0) % 1000000) / 1000000
}

function jitterCoords(coords, seed, maxDeltaDeg = 3.0) {
  const s = String(seed || '')
  const a = hashToUnitFloat(`${s}:a`) * 2 - 1
  const b = hashToUnitFloat(`${s}:b`) * 2 - 1
  const lat = Math.max(-85, Math.min(85, coords.lat + a * maxDeltaDeg))
  const lng = Math.max(-179, Math.min(179, coords.lng + b * maxDeltaDeg))
  return { lat, lng }
}

function loadGeocodeCache() {
  try {
    const data = JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || '{}')
    const now = Date.now()
    const valid = {}
    for (const [k, v] of Object.entries(data)) {
      if (now - v.ts < CACHE_TTL) valid[k] = v
    }
    return valid
  } catch {
    return {}
  }
}

function saveGeocodeCache(cache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache))
  } catch { /* quota exceeded */ }
}

function loadCachedNewsItems() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data) || data.length === 0) return null
    return data
  } catch {
    return null
  }
}

function saveNewsItemsToCache(items) {
  try {
    if (!Array.isArray(items) || items.length === 0) return
    const trimmed = items.slice(0, 600)
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

const NOMINATIM_TIMEOUT_MS = 3000

async function geocodeWithNominatim(query, cache) {
  if (cache[query]) return { lat: cache[query].lat, lng: cache[query].lng }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ATLAS-Globe/1.0' }, signal: controller.signal },
    )
    clearTimeout(timer)
    const data = await res.json()
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      cache[query] = { ...result, ts: Date.now() }
      return result
    }
  } catch {
    clearTimeout(timer)
  }
  return null
}

/**
 * Batch Nominatim lookups with staggered delays.
 * Instead of: sequential 1.1s sleep × N lookups = ~N*1.1s
 * Now: stagger launches 120ms apart, total ≈ max(response time) + 120ms*N
 * Nominatim rate limit is 1 req/s, but with stagger this stays under limit.
 */
async function batchGeocodeNominatim(queries, cache) {
  const results = new Map()
  const uncached = queries.filter((q) => {
    if (cache[q]) {
      results.set(q, { lat: cache[q].lat, lng: cache[q].lng })
      return false
    }
    return true
  })

  if (uncached.length === 0) return results

  const STAGGER_MS = 120
  const promises = uncached.map((query, i) =>
    new Promise((resolve) => setTimeout(resolve, i * STAGGER_MS))
      .then(() => geocodeWithNominatim(query, cache))
      .then((coords) => { if (coords) results.set(query, coords) }),
  )

  await Promise.allSettled(promises)
  saveGeocodeCache(cache)
  return results
}


/** Build sourceId -> country from catalog (covers all 120+ sources, not just hardcoded) */
function buildSourceCountryMap(catalog) {
  const map = { ...SOURCE_TO_COUNTRY }
  if (catalog && Array.isArray(catalog)) {
    for (const s of catalog) {
      if (s.id && s.country) map[s.id] = String(s.country).toLowerCase()
    }
  }
  return map
}

async function processArticles(articles, sourceCatalog, { maxItems = 300, maxNominatimLookups = 10 } = {}) {
  const geocodeCache = loadGeocodeCache()
  const sourceCountryMap = buildSourceCountryMap(sourceCatalog)
  const seenUrls = new Set()

  // First pass: resolve local locations, collect Nominatim candidates
  const processed = []
  const nominatimCandidates = [] // { index, query }

  for (const article of articles) {
    if (processed.length >= maxItems) break
    if (!article.url || seenUrls.has(article.url)) continue
    seenUrls.add(article.url)

    const text = `${article.title} ${article.description || ''}`
    let coords = extractLocation(text)
    let fromCountryFallback = false

    if (!coords) {
      // Step 2: Publisher HQ (exact office, not generic country)
      const srcId = article.source?.id
      if (srcId && SOURCE_HQ_COORDS[srcId]) {
        coords = SOURCE_HQ_COORDS[srcId]
        fromCountryFallback = true  // still jitter slightly so HQ articles don't stack
      }
    }

    if (!coords) {
      // Step 3: Country-centre fallback
      let countryCode = (article.source?.id && sourceCountryMap[article.source.id]) ||
        (article.source?.country && String(article.source.country).toLowerCase())
      if (countryCode && countryCode.includes(',')) {
        countryCode = countryCode.split(',')[0].trim()
      }
      if (countryCode && COUNTRY_COORDS[countryCode]) {
        coords = COUNTRY_COORDS[countryCode]
        fromCountryFallback = true
      }
    }

    // Mark for Nominatim batch if still no coords
    let needsNominatim = false
    if (!coords && nominatimCandidates.length < maxNominatimLookups) {
      const query = article.title?.split(' - ')[0] || ''
      if (query.trim().length > 2) {
        nominatimCandidates.push({ index: processed.length, query: query.trim() })
        needsNominatim = true
      }
    }

    processed.push({ article, coords, fromCountryFallback, needsNominatim })
  }

  // Batch Nominatim lookups (staggered, non-blocking)
  if (nominatimCandidates.length > 0) {
    const queries = nominatimCandidates.map((c) => c.query)
    const geocodeResults = await batchGeocodeNominatim(queries, geocodeCache)
    for (const { index, query } of nominatimCandidates) {
      const coords = geocodeResults.get(query)
      if (coords) {
        processed[index].coords = coords
        processed[index].fromCountryFallback = false
      }
    }
  }

  // Final pass: build items with resolved coords
  const items = []
  const locationCounts = {}

  for (let i = 0; i < processed.length; i++) {
    const entry = processed[i]
    const { article } = entry
    let coords = entry.coords

    // Hash-based fallback for articles still without coords
    if (!coords) {
      const countryKeys = Object.keys(COUNTRY_COORDS)
      const idx = Math.floor(hashToUnitFloat(article.url || article.title) * countryKeys.length)
      const fallbackCountry = countryKeys[idx] || 'us'
      coords = jitterCoords(COUNTRY_COORDS[fallbackCountry], article.url, 2.5)
    } else if (entry.fromCountryFallback) {
      coords = jitterCoords(coords, article.url)
    }

    const category = categorizeArticle(article)
    const importance = scoreImportance(article, category)

    const locKey = `${coords.lat.toFixed(1)},${coords.lng.toFixed(1)}`
    locationCounts[locKey] = (locationCounts[locKey] || 0) + 1

    let normalizedUrl = article.url
    if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl.replace(/^\/+/, '')}`
    }

    items.push({
      id: article.url || `${Date.now()}-${items.length}`,
      title: article.title,
      url: normalizedUrl,
      lat: coords.lat,
      lng: coords.lng,
      category,
      importance,
      magnitude: locationCounts[locKey],
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt,
      description: article.description,
    })
  }

  // De-cluster: spread articles that share the same rounded location
  deCluster(items)

  return items
}

/**
 * Spread co-located markers in a golden-angle spiral so they don't overlap.
 * Groups items by rounded lat/lng, then repositions each group member
 * along an outward spiral from the group centre.
 */
function deCluster(items, radiusDeg = 2.0) {
  const groups = {}
  for (const item of items) {
    const key = `${item.lat.toFixed(1)},${item.lng.toFixed(1)}`
      ; (groups[key] ??= []).push(item)
  }
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ~2.3998 rad
  for (const members of Object.values(groups)) {
    if (members.length < 2) continue
    const cLat = members[0].lat
    const cLng = members[0].lng
    for (let i = 0; i < members.length; i++) {
      const r = radiusDeg * Math.sqrt((i + 1) / members.length)
      const theta = i * GOLDEN_ANGLE
      members[i].lat = Math.max(-85, Math.min(85, cLat + r * Math.cos(theta)))
      members[i].lng = Math.max(-179, Math.min(179, cLng + r * Math.sin(theta)))
    }
  }
}

export function useNewsData() {
  const selectedSources = useAtlasStore((s) => s.selectedSources)
  const sourceCatalog = useAtlasStore((s) => s.sourceCatalog)
  const setNewsItems = useAtlasStore((s) => s.setNewsItems)
  const setIsLoading = useAtlasStore((s) => s.setIsLoading)
  const setManualRefreshUsedToday = useAtlasStore((s) => s.setManualRefreshUsedToday)
  const setTriggerManualRefresh = useAtlasStore((s) => s.setTriggerManualRefresh)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)

  useEffect(() => {
    if (!hasCompletedOnboarding) return

    const today = getTodayLocal()
    const lastAuto = localStorage.getItem(LAST_AUTO_REFRESH_DATE_KEY)
    const lastManual = localStorage.getItem(MANUAL_REFRESH_DATE_KEY)
    setManualRefreshUsedToday(lastManual === today)

    async function fetchNews() {
      const providers = getAvailableProviders()
      if (providers.length === 0 || selectedSources.length === 0) {
        const cached = loadCachedNewsItems()
        if (cached && cached.length > 0) {
          setNewsItems(cached)
        } else {
          setNewsItems(MOCK_NEWS)
        }
        return
      }

      setIsLoading(true)

      try {
        let catalog = sourceCatalog
        if (catalog.length === 0) {
          const newsApiKey = import.meta.env.VITE_NEWS_API_KEY || providers.find((p) => p.id === 'newsapi')?.getKeys()?.[0]
          catalog = await fetchAllSources(newsApiKey)
          useAtlasStore.getState().setSourceCatalog(catalog)
        }

        const { articles: allArticles } = await fetchFromProviders({
          selectedSources,
          catalog,
          targetArticles: 400,
          newsApiPages: 2,
          broaden: true,
        })

        if (allArticles.length === 0) {
          const cached = loadCachedNewsItems()
          if (cached && cached.length > 0) {
            setNewsItems(cached)
          } else {
            setNewsItems(MOCK_NEWS)
          }
          return
        }

        let items = await processArticles(allArticles, catalog, { maxItems: 500, maxNominatimLookups: 18 })

        if (items.length < MIN_GLOBE_POINTS) {
          const { articles: moreArticles } = await fetchFromProviders({
            selectedSources,
            catalog,
            targetArticles: 500,
            newsApiPages: 2,
            broaden: true,
          })

          if (moreArticles.length > 0) {
            const byUrl = new Map()
            for (const a of allArticles) if (a?.url) byUrl.set(a.url, a)
            for (const a of moreArticles) if (a?.url) byUrl.set(a.url, a)
            const merged = Array.from(byUrl.values())
            items = await processArticles(merged, catalog, { maxItems: 500, maxNominatimLookups: 12 })
          }
        }

        if (items.length > 0 && items.length < MIN_GLOBE_POINTS) {
          const needed = MIN_GLOBE_POINTS - items.length
          const supplement = MOCK_NEWS.slice(0, needed).map((m, i) => ({
            ...m,
            id: `supplement-${i}-${Date.now()}`,
          }))
          items = [...items, ...supplement]
        }

        if (items.length > 0) {
          saveNewsItemsToCache(items)
          setNewsItems(items)
        } else {
          const cached = loadCachedNewsItems()
          if (cached && cached.length > 0) {
            setNewsItems(cached)
          } else {
            setNewsItems(MOCK_NEWS)
          }
        }
      } catch {
        const cached = loadCachedNewsItems()
        if (cached && cached.length > 0) {
          setNewsItems(cached)
        } else {
          setNewsItems(MOCK_NEWS)
        }
      } finally {
        setIsLoading(false)
      }
    }

    // Daily auto: run once per day on first load
    if (lastAuto !== today) {
      fetchNews().then(() => {
        try {
          localStorage.setItem(LAST_AUTO_REFRESH_DATE_KEY, today)
        } catch { /* quota */ }
      })
    } else {
      const cached = loadCachedNewsItems()
      if (cached && cached.length > 0) {
        setNewsItems(cached)
      } else {
        setNewsItems(MOCK_NEWS)
      }
    }

    function doManualRefresh() {
      const nowToday = getTodayLocal()
      if (localStorage.getItem(MANUAL_REFRESH_DATE_KEY) === nowToday) return
      setIsLoading(true)
      fetchNews().then(() => {
        try {
          localStorage.setItem(MANUAL_REFRESH_DATE_KEY, nowToday)
          setManualRefreshUsedToday(true)
        } catch { /* quota */ }
      })
    }

    setTriggerManualRefresh(doManualRefresh)

    return () => setTriggerManualRefresh(null)
  }, [hasCompletedOnboarding, selectedSources, sourceCatalog, setNewsItems, setIsLoading, setManualRefreshUsedToday, setTriggerManualRefresh])
}
