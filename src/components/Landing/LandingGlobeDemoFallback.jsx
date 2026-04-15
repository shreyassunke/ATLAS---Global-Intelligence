/** Placeholder while `LandingGoogleGlobe` (Map3D) lazy-loads — keeps initial JS light. */
export function LandingGlobeDemoFallback({ immersive = false }) {
  if (immersive) {
    return <div className="landing-globe-immersive-fallback" aria-hidden />
  }
  return (
    <div className="stitch-globe-stage" aria-hidden>
      <div className="stitch-globe-aura" />
      <div className="stitch-globe-ring-outer">
        <span className="stitch-globe-nav stitch-globe-nav--n" />
        <span className="stitch-globe-nav stitch-globe-nav--e" />
        <span className="stitch-globe-nav stitch-globe-nav--s" />
        <span className="stitch-globe-nav stitch-globe-nav--w" />
      </div>
      <div className="stitch-globe-sphere landing-globe-demo__sphere">
        <div className="landing-globe-demo__skeleton" />
      </div>
      <p className="stitch-globe-badge">Interactive 3D globe in-app</p>
    </div>
  )
}
