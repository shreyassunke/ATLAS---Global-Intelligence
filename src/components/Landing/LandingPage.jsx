import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { GlassFilter } from '../UI/liquid-glass'
import { AtlasWordmark } from '../UI/AtlasWordmark'
import { useAtlasStore } from '../../store/atlasStore'
import { LandingGlobeDemoFallback } from './LandingGlobeDemoFallback'

const LandingGlobeDemo = lazy(() => import('./LandingGlobeDemo'))

const LANDING_NAV = [
  { id: 'cta-join', label: 'Explore' },
  { id: 'contact', label: 'Contact' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.9 + (i * 0.14),
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
}

// The whole block rises up together from below after the globe settles
const blockRise = {
  hidden: { opacity: 0, y: 52 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.5,
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
    },
  },
}

export default function LandingPage() {
  const acknowledgeLanding = useAtlasStore((s) => s.acknowledgeLanding)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)
  const landingScrollRef = useRef(null)
  const navTopSentinelRef = useRef(null)
  const [navAtTop, setNavAtTop] = useState(true)

  const scrollTo = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const scrollLandingTop = useCallback(() => {
    landingScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const enterApp = useCallback(() => acknowledgeLanding(), [acknowledgeLanding])

  useEffect(() => {
    const root = landingScrollRef.current
    const sentinel = navTopSentinelRef.current
    if (!root || !sentinel) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        setNavAtTop(entry.isIntersecting)
      },
      { root, rootMargin: '0px', threshold: 0 },
    )
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [])

  return (
    <motion.div
      ref={landingScrollRef}
      className="landing-page stitch-landing fixed inset-0 z-[55] flex flex-col overflow-y-auto overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      role="document"
      aria-label="ATLAS introduction"
    >
      <div ref={navTopSentinelRef} className="stitch-nav-scroll-sentinel" aria-hidden />
      <GlassFilter />
      <div className="landing-globe-immersive">
        <Suspense fallback={<LandingGlobeDemoFallback immersive />}>
          <LandingGlobeDemo immersive />
        </Suspense>
      </div>
      <div className="landing-page__glow pointer-events-none" aria-hidden />

      <header
        className={`stitch-nav-wrap stitch-nav-wrap--floating sticky top-0 z-30${navAtTop ? '' : ' stitch-nav-wrap--scrolled'}`}
      >
        <nav className="stitch-nav-bar" aria-label="Primary">
          <button
            type="button"
            className="stitch-nav-logo flex items-center shrink-0 border-0 bg-transparent p-0 cursor-pointer text-inherit justify-self-start"
            onClick={scrollLandingTop}
            aria-label="ATLAS — top of page"
          >
            <AtlasWordmark className="atlas-wordmark--landing w-auto opacity-[0.98]" aria-hidden />
          </button>
          <div className="stitch-nav-bar__links stitch-nav-bar__links--desktop">
            {LANDING_NAV.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="stitch-nav-link">
                {label}
              </button>
            ))}
          </div>
          <div className="stitch-nav-bar__actions justify-self-end">
            <button type="button" onClick={enterApp} className="stitch-btn-primary stitch-btn-primary--nav">
              {hasCompletedOnboarding ? 'Login' : 'Get started'}
            </button>
          </div>
          <div className="stitch-nav-bar__links stitch-nav-bar__links--mobile">
            {LANDING_NAV.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="stitch-nav-link">
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="relative z-10 stitch-landing__content landing-main-over-globe">
        <section className="stitch-hero stitch-hero--fold">
          {/* Spacer — lets globe dominate the upper viewport */}
          <div className="flex-1 min-h-0" aria-hidden />
          {/* ── Hero copy: centered, bottom-anchored, rises up on load ── */}
          <motion.div
            className="stitch-hero__copy landing-hit-target flex flex-col items-center text-center"
            variants={blockRise}
            initial="hidden"
            animate="show"
          >
            <motion.p
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="stitch-eyebrow"
            >
              Global Intelligence
            </motion.p>
            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="stitch-hero-title mt-3"
            >
              Every signal. One living globe.
            </motion.h1>
            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="stitch-hero-body mt-5"
            >
              Open-source intelligence, visualized in real time.
            </motion.p>
            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="mt-16"
            >
              <button type="button" onClick={enterApp} className="stitch-btn-ghost" id="hero-cta">
                <span className="stitch-btn-ghost__text">{hasCompletedOnboarding ? 'Enter Atlas' : 'Get Started'}</span>
                <span className="stitch-btn-ghost__arrow" aria-hidden>→</span>
              </button>
            </motion.div>
          </motion.div>
          <div className="stitch-hero__scroll-wrap landing-hit-target flex justify-center pt-10 pb-4">
            <button
              type="button"
              className="stitch-hero-scroll-cue"
              onClick={() => scrollTo('cta-join')}
              aria-label="Scroll to next section"
            >
              <span className="stitch-hero-scroll-cue__line" aria-hidden />
              <span className="stitch-hero-scroll-cue__chev" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </div>
        </section>

        {/* ── Why ATLAS ── */}
        <section id="cta-join" className="atlas-why landing-hit-target scroll-mt-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="atlas-why__header"
          >
            <p className="stitch-eyebrow mb-4">The Problem</p>
            <h2 className="atlas-section-title">
              The world doesn't send<br />email digests.
            </h2>
            <p className="atlas-section-body mt-5 mx-auto text-center text-balance">
              You're reading disconnected headlines from a dozen tabs. None of them tell you <em>where</em> things are happening, how events relate, or what the broader picture looks like. You're consuming noise — not intelligence.
            </p>
          </motion.div>

          <div className="atlas-why__grid">
            {[
              {
                label: 'Before ATLAS',
                icon: '✕',
                iconColor: 'rgba(239,68,68,0.75)',
                points: [
                  'Scattered feeds with no geographic context',
                  'No way to see how stories relate globally',
                  'Algorithmic bias shapes what you see',
                  'Signal buried under opinion and noise',
                ],
              },
              {
                label: 'With ATLAS',
                icon: '◎',
                iconColor: 'rgba(56,189,248,0.85)',
                points: [
                  'Every story pinned to where it happened',
                  'Patterns emerge across regions and time',
                  'You choose your sources — unfiltered',
                  'One glance tells you the state of the world',
                ],
              },
            ].map((col, ci) => (
              <motion.div
                key={col.label}
                className="atlas-why__card"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, delay: ci * 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="atlas-why__card-header">
                  <span className="atlas-why__icon" style={{ color: col.iconColor }}>{col.icon}</span>
                  <span className="atlas-why__card-label">{col.label}</span>
                </div>
                <ul className="atlas-why__list">
                  {col.points.map((p) => (
                    <li key={p} className="atlas-why__list-item">{p}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Feature Education ── */}
        <section className="atlas-features landing-hit-target">
          <motion.div
            className="atlas-why__header"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="stitch-eyebrow mb-4">What You Get</p>
            <h2 className="atlas-section-title">Intelligence at the speed<br />of the world.</h2>
          </motion.div>

          <div className="atlas-features__grid">
            {[
              {
                n: '01',
                title: 'Living Globe',
                body: 'Every news event pinned to its exact location on a real-time 3D globe. Spin, zoom, and explore the world as it unfolds.',
              },
              {
                n: '02',
                title: 'Your Sources',
                body: 'Choose from hundreds of global publishers across every region. No algorithm decides what you see — you do.',
              },
              {
                n: '03',
                title: 'Pattern Recognition',
                body: 'Regional clusters and category filters reveal how stories connect across borders — what a single headline never shows.',
              },
              {
                n: '04',
                title: 'Open Source',
                body: 'No data harvesting, no monetized attention, no black-box curation. Transparent by design — the code is yours to inspect.',
              },
            ].map((f, fi) => (
              <motion.div
                key={f.n}
                className="atlas-feature-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.65, delay: fi * 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="atlas-feature-card__num">{f.n}</span>
                <h3 className="atlas-feature-card__title">{f.title}</h3>
                <p className="atlas-feature-card__body">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="atlas-final-cta landing-hit-target">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="atlas-final-cta__inner"
          >
            <p className="stitch-eyebrow mb-5">Ready?</p>
            <h2 className="atlas-section-title atlas-section-title--sm">
              The world is signaling.<br />Are you listening?
            </h2>
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={enterApp} className="stitch-btn-ghost" id="cta-enter">
                <span className="stitch-btn-ghost__text">{hasCompletedOnboarding ? 'Enter Atlas' : 'Start Now'}</span>
                <span className="stitch-btn-ghost__arrow" aria-hidden>→</span>
              </button>
            </div>
          </motion.div>
        </section>

        {/* ── Footer ── */}
        <footer id="contact" className="atlas-footer landing-hit-target scroll-mt-24">
          <div className="atlas-footer__top">

            {/* Brand col */}
            <div className="atlas-footer__brand-col">
              <button
                type="button"
                className="border-0 bg-transparent p-0 cursor-pointer text-inherit"
                onClick={scrollLandingTop}
                aria-label="ATLAS — top of page"
              >
                <AtlasWordmark className="atlas-wordmark--landing atlas-wordmark--landing-footer w-auto opacity-90" aria-hidden />
              </button>
              <p className="atlas-footer__tagline-sm">
                Open-source global intelligence.<br />Not operational intelligence.
              </p>
            </div>

            {/* Contact col */}
            <div className="atlas-footer__col">
              <p className="atlas-footer__col-label">Contact</p>
              <p className="atlas-footer__col-body">
                Questions, partnerships, or press — reach out directly.
              </p>
              <a
                href="mailto:hello@atlas-intelligence.io"
                className="stitch-btn-ghost atlas-footer__inline-btn"
                id="footer-contact-btn"
              >
                <span className="stitch-btn-ghost__text">Send a message</span>
                <span className="stitch-btn-ghost__arrow" aria-hidden>→</span>
              </a>
            </div>

            {/* Feedback col */}
            <div className="atlas-footer__col">
              <p className="atlas-footer__col-label">Feedback</p>
              <p className="atlas-footer__col-body">
                Found a bug or have a feature idea? We read every one.
              </p>
              <div className="atlas-footer__pill-row">
                <a
                  href="https://github.com/shreyaslas-global-intelligence/issues/new?template=bug_report.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="atlas-pill-btn"
                  id="footer-bug-btn"
                >
                  🐛 Report a bug
                </a>
                <a
                  href="https://github.com/shreyaslas-global-intelligence/issues/new?template=feature_request.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="atlas-pill-btn atlas-pill-btn--accent"
                  id="footer-feature-btn"
                >
                  ✦ Request a feature
                </a>
              </div>
            </div>
          </div>

          <div className="atlas-footer__bottom">
            <nav className="atlas-footer__nav" aria-label="Footer nav">
              <button type="button" onClick={() => scrollTo('cta-join')} className="stitch-footer-link">Explore</button>
              <button type="button" onClick={() => scrollTo('contact')} className="stitch-footer-link">Contact</button>
            </nav>
            <p className="atlas-footer__copy">
              © {new Date().getFullYear()} ATLAS · Open-source signals · Not operational intelligence
            </p>
          </div>
        </footer>
      </main>
    </motion.div>
  )
}
