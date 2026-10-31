// The Tessera Tile — TESSERA's original geometric identity motif.
// Seven modular blocks interlock into one square: individual elements
// coming together to form a larger organised system.
// Used as: logo mark, favicon, loading animation, empty states,
// session-block accents, section transitions, AI loading state.
import React from 'react'

const BLOCKS = [
  { x: 2, y: 2, w: 18, h: 10, c: 'var(--charcoal)' },
  { x: 12, y: 12, w: 8, h: 26, c: 'var(--charcoal)' },
  { x: 22, y: 2, w: 16, h: 16, c: 'var(--lime)' },
  { x: 2, y: 14, w: 8, h: 12, c: 'var(--sky)' },
  { x: 2, y: 28, w: 8, h: 10, c: 'var(--violet)' },
  { x: 22, y: 20, w: 16, h: 6, c: 'var(--coral)' },
  { x: 22, y: 28, w: 16, h: 10, c: 'var(--charcoal)' },
]

/**
 * <Tessera size animated mono className />
 * animated — blocks assemble in a stagger (loading / brand moments)
 * mono    — single-colour rendition for light backgrounds / watermarks
 */
export function Tessera({ size = 28, animated = false, mono = false, className = '', color = 'currentColor' }) {
  const fill = (c) => (mono ? color : c)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`tessera ${animated ? 'tessera-anim' : ''} ${className}`}
      aria-hidden="true" style={{ flex: '0 0 auto', display: 'block' }}>
      {BLOCKS.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={fill(b.c)}
          className="tessera-b" style={animated ? { animationDelay: `${i * 0.07}s` } : undefined} />
      ))}
    </svg>
  )
}

/** Sidebar / login logo: mark + wordmark. */
export function Wordmark({ size = 26, light = false }) {
  return (
    <span className="tessera-logo" style={{ color: light ? '#F1EEE6' : 'var(--charcoal)' }}>
      <Tessera size={size} />
      <span className="tessera-word">
        TESSERA
        <em>Intelligent Campus Scheduling</em>
      </span>
    </span>
  )
}

/** Loading state: assembling tile. */
export function TesseraLoader({ label = 'Composing…', size = 40 }) {
  return (
    <div className="tessera-loader" role="status">
      <Tessera size={size} animated />
      {label && <span className="mono small">{label}</span>}
    </div>
  )
}

/** Empty state: outlined tile + annotation. */
export function TesseraEmpty({ title, sub, action }) {
  return (
    <div className="tessera-empty">
      <Tessera size={44} mono color="#c9c4b6" />
      <div className="te-t">{title}</div>
      {sub && <div className="te-s">{sub}</div>}
      {action && <div className="te-a">{action}</div>}
    </div>
  )
}

/** Small tile accent used on section headers / transitions. */
export function TesseraRule() {
  return (
    <span className="tessera-rule" aria-hidden="true">
      <i style={{ background: 'var(--charcoal)' }} />
      <i style={{ background: 'var(--lime)' }} />
      <i style={{ background: 'var(--violet)' }} />
      <i style={{ background: 'var(--coral)' }} />
    </span>
  )
}
