/**
 * Landing page globe markers — same copy as the former feature cards and use-case tabs.
 * `category` drives marker color via `getCategoryColor` (news schema keys).
 */
export const LANDING_GLOBE_MARKERS = [
  {
    id: 'feat-realtime',
    kind: 'feature',
    lat: 51.5074,
    lng: -0.1278,
    category: 'science_technology',
    title: 'Real-time tracking',
    body: 'Monitor global events and news as they surface on the globe with low-latency updates.',
  },
  {
    id: 'feat-encrypted',
    kind: 'feature',
    lat: 47.3769,
    lng: 8.5417,
    category: 'environment_climate',
    title: 'Encrypted uplink',
    body: 'Your session and provider keys stay on your device — connect sources securely through ATLAS.',
  },
  {
    id: 'feat-api',
    kind: 'feature',
    lat: 1.3521,
    lng: 103.8198,
    category: 'arts_music',
    title: 'Global API',
    body: 'Wire in news APIs and feeds you control; ATLAS visualizes what you choose to ingest.',
  },
  {
    id: 'uc-journalists',
    kind: 'use_case',
    lat: 40.7128,
    lng: -74.006,
    category: 'investigations',
    title: 'Journalists',
    body:
      'Cross-check breaking stories against geography and feed provenance so you can move fast without losing context. ATLAS keeps your workspace in one place — globe, sources, and alerts.',
    stat: 'Monitor 40+ live feeds across 6 continents',
  },
  {
    id: 'uc-researchers',
    kind: 'use_case',
    lat: 52.2053,
    lng: 0.1218,
    category: 'science_technology',
    title: 'Researchers',
    body:
      'Trace how narratives spread across regions and compare outlets side by side. Export-friendly flows and stable uplinks mean your pipeline stays reproducible.',
    stat: 'Correlate thousands of headlines to map-level markers',
  },
  {
    id: 'uc-security',
    kind: 'use_case',
    lat: 38.9072,
    lng: -77.0369,
    category: 'crime_justice',
    title: 'Security Teams',
    body:
      'Surface open-source chatter and news spikes before they hit internal queues. Geography-first visualization helps triage what matters for your perimeter.',
    stat: 'Sub-minute refresh on enabled data feeds',
  },
]
