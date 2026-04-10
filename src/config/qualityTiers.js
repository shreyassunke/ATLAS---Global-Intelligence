/**
 * Quality priority definitions for Atlas globe rendering.
 *
 * Each priority maps to a set of Cesium viewer/scene settings.
 * Auto-detection samples FPS during early frames and assigns
 * HIGH / MEDIUM / LOW automatically. User can override in Settings.
 */

export const TIER_NAMES = ['low', 'medium', 'high']

/** How many frames to sample for auto-detection */
const FPS_SAMPLE_FRAMES = 90
const FPS_SAMPLE_WARMUP = 20 // ignore first N frames (shader compile, tile load)

const QUALITY_STORAGE_KEY = 'atlas_quality_settings'
const GLOBE_MODE_STORAGE_KEY = 'atlas_globe_mode'

/**
 * Per-priority config — controls every tunable Cesium knob.
 */
export const QUALITY_TIERS = {
    high: {
        label: 'High',
        resolutionScale: () => Math.min(window.devicePixelRatio || 1.0, 2.0),
        msaa: 2,
        bloom: true,
        vignette: true,
        tiles3d: true,         // Google Photorealistic 3D Tiles
        fog: true,
        atmosphere: 'fragment', // perFragmentAtmosphere
        maxScreenSpaceError: 8,  // Controls Google 3D Tile LOD quality
        maxMarkers: 300,
        autoRotate: false, // opt-in via Settings — idle spin only when enabled
        targetFrameRate: undefined, // uncapped
    },
    medium: {
        label: 'Medium',
        resolutionScale: () => 1.0,
        msaa: 1,
        bloom: false,
        vignette: true,
        tiles3d: true,        // Always load Google tiles (they are the surface)
        fog: true,
        atmosphere: 'vertex',
        maxScreenSpaceError: 12, // Lower LOD for mid-range devices
        maxMarkers: 150,
        autoRotate: false,
        targetFrameRate: 30,
    },
    low: {
        label: 'Low',
        resolutionScale: () => 0.75,
        msaa: 0,
        bloom: false,
        vignette: false,
        tiles3d: true,        // Always load Google tiles (they are the surface)
        fog: false,
        atmosphere: 'off',
        maxScreenSpaceError: 16, // Coarser LOD for low-end devices
        maxMarkers: 80,
        autoRotate: false,
        targetFrameRate: 30,
    },
}

/**
 * Detect if the device is mobile (touch + small screen).
 */
export function isMobileDevice() {
    if (typeof window === 'undefined') return false
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmall = window.innerWidth < 768
    return hasTouch && isSmall
}

/**
 * Sample FPS over N frames using requestAnimationFrame.
 * Returns a promise that resolves with the detected priority name.
 *
 * @param {HTMLCanvasElement} [canvas] — optional canvas to check WebGL renderer
 * @returns {Promise<'high'|'medium'|'low'>}
 */
export function detectQualityTier(canvas) {
    // Mobile → always LOW
    if (isMobileDevice()) return Promise.resolve('low')

    return new Promise((resolve) => {
        let frameCount = 0
        const timestamps = []
        let rafId

        function sample(now) {
            frameCount++
            if (frameCount > FPS_SAMPLE_WARMUP) {
                timestamps.push(now)
            }

            if (frameCount < FPS_SAMPLE_FRAMES + FPS_SAMPLE_WARMUP) {
                rafId = requestAnimationFrame(sample)
            } else {
                // Calculate average FPS from sampled timestamps
                if (timestamps.length < 2) {
                    resolve('medium')
                    return
                }
                const totalMs = timestamps[timestamps.length - 1] - timestamps[0]
                const avgFps = ((timestamps.length - 1) / totalMs) * 1000

                if (avgFps >= 50) resolve('high')
                else if (avgFps >= 25) resolve('medium')
                else resolve('low')
            }
        }

        rafId = requestAnimationFrame(sample)

        // Timeout safety — resolve after 5s regardless
        setTimeout(() => {
            cancelAnimationFrame(rafId)
            if (timestamps.length < 2) {
                resolve('medium')
                return
            }
            const totalMs = timestamps[timestamps.length - 1] - timestamps[0]
            const avgFps = ((timestamps.length - 1) / totalMs) * 1000
            if (avgFps >= 50) resolve('high')
            else if (avgFps >= 25) resolve('medium')
            else resolve('low')
        }, 5000)
    })
}

/**
 * Load persisted quality settings from localStorage.
 */
export function loadQualitySettings() {
    try {
        const raw = localStorage.getItem(QUALITY_STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * Persist quality settings to localStorage.
 */
export function saveQualitySettings(settings) {
    try {
        localStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(settings))
    } catch { /* quota */ }
}

/**
 * Load persisted globe mode from localStorage.
 */
export function loadGlobeMode() {
    try {
        const stored = localStorage.getItem(GLOBE_MODE_STORAGE_KEY)
        // Prevent Cesium out-of-memory crashes on mobile devices by overriding preference
        if (stored === 'cesium' && isMobileDevice()) {
            return 'globegl'
        }
        if (stored) return stored
    } catch {
        /* ignore */
    }
    return isMobileDevice() ? 'globegl' : 'cesium'
}

/**
 * Persist globe mode.
 */
export function saveGlobeMode(mode) {
    try {
        localStorage.setItem(GLOBE_MODE_STORAGE_KEY, mode)
    } catch { /* quota */ }
}
