/**
 * Build ne_110m_continents.geojson by dissolving ne_110m_admin_0_countries
 * on the CONTINENT property (Natural Earth).
 *
 * Run from atlas/: node scripts/build-continent-geojson.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import union from '@turf/union'
import { featureCollection } from '@turf/helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcPath = path.join(root, 'public/geo/ne_110m_admin_0_countries.geojson')
const outPath = path.join(root, 'public/geo/ne_110m_continents.geojson')

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'))
const feats = raw.features || []

/** @type {Map<string, import('geojson').Feature[]>} */
const byContinent = new Map()
for (const f of feats) {
  const c = f.properties?.CONTINENT || f.properties?.continent || 'Unknown'
  const key = String(c)
  if (!byContinent.has(key)) byContinent.set(key, [])
  byContinent.get(key).push(f)
}

const outFeatures = []
for (const [continent, list] of byContinent) {
  if (list.length === 0) continue
  try {
    if (list.length === 1) {
      outFeatures.push({
        ...list[0],
        properties: {
          ...list[0].properties,
          NAME: continent,
          LAYER: 'continent',
        },
      })
    } else {
      const u = union(featureCollection(list), {
        properties: { NAME: continent, CONTINENT: continent, LAYER: 'continent' },
      })
      if (u) outFeatures.push(u)
    }
  } catch (e) {
    console.warn(`Union failed for ${continent}, using first polygon only:`, e?.message || e)
    outFeatures.push({
      ...list[0],
      properties: {
        ...list[0].properties,
        NAME: continent,
        LAYER: 'continent',
      },
    })
  }
}

const fc = {
  type: 'FeatureCollection',
  name: 'ne_110m_continents',
  features: outFeatures,
}
fs.writeFileSync(outPath, JSON.stringify(fc))
console.log(`Wrote ${outFeatures.length} continent features to ${path.relative(root, outPath)}`)
