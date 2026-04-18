/**
 * Small force-directed graph renderer for the GKG entity panel.
 *
 * Data in: `{ nodes: Array<{id, group, weight, label}>, links: Array<{source, target, value}> }`
 *
 * Implementation notes:
 *   - Uses `d3-force` for simulation only (no d3 DOM helpers) so we keep React
 *     in charge of the SVG. This avoids React/D3 ownership conflicts that
 *     plague the classic "d3 mutates DOM" pattern.
 *   - Simulation stops (alphaTarget = 0) after the graph settles so idle CPU
 *     is zero. Pointer drags re-heat it on demand.
 *   - Node radius is scaled from weight; label opacity hides small labels to
 *     avoid clutter at low weights.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force'

const GROUP_STYLES = {
  theme: { fill: '#EF9F27', stroke: '#f8c36b' },
  person: { fill: '#7F77DD', stroke: '#a7a2ea' },
  organization: { fill: '#1D9E75', stroke: '#61c3a1' },
  location: { fill: '#378ADD', stroke: '#75b0e7' },
  default: { fill: '#888780', stroke: '#bab8b0' },
}

function nodeRadius(weight, maxWeight) {
  const t = maxWeight > 0 ? weight / maxWeight : 0
  return 4 + Math.sqrt(Math.max(0, t)) * 14
}

export default function ForceNetworkGraph({ nodes, links, width = 400, height = 360, onNodeClick }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const [tick, setTick] = useState(0)
  const [hovered, setHovered] = useState(null)
  const [drag, setDrag] = useState(null)

  const { simNodes, simLinks, maxWeight } = useMemo(() => {
    const nodesCopy = (nodes || []).map((n) => ({ ...n }))
    const idSet = new Set(nodesCopy.map((n) => n.id))
    const linksCopy = (links || [])
      .filter((l) => idSet.has(l.source) && idSet.has(l.target))
      .map((l) => ({ ...l }))
    const mw = nodesCopy.reduce((acc, n) => Math.max(acc, n.weight || 0), 0)
    return { simNodes: nodesCopy, simLinks: linksCopy, maxWeight: mw }
  }, [nodes, links])

  useEffect(() => {
    if (!simNodes.length) return

    if (simRef.current) simRef.current.stop()

    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d) => d.id).distance((l) => 60 + (1 - Math.min(1, l.value || 0)) * 40).strength(0.25))
      .force('charge', forceManyBody().strength(-140))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide().radius((d) => nodeRadius(d.weight || 0, maxWeight) + 2))
      .force('x', forceX(width / 2).strength(0.04))
      .force('y', forceY(height / 2).strength(0.04))

    let raf = 0
    sim.on('tick', () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          setTick((t) => t + 1)
        })
      }
    })
    sim.alpha(1).restart()
    simRef.current = sim

    return () => {
      sim.stop()
      if (raf) cancelAnimationFrame(raf)
      simRef.current = null
    }
  }, [simNodes, simLinks, width, height, maxWeight])

  // Pointer-driven drag to let users pull nodes around
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    function pointToCoords(evt) {
      const rect = svg.getBoundingClientRect()
      return {
        x: ((evt.clientX - rect.left) / rect.width) * width,
        y: ((evt.clientY - rect.top) / rect.height) * height,
      }
    }

    function onMove(evt) {
      if (!drag) return
      const p = pointToCoords(evt)
      drag.fx = p.x
      drag.fy = p.y
      simRef.current?.alphaTarget(0.15).restart()
    }
    function onUp() {
      if (drag) {
        drag.fx = null
        drag.fy = null
      }
      simRef.current?.alphaTarget(0)
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, width, height])

  if (!simNodes.length) {
    return <p className="text-[11px] text-white/35">No entity data.</p>
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ touchAction: 'none', userSelect: 'none' }}
      role="img"
      aria-label="GDELT entity network graph"
    >
      <g stroke="rgba(255,255,255,0.12)" strokeWidth={1}>
        {simLinks.map((l, i) => {
          const sx = l.source.x, sy = l.source.y, tx = l.target.x, ty = l.target.y
          if (sx == null || tx == null) return null
          const weightOpacity = Math.max(0.12, Math.min(0.55, (l.value || 0.2)))
          return (
            <line
              key={i}
              x1={sx}
              y1={sy}
              x2={tx}
              y2={ty}
              stroke={`rgba(180,200,255,${weightOpacity})`}
            />
          )
        })}
      </g>
      <g>
        {simNodes.map((n) => {
          const style = GROUP_STYLES[n.group] || GROUP_STYLES.default
          const r = nodeRadius(n.weight || 0, maxWeight)
          const isHovered = hovered === n.id
          const labelOpacity = (r > 7 ? 0.85 : 0) + (isHovered ? 0.15 : 0)
          return (
            <g
              key={n.id}
              transform={`translate(${n.x || 0}, ${n.y || 0})`}
              onPointerDown={(e) => {
                e.preventDefault()
                e.currentTarget.setPointerCapture?.(e.pointerId)
                n.fx = n.x
                n.fy = n.y
                setDrag(n)
              }}
              onPointerEnter={() => setHovered(n.id)}
              onPointerLeave={() => setHovered((v) => (v === n.id ? null : v))}
              onClick={() => onNodeClick?.(n)}
              style={{ cursor: onNodeClick ? 'pointer' : 'grab' }}
            >
              <circle
                r={r}
                fill={style.fill}
                stroke={isHovered ? '#ffffff' : style.stroke}
                strokeWidth={isHovered ? 1.6 : 1}
                opacity={0.92}
              />
              {labelOpacity > 0 && (
                <text
                  x={0}
                  y={r + 10}
                  textAnchor="middle"
                  fill={`rgba(235,240,255,${labelOpacity})`}
                  fontSize={Math.max(9, Math.min(12, r * 0.75))}
                  fontFamily="var(--font-data, monospace)"
                  style={{ pointerEvents: 'none' }}
                >
                  {n.label}
                </text>
              )}
            </g>
          )
        })}
      </g>
      <g transform={`translate(10, ${height - 10})`} style={{ pointerEvents: 'none' }}>
        <text fill="rgba(255,255,255,0.25)" fontSize={9} fontFamily="var(--font-data, monospace)">
          {simNodes.length} nodes · {simLinks.length} links · drag to arrange
        </text>
      </g>
    </svg>
  )
}
