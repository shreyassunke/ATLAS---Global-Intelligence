/**
 * useGdeltGeoOverlay — shared polling hook for the GDELT GEO heatmap +
 * country choropleth overlays used by all three globe backends (Google
 * Map3D, globe.gl, Leaflet).
 *
 * Returns `{ heatmapPoints, choroplethRows, toneRange, loading, error }`.
 * The hook is a no-op when both `dataLayers.gdeltHeatmap` and
 * `dataLayers.gdeltChoropleth` are off.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import {
  buildGdeltGeoQueryFromDimensions,
  choroplethToneRange,
  fetchGdeltGeoOverlaySequential,
  geoTimespanFromTimeFilter,
} from '../services/gdelt/geoService'

const REFRESH_MS = 15 * 60 * 1000

export default function useGdeltGeoOverlay() {
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const dataLayers = useAtlasStore((s) => s.dataLayers)

  const heatOn = dataLayers?.gdeltHeatmap !== false
  const choroOn = dataLayers?.gdeltChoropleth === true
  const anyOn = heatOn || choroOn

  const [heatmapPoints, setHeatmapPoints] = useState([])
  const [choroplethRows, setChoroplethRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  const query = useMemo(
    () => buildGdeltGeoQueryFromDimensions(activeDimensions),
    [activeDimensions],
  )
  const timespan = useMemo(() => geoTimespanFromTimeFilter(timeFilter), [timeFilter])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!heatOn) setHeatmapPoints([])
    if (!choroOn) setChoroplethRows([])
  }, [heatOn, choroOn])

  useEffect(() => {
    if (!anyOn) {
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    abortRef.current?.abort?.()
    abortRef.current = controller

    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchGdeltGeoOverlaySequential({
          query,
          timespan,
          wantHeatmap: heatOn,
          wantPolygons: choroOn,
          signal: controller.signal,
        })
        if (cancelled || !mountedRef.current) return
        if (heatOn) setHeatmapPoints(res.heatmapPoints)
        if (choroOn) setChoroplethRows(res.choroplethRows)
        if (res.errors.length) setError(res.errors.join(' · '))
      } catch (e) {
        if (!cancelled && mountedRef.current) setError(String(e?.message || e))
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    run()
    clearInterval(timerRef.current)
    timerRef.current = setInterval(run, REFRESH_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timerRef.current)
    }
  }, [anyOn, heatOn, choroOn, query, timespan])

  const toneRange = useMemo(() => choroplethToneRange(choroplethRows), [choroplethRows])

  return { heatmapPoints, choroplethRows, toneRange, loading, error }
}
