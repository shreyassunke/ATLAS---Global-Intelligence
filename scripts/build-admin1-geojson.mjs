/**
 * Fetch Natural Earth 50m admin-1 (worldwide states/provinces) and write GeoJSON for FlatMap.
 *
 * NE 110m admin-1 includes only the United States; 50m includes global admin-1 polygons so
 * zoom-level graph coloring works outside the US.
 *
 * Run from atlas/: npm run build:admin1
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import shp from 'shpjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'public/geo/ne_50m_admin_1_states_provinces.geojson')

const ADM1_ZIP =
  'https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_1_states_provinces.zip'

const buf = await fetch(ADM1_ZIP).then((r) => {
  if (!r.ok) throw new Error(`Download failed: ${r.status} ${ADM1_ZIP}`)
  return r.arrayBuffer()
})

const geojson = await shp(buf)
if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
  throw new Error('shpjs did not return a FeatureCollection')
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(geojson))
console.log(
  `Wrote ${geojson.features.length} admin-1 features to ${path.relative(root, outPath)}`,
)
