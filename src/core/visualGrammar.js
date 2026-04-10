import { PRIORITIES, DIMENSION_COLORS, DIMENSION_KEYS, DIMENSION_ICONS, SEVERITY_SIZES, CORROBORATION_OPACITY, getRecencyState } from './eventSchema.js'

const SPRITE_SIZE = 64
const HALF = SPRITE_SIZE / 2

function drawCircle(ctx, color) {
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF - 4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawColorblindPattern(ctx, priority) {
  ctx.save()
  ctx.globalAlpha = 0.4
  if (priority === PRIORITIES.P3) {
    for (let y = 0; y < SPRITE_SIZE; y += 4) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(SPRITE_SIZE, y)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  } else if (priority === PRIORITIES.P2) {
    for (let i = -SPRITE_SIZE; i < SPRITE_SIZE * 2; i += 5) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i + SPRITE_SIZE, SPRITE_SIZE)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.restore()
}

const spriteCache = new Map()

export function generateSprite(priority, dimension, size = SPRITE_SIZE, colorblind = false) {
  const key = `${priority}_${dimension}_${size}_${colorblind ? 'cb' : 'n'}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  
  // Color encodes DIMENSION
  let color = DIMENSION_COLORS[dimension] || '#ffffff'

  const scale = size / SPRITE_SIZE
  ctx.save()
  ctx.scale(scale, scale)

  // All events are circles
  drawCircle(ctx, color)

  if (colorblind) {
    drawColorblindPattern(ctx, priority)
  }

  // Draw dimension icon text
  const icon = DIMENSION_ICONS[dimension]
  if (icon && size >= 16) {
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.floor(SPRITE_SIZE * 0.45)}px sans-serif`
    ctx.fillText(icon, HALF, HALF)
  }

  ctx.restore()
  spriteCache.set(key, canvas)
  return canvas
}

export function generateSpriteAtlas() {
  const priorities = Object.values(PRIORITIES)
  const dimensions = DIMENSION_KEYS
  const atlas = {}

  for (const priority of priorities) {
    for (const dimension of dimensions) {
      const canvas = generateSprite(priority, dimension, SPRITE_SIZE)
      const key = `${priority}_${dimension}`
      atlas[key] = canvas
    }
  }

  return atlas
}

export function getSeveritySize(severity) {
  return SEVERITY_SIZES[severity] || SEVERITY_SIZES[1]
}

export function getOpacity(corroborationCount, authoritative) {
  const count = Math.min(Math.max(corroborationCount || 1, 1), 5)
  const base = CORROBORATION_OPACITY[count] || 0.35
  return authoritative && count === 1 ? Math.max(0.75, base) : base
}

export function getAnimationState(timestamp) {
  return getRecencyState(timestamp)
}

export function getTtlProgress(fetchedAt, ttl) {
  const elapsed = (Date.now() - new Date(fetchedAt).getTime()) / 1000
  return Math.min(1, elapsed / ttl)
}

export function getStaleOpacity(event) {
  const progress = getTtlProgress(event.fetchedAt, event.ttl)
  if (progress < 0.8) return event.opacity
  const fadeProgress = (progress - 0.8) / 0.2
  return event.opacity * (1 - fadeProgress)
}
