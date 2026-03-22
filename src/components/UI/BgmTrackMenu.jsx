import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAtlasStore } from '../../store/atlasStore'
import { BGM_AMBIENT_TRACKS } from '../../config/bgmTracks'

/**
 * Floating menu to pick the ambient loop track — opened from HeaderAudioVisualizer clicks.
 */
export default function BgmTrackMenu() {
  const bgmTrackMenu = useAtlasStore((s) => s.bgmTrackMenu)
  const bgmAmbientTrackId = useAtlasStore((s) => s.bgmAmbientTrackId)
  const setBgmAmbientTrackId = useAtlasStore((s) => s.setBgmAmbientTrackId)
  const closeBgmTrackMenu = useAtlasStore((s) => s.closeBgmTrackMenu)
  const bgmVolume = useAtlasStore((s) => s.bgmVolume)
  const setBgmVolume = useAtlasStore((s) => s.setBgmVolume)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!bgmTrackMenu) return
    function onKey(e) {
      if (e.key === 'Escape') closeBgmTrackMenu()
    }
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        closeBgmTrackMenu()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [bgmTrackMenu, closeBgmTrackMenu])

  if (!bgmTrackMenu || typeof document === 'undefined') return null

  const volPct = Math.round(
    (typeof bgmVolume === 'number' && !Number.isNaN(bgmVolume) ? bgmVolume : 0.65) * 100,
  )

  const { x, y } = bgmTrackMenu
  const pad = 8
  const menuW = 260
  const left = Math.max(pad, Math.min(x - menuW / 2, window.innerWidth - menuW - pad))
  const top = Math.min(y + pad, window.innerHeight - 340)

  return createPortal(
    <div
      ref={menuRef}
      className="bgm-track-menu"
      style={{ position: 'fixed', left, top, zIndex: 10060 }}
      role="dialog"
      aria-label="Background music track"
    >
      <div className="bgm-track-menu__title">Ambient track</div>
      <ul className="bgm-track-menu__list" role="listbox">
        {BGM_AMBIENT_TRACKS.map((t) => {
          const selected = t.id === bgmAmbientTrackId
          return (
            <li key={t.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`bgm-track-menu__item${selected ? ' bgm-track-menu__item--active' : ''}`}
                onClick={() => {
                  setBgmAmbientTrackId(t.id)
                  closeBgmTrackMenu()
                }}
              >
                <span className="bgm-track-menu__check" aria-hidden>{selected ? '✓' : ''}</span>
                {t.label}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="bgm-track-menu__volume">
        <label className="bgm-track-menu__volume-label" htmlFor="bgm-volume-range">
          Volume
        </label>
        <div className="bgm-track-menu__volume-row">
          <input
            id="bgm-volume-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volPct}
            onChange={(e) => setBgmVolume(Number(e.target.value) / 100)}
            onClick={(e) => e.stopPropagation()}
            className="bgm-track-menu__range"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={volPct}
          />
          <span className="bgm-track-menu__volume-pct" aria-hidden>
            {volPct}%
          </span>
        </div>
      </div>
      <p className="bgm-track-menu__hint">Applies after the intro finishes. Hover the waveform to see the current track.</p>
    </div>,
    document.body,
  )
}
