import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { QUALITY_TIERS, TIER_NAMES } from '../../config/qualityTiers'
import AlertRulesPanel from './AlertRulesPanel'

const GLOBE_MODES = [
    { id: 'cesium', label: 'Google 3D', desc: 'Photorealistic Earth with native labels (Google Map3D)' },
    { id: 'globegl', label: 'Globe.GL', desc: 'Lightweight 3D globe, smooth & fast' },
    { id: 'leaflet', label: '2D Map', desc: 'Flat map, minimal GPU' },
]

const QUALITY_PRESETS = [
    { id: 'auto', label: 'Auto' },
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
    { id: 'low', label: 'Low' },
]

const TOGGLE_SETTINGS = [{ key: 'autoRotate', label: 'Auto-Rotate', icon: '↻' }]

const DATA_LAYER_TOGGLES = [
    { key: 'gdelt', label: 'GDELT Geopolitics', icon: '⚔', desc: 'Conflict, diplomacy, protests from GDELT 2.0' },
    { key: 'gdeltHeatmap', label: 'GDELT Heatmap', icon: '🌡', desc: 'Event density heatmap from GDELT GEO PointHeatmap' },
    { key: 'gdeltChoropleth', label: 'GDELT Country Tone', icon: '🗺', desc: 'Per-country average tone choropleth (GEO Country mode)' },
    { key: 'firms', label: 'NASA FIRMS Fires', icon: '🔥', desc: 'Active fire & thermal anomaly data' },
    { key: 'usgs', label: 'USGS Earthquakes', icon: '🌋', desc: 'Real-time seismic activity worldwide' },
    { key: 'gdacs', label: 'GDACS Disasters', icon: '🌊', desc: 'Global disaster alerts & coordination' },
    { key: 'eonet', label: 'NASA EONET', icon: '🛰', desc: 'Earth Observatory natural events' },
    { key: 'news', label: 'News Articles', icon: '📰', desc: 'Commercial news API articles on globe' },
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
    const colorblindMode = useAtlasStore((s) => s.colorblindMode)
    const toggleColorblindMode = useAtlasStore((s) => s.toggleColorblindMode)
    const user = useAtlasStore((s) => s.user)
    const signOut = useAtlasStore((s) => s.signOut)
    const dataLayers = useAtlasStore((s) => s.dataLayers)
    const toggleDataLayer = useAtlasStore((s) => s.toggleDataLayer)
    const panelRef = useRef(null)
    const [alertsOpen, setAlertsOpen] = useState(false)

    useEffect(() => {
        if (!settingsOpen) return
        function handleClick(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setSettingsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        document.addEventListener('touchstart', handleClick)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('touchstart', handleClick)
        }
    }, [settingsOpen, setSettingsOpen])

    // Effective priority for display
    const activePriority = QUALITY_TIERS[resolvedTier] || QUALITY_TIERS.high

    // Get effective value for a toggle key
    function getEffective(key) {
        if (key in qualityOverrides) return qualityOverrides[key]
        return activePriority[key]
    }

    const isCesium = globeMode === 'cesium'

    return (
    <>
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

                    {/* ── Data Layers ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Data Layers</div>
                        <div className="settings-toggles">
                            {DATA_LAYER_TOGGLES.map(({ key, label, icon }) => {
                                const isOn = dataLayers[key] !== false
                                return (
                                    <button
                                        key={key}
                                        onClick={() => toggleDataLayer(key)}
                                        className={`settings-feature-row ${isOn ? 'on' : 'off'}`}
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
                        <div className="settings-hint">
                            Toggle data layers on the globe. Data provided by the GDELT Project, NASA, and USGS.
                        </div>
                    </div>

                    {/* ── Quality Preset (Google 3D globe only) ── */}
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

                    {/* ── Accessibility ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Accessibility</div>
                        <div className="settings-toggles">
                            <button
                                onClick={toggleColorblindMode}
                                className={`settings-feature-row ${colorblindMode ? 'on' : 'off'}`}
                            >
                                <span className="settings-feature-icon">◐</span>
                                <span className="settings-feature-label">Colorblind Patterns</span>
                                <span className={`settings-feature-switch ${colorblindMode ? 'on' : ''}`}>
                                    <span className="settings-feature-knob" />
                                </span>
                            </button>
                        </div>
                        <div className="settings-hint">
                            ESC clears selection and restores HUD · Tab cycles events · F toggles HUD
                        </div>
                    </div>

                    {/* ── Alerts (signed-in only) ── */}
                    {user && (
                        <div className="settings-section">
                            <div className="settings-section-label">Alerts</div>
                            <div className="settings-toggles">
                                <button
                                    onClick={() => setAlertsOpen(true)}
                                    className="settings-feature-row on"
                                >
                                    <span className="settings-feature-icon">🔔</span>
                                    <span className="settings-feature-label">Configure Alert Rules</span>
                                    <span className="text-[9px] text-white/25">→</span>
                                </button>
                            </div>
                            <div className="settings-hint">
                                Get notified by email or SMS when events match your criteria
                            </div>
                        </div>
                    )}

                    {/* ── Account ── */}
                    <div className="settings-section">
                        <div className="settings-section-label">Account</div>
                        <div className="settings-toggles">
                            {user ? (
                                <>
                                    <div className="settings-feature-row on">
                                        <span className="settings-feature-icon">●</span>
                                        <span className="settings-feature-label" style={{ fontSize: '8px', letterSpacing: '0.15em' }}>
                                            {user.email}
                                        </span>
                                    </div>
                                    <button onClick={signOut} className="settings-feature-row off">
                                        <span className="settings-feature-icon">↩</span>
                                        <span className="settings-feature-label">Sign Out</span>
                                    </button>
                                </>
                            ) : (
                                <div className="settings-feature-row off">
                                    <span className="settings-feature-icon">○</span>
                                    <span className="settings-feature-label">Guest — sign in to sync preferences</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Globe features (Google 3D only) ── */}
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
        <AlertRulesPanel open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </>
    )
}
