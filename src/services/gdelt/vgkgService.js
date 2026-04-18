/**
 * GDELT 2.0 — Visual Global Knowledge Graph (VGKG) service.
 *
 * Two integration surfaces:
 *
 *   - Live: poll GDELT's 15-minute VGKG feed, decompress it, parse the first N
 *     rows, and emit normalised `{ imageUrl, labels, country, ... }` records so
 *     the worker can geolocate them onto the globe.
 *   - Historical: the `visualGkgLabels` BigQuery template covers the full
 *     dataset (used by `VgkgImageryPanel`); this module does not duplicate it.
 *
 * The feed URL/schema have shifted over GDELT's history. We try a small set of
 * known-good paths (`lastupdate-gvkg.txt` → `lastupdate-translation.txt`
 * → plain `lastupdate.txt`) and fail gracefully on misses. A missing feed
 * returns `[]` rather than throwing so the worker's SOURCE_ERROR state stays
 * quiet during GDELT maintenance windows.
 */

import { unzipSync, strFromU8 } from 'fflate'

/** Allowlist of candidate index files GDELT has used for the VGKG stream. */
const VGKG_INDEX_CANDIDATES = [
  'http://data.gdeltproject.org/gdeltv2/lastupdate-gvkg.txt',
  'http://data.gdeltproject.org/gdeltv2/lastupdate-translation.txt',
  'http://data.gdeltproject.org/gdeltv2/lastupdate.txt',
]

/** Strict allowlist — anything else is an SSRF risk. */
const VGKG_ZIP_RE = /^https?:\/\/data\.gdeltproject\.org\/(gdeltv2|gdeltv2_[a-z]+)\/\d{14}\.[a-zA-Z0-9._-]+\.zip$/

/** 128 MB ceiling (typical GVKG 15-min files are 10-40 MB). */
const MAX_ZIP_BYTES = 128 * 1024 * 1024

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i
const HTTP_RE = /^https?:\/\//i
const LABEL_TOKEN_RE = /^([A-Za-z][A-Za-z0-9_ \-/]{1,60})[,:;](-?\d+(?:\.\d+)?)$/

async function resolveVgkgZipUrl() {
  for (const idx of VGKG_INDEX_CANDIDATES) {
    try {
      const res = await fetch(idx, {
        signal: AbortSignal.timeout(20_000),
        redirect: 'manual',
      })
      if (!res.ok || res.status >= 300) continue
      const text = await res.text()
      const lines = text.trim().split('\n')
      // Prefer a line that looks visual/image-ish (gvkg, vgkg), otherwise the
      // last zipped CSV on the page.
      const preferred = lines.find((l) => /gvkg|vgkg|image/i.test(l) && /\.zip$/i.test(l))
      const line = preferred || lines.find((l) => /\.zip\b/i.test(l))
      if (!line) continue
      const parts = line.trim().split(/\s+/)
      const url = parts[parts.length - 1]
      if (url && VGKG_ZIP_RE.test(url)) return url
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * Heuristic row parser. GDELT has shifted VGKG column positions across
 * versions; we scan each TSV row for the first HTTP URL (page identifier),
 * the first image-like URL, and label tokens of the form
 * `Label,confidence` or `Label;confidence`.
 */
function parseVgkgRow(line) {
  if (!line) return null
  const cells = line.split('\t')
  if (cells.length < 4) return null

  let pageUrl = ''
  let imageUrl = ''
  let countryIso = ''
  let date = ''
  let sourceName = ''
  const labels = []
  const webEntities = []

  for (const raw of cells) {
    const cell = (raw || '').trim()
    if (!cell) continue

    if (!date && /^\d{12,14}$/.test(cell)) {
      date = cell
      continue
    }

    if (HTTP_RE.test(cell)) {
      if (!imageUrl && IMAGE_EXT_RE.test(cell)) {
        imageUrl = cell
        continue
      }
      if (!pageUrl) {
        pageUrl = cell
        continue
      }
      continue
    }

    if (!countryIso) {
      const m = cell.match(/(?:^|[;#])([A-Z]{2,3})(?:$|[;#])/)
      if (m) countryIso = m[1]
    }

    if (/[,;]/.test(cell)) {
      for (const token of cell.split(';')) {
        const match = token.trim().match(LABEL_TOKEN_RE)
        if (!match) continue
        const label = match[1].trim()
        const confidence = Number(match[2])
        if (!label || !Number.isFinite(confidence)) continue
        if (labels.length < 12) labels.push({ label, confidence })
      }
    }

    if (!sourceName && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cell)) {
      sourceName = cell
    }
  }

  if (!imageUrl && !labels.length) return null

  return {
    id: `${date || ''}|${pageUrl || imageUrl || cells[0] || ''}`.slice(0, 160),
    date,
    pageUrl,
    imageUrl,
    sourceName,
    countryIso,
    labels,
    webEntities,
  }
}

/**
 * Fetch + decompress the latest VGKG sample. Returns at most `limit` rows,
 * never throws. `[]` signals "nothing new" — the worker handles that
 * gracefully.
 */
export async function fetchVgkgImagerySample({ limit = 60 } = {}) {
  try {
    const zipUrl = await resolveVgkgZipUrl()
    if (!zipUrl) return []

    try {
      const head = await fetch(zipUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(15_000),
        redirect: 'manual',
      })
      if (head.ok) {
        const len = parseInt(head.headers.get('content-length') || '0', 10)
        if (len && len > MAX_ZIP_BYTES) return []
      }
    } catch {
      /* advisory */
    }

    const body = await fetch(zipUrl, {
      signal: AbortSignal.timeout(90_000),
      redirect: 'manual',
    })
    if (!body.ok || body.status >= 300) return []

    const buf = new Uint8Array(await body.arrayBuffer())
    if (buf.byteLength > MAX_ZIP_BYTES) return []

    const files = unzipSync(buf)
    const entryName = Object.keys(files).find((k) => /\.csv$/i.test(k))
    if (!entryName) return []

    const text = strFromU8(files[entryName])
    const lines = text.split(/\n/)
    const out = []
    const start = /GKGRECORDID|DATE/i.test(lines[0] || '') ? 1 : 0
    for (let i = start; i < lines.length && out.length < limit; i++) {
      const row = parseVgkgRow(lines[i])
      if (row) out.push(row)
    }
    return out
  } catch (err) {
    console.warn('[VGKG] sample fetch skipped:', err?.message || err)
    return []
  }
}
