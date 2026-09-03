import { motion } from 'framer-motion'
import { REDUCED_MOTION, ANIMATION } from '../constants'

const variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: REDUCED_MOTION ? 0 : 0.3, ease: ANIMATION.EASE },
  },
}

const OpenGlyph = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <path d="M2 8L8 2M3 2h5v5" />
  </svg>
)

/**
 * One panel on the console grid.
 *  label  — mono caption, uppercase
 *  count  — small secondary figure beside the label (optional)
 *  link   — { label, href } rendered as "AppName ↗" on the right (optional)
 *  foot   — node rendered in the footer strip (optional)
 *  Placement is the parent grid's job (see .hero / .row in index.css).
 */
const Module = ({ label, count, link, foot, className = '', children }) => (
  <motion.section variants={variants} className={`mod ${className}`} aria-label={label}>
    <div className="mod-head">
      <span className="label">{label}</span>
      {count != null && (
        <span className="font-mono text-[11px] text-ink-3 tnum">{count}</span>
      )}
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-ink-3 hover:text-accent transition-colors no-underline"
        >
          {link.label}
          <OpenGlyph />
        </a>
      )}
    </div>
    <div className="mod-body">{children}</div>
    {foot && <div className="mod-foot">{foot}</div>}
  </motion.section>
)

export default Module
