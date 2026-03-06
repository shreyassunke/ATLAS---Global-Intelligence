import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { QUALITY_TIERS, TIER_NAMES } from '../../config/qualityTiers'

const GLOBE_MODES = [
    { id: 'cesium', label: 'Cesium', desc: '3D globe with terrain & close-up detail' },
    { id: 'globegl', label: 'Globe.GL', desc: 'Lightweight 3D globe, smooth & fast' },
    { id: 'leaflet', label: '2D Map', desc: 'Flat map, minimal GPU' },
]

const QUALITY_PRESETS = [
    { id: 'auto', label: 'Auto' },
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
]

const TOGGLE_SETTINGS = [
    { key: 'bloom', label: 'Bloom', icon: '✦' },
    { key: 'nightLights', label: 'Night Lights', icon: '🌙' },
    { key: 'tiles3d', label: '3D Buildings', icon: '🏙' },
    { key: 'terrain', label: 'Terrain', icon: '⛰' },
    { key: 'labels', label: 'Labels', icon: '🏷' },
    { key: 'fog', label: 'Fog', icon: '🌫' },
    { key: 'vignette', label: 'Vignette', icon: '◐' },
    { key: 'autoRotate', label: 'Auto-Rotate', icon: '↻' },
]

export default function SettingsPanel() {
    const settingsOpen = useAtlasStore((s) => s.settingsOpen)
    const setSettingsOpen = useAtlasStore((s) => s.setSettingsOpen)
    const globeMode = useAtlasStore((s) => s.globeMode)
    const setGlobeMode = useAtlasStore((s) => s.setGlobeMode)
    const qualityTier = useAtlasStore((s) => s.qualityTier)
    const setQualityTier = useAtlasStore((s) => s.setQualityTier)
    const resolvedTier = useAtlasStore((s) => s.resolvedTier)
    const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)
    const setQualityOverride = useAtlasStore((s) => s.setQualityOverride)
    const clearQualityOverrides = useAtlasStore((s) => s.clearQualityOverrides)
    const panelRef = useRef(null)

    // Close on click outside
    useEffect(() => {
        if (!settingsOpen) return
        function handleClick(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setSettingsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [settingsOpen, setSettingsOpen])

    // Effective tier for display
    const activeTier = QUALITY_TIERS[resolvedTier] || QUALITY_TIERS.high

    // Get effective value for a toggle key
    function getEffective(key) {
        if (key in qualityOverrides) return qualityOverrides[key]
        return activeTier[key]
    }

    const isCesium = globeMode === 'cesium'

    return (
        <AnimatePresence>
            {settingsOpen && (
                <motion.div
                    ref={panelRef}
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.97 }}
                    transition={{ duration: 0.22 }}
                    className="settings-panel"
                >
                    {/* Header */}
                    <div className="settings-header">
                        <span className="settings-title">⚙ SETTINGS</span>
                        <button
                            onClick={() => setSettingsOpen(false)}
                            className="settings-close"
                        >
                            ✕
                        </button>
                    </div>

                    {/* ── Globe Renderer ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Globe Renderer</div>
                        <div className="settings-toggle-group">
                            {GLOBE_MODES.map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => setGlobeMode(mode.id)}
                                    className={`settings-toggle-btn ${globeMode === mode.id ? 'active' : ''}`}
                                    title={mode.desc}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                        <div className="settings-hint">
                            {GLOBE_MODES.find((m) => m.id === globeMode)?.desc}
                        </div>
                    </div>

                    {/* ── Quality Preset (Cesium only) ── */}
                    {isCesium && (
                        <div className="settings-section">
                            <div className="settings-section-label">
                                Quality
                                {qualityTier === 'auto' && (
                                    <span className="settings-auto-badge">
                                        auto → {resolvedTier}
                                    </span>
                                )}
                            </div>
                            <div className="settings-toggle-group">
                                {QUALITY_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        onClick={() => {
                                            setQualityTier(preset.id)
                                            clearQualityOverrides()
                                        }}
                                        className={`settings-toggle-btn ${qualityTier === preset.id ? 'active' : ''}`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Individual Toggles (Cesium only) ── */}
                    {isCesium && (
                        <div className="settings-section">
                            <div className="settings-section-label">
                                Features
                                {Object.keys(qualityOverrides).length > 0 && (
                                    <button
                                        className="settings-reset-btn"
                                        onClick={clearQualityOverrides}
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                            <div className="settings-toggles">
                                {TOGGLE_SETTINGS.map(({ key, label, icon }) => {
                                    const isOn = getEffective(key)
                                    const isOverridden = key in qualityOverrides
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setQualityOverride(key, !isOn)}
                                            className={`settings-feature-row ${isOn ? 'on' : 'off'} ${isOverridden ? 'overridden' : ''}`}
                                        >
                                            <span className="settings-feature-icon">{icon}</span>
                                            <span className="settings-feature-label">{label}</span>
                                            <span className={`settings-feature-switch ${isOn ? 'on' : ''}`}>
                                                <span className="settings-feature-knob" />
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
