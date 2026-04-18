/**
 * Shared attribution footer for every GDELT-derived surface. Used across the
 * analytics panel tabs, the Visual GKG panel, the theme explorer, and the
 * predictive card so credit is unambiguous wherever data is displayed.
 */
export default function GdeltAttribution({ compact = false }) {
  return (
    <p
      className={
        compact
          ? 'text-[9px] leading-snug text-white/30'
          : 'border-t border-white/5 pt-2 text-[9px] leading-snug text-white/30'
      }
    >
      Data: <a
        href="https://www.gdeltproject.org"
        target="_blank"
        rel="noopener noreferrer"
        className="text-white/40 hover:text-white/70"
      >GDELT Project (gdeltproject.org)</a>
      {' · '}Realtime news, GKG, VGKG, CAMEO events, TV News Archive.
    </p>
  )
}
