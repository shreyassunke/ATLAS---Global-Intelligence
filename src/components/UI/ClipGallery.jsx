/**
 * Inline gallery of GDELT TV clips (Internet Archive embeds). Designed to sit
 * inside the Analytics panel's TV tab without adding heavy iframes to the
 * initial render — clips are shown as link cards with preview thumbnails and
 * the archive.org URL is only opened on user click.
 */
export default function ClipGallery({ clips, emptyText = 'No clips returned.' }) {
  if (!clips?.length) {
    return <p className="text-[11px] text-white/35">{emptyText}</p>
  }
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {clips.map((clip, i) => {
        const href = clip.archiveUrl || clip.previewUrl
        const snippet = (clip.snippet || '').trim()
        return (
          <li
            key={`${clip.station}-${clip.date}-${i}`}
            className="overflow-hidden rounded-lg border border-white/5 bg-black/30"
          >
            <a
              href={href || '#'}
              target={href ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="block p-2 text-[11px] text-white/75 transition hover:bg-white/5"
            >
              <div className="flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-widest text-white/40">
                <span>{clip.station || '—'}</span>
                <span>{clip.date || ''}</span>
              </div>
              {clip.show && (
                <div className="mt-1 truncate text-[10px] text-white/55">{clip.show}</div>
              )}
              {snippet && (
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-white/80">{snippet}</p>
              )}
              {href && (
                <span className="mt-1 inline-block text-[9px] text-sky-300/80 hover:text-sky-200">open ↗</span>
              )}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
