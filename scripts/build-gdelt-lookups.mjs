#!/usr/bin/env node
/**
 * Build-time fetch of GDELT's canonical lookup tables so we can ship them as
 * static JSON in the bundle (no runtime API round-trips, no CORS issues).
 *
 *   - `LOOKUP-GKGTHEMES.TXT`   → `src/config/gkgThemes.json`
 *   - `LOOKUP-GCAM.TXT`        → `src/config/gcamEmotions.json`
 *
 * Files are small (<1 MB combined) and update rarely. Re-run via
 * `npm run prebuild:gdelt-lookups` (invoked automatically by `npm run build`).
 *
 * Network failures are non-fatal: if either lookup can't be fetched we keep
 * any existing JSON on disk and log a warning so the build still succeeds.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = resolve(__dirname, '..', 'src', 'config')

const THEMES_URL = 'http://data.gdeltproject.org/api/v2/guides/LOOKUP-GKGTHEMES.TXT'
const GCAM_URL = 'http://data.gdeltproject.org/api/v2/guides/LOOKUP-GCAM.TXT'

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.text()
}

/**
 * GKG themes are simple tab-separated `THEME\tcount` lines. We keep the
 * themes sorted by count desc (GDELT already ships them that way) and drop
 * the count so the static file is small. Limit to the top 4,000 themes —
 * that's ≈15 kB gzipped and still covers any query a user will type.
 */
function parseThemes(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [theme, countStr] = line.split(/\t|\s+/, 2)
      if (!theme) return null
      const count = Number(countStr)
      return { theme: theme.trim(), count: Number.isFinite(count) ? count : 0 }
    })
    .filter((r) => r && r.theme && /^[A-Z0-9_]+$/.test(r.theme))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4000)
}

/**
 * GCAM lookup is `dimension\tdictionary\tvalenceType\tdescription`, e.g.
 * `v19.1\tHEDONOMETER\tv\tHappiness`. We bundle only the `v*` dimensions
 * with a non-empty description — that's the radar-chart-ready subset.
 */
function parseGcam(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const cells = line.split('\t')
    if (cells.length < 4) continue
    const [code, dictionary, type, description] = cells.map((c) => c.trim())
    if (!code || !/^v\d/i.test(code)) continue
    if (!description) continue
    rows.push({ code, dictionary, type, description })
  }
  return rows
}

async function build() {
  ensureDir()

  let themeCount = 0
  let emotionCount = 0

  try {
    const themesText = await fetchText(THEMES_URL)
    const themes = parseThemes(themesText)
    themeCount = themes.length
    writeFileSync(
      resolve(CONFIG_DIR, 'gkgThemes.json'),
      JSON.stringify(themes, null, 0) + '\n',
      'utf8',
    )
  } catch (err) {
    console.warn(`[build-gdelt-lookups] themes failed: ${err.message}`)
    // Write an empty fallback only if nothing exists yet so runtime import doesn't crash.
    const out = resolve(CONFIG_DIR, 'gkgThemes.json')
    if (!existsSync(out)) writeFileSync(out, '[]\n', 'utf8')
  }

  try {
    const gcamText = await fetchText(GCAM_URL)
    const emotions = parseGcam(gcamText)
    emotionCount = emotions.length
    writeFileSync(
      resolve(CONFIG_DIR, 'gcamEmotions.json'),
      JSON.stringify(emotions, null, 0) + '\n',
      'utf8',
    )
  } catch (err) {
    console.warn(`[build-gdelt-lookups] gcam failed: ${err.message}`)
    const out = resolve(CONFIG_DIR, 'gcamEmotions.json')
    if (!existsSync(out)) writeFileSync(out, '[]\n', 'utf8')
  }

  console.log(`[build-gdelt-lookups] themes=${themeCount} emotions=${emotionCount}`)
}

build().catch((err) => {
  console.error('[build-gdelt-lookups] fatal:', err)
  process.exit(0) // never block build on network hiccups
})
