/**
 * Ambient loop tracks (after the opening intro). Files live in `public/audio/`.
 *
 * The Hans Zimmer track is served as `time-hans-zimmer.mp3` (URL-safe). A copy can be
 * maintained next to the original long filename from your library — see `public/audio/README.md`.
 */
export const BGM_AMBIENT_TRACKS = [
  {
    id: 'space-ambient',
    label: 'Space ambient',
    url: '/audio/space-ambient.mp3',
  },
  {
    id: 'time-hans-zimmer',
    label: 'Time (Hans Zimmer)',
    url: '/audio/time-hans-zimmer.mp3',
  },
  {
    id: 'intro',
    label: 'Intro',
    url: '/audio/intro.mp3',
  },
]

const STORAGE_KEY = 'atlas_bgm_ambient_id'

export function getBgmTrackById(id) {
  return BGM_AMBIENT_TRACKS.find((t) => t.id === id) || BGM_AMBIENT_TRACKS[0]
}

export function loadPersistedBgmTrackId() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && BGM_AMBIENT_TRACKS.some((t) => t.id === raw)) return raw
  } catch {
    /* ignore */
  }
  return BGM_AMBIENT_TRACKS[0].id
}

export function persistBgmTrackId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
