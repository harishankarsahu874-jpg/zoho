// Minimal stroke icon set (24px grid, currentColor). Hand-picked paths,
// no external icon library — keeps the bundle tiny and the look consistent.
import React from 'react'

function S({ children, size = 19, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: '0 0 auto', display: 'block' }} {...rest}>
      {children}
    </svg>
  )
}

export const Grid = (p) => (
  <S {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </S>
)

export const Calendar = (p) => (
  <S {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8.5 3v4M15.5 3v4" />
  </S>
)

export const Cap = (p) => (
  <S {...p}>
    <path d="M2.5 9.8 12 4.8l9.5 5-9.5 5z" />
    <path d="M6.5 12.2v3.6c0 1.7 2.5 3.2 5.5 3.2s5.5-1.5 5.5-3.2v-3.6" />
    <path d="M21.5 9.8v4.7" />
  </S>
)

export const Building = (p) => (
  <S {...p}>
    <path d="M4.5 21V8.5L12 4l7.5 4.5V21" />
    <path d="M2.5 21h19" />
    <path d="M9.5 21v-4.5h5V21" />
    <path d="M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2" />
  </S>
)

export const Star = (p) => (
  <S {...p}>
    <path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" />
  </S>
)

export const Shuffle = (p) => (
  <S {...p}>
    <path d="M3 7h5l8 10h5" />
    <path d="M3 17h5l8-10h5" />
    <path d="M18.5 4.5 21.5 7l-3 2.5" />
    <path d="M18.5 14.5l3 2.5-3 2.5" />
  </S>
)

export const Sparkle = (p) => (
  <S {...p}>
    <path d="M11 4l1.7 4.8L17.5 10.5l-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7z" />
    <path d="M18.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" />
  </S>
)

export const Users = (p) => (
  <S {...p}>
    <circle cx="9" cy="8.5" r="3.4" />
    <path d="M3.5 20c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" />
    <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 15.4c2 .7 3.2 2.3 3.5 4.6" />
  </S>
)

export const Chart = (p) => (
  <S {...p}>
    <path d="M3.5 20.5h17" />
    <path d="M6.5 20v-6M12 20V7.5M17.5 20v-9.5" />
  </S>
)

export const Sliders = (p) => (
  <S {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    <circle cx="9.5" cy="6.5" r="2" fill="var(--sidebar, #0b0d13)" />
    <circle cx="15" cy="12" r="2" fill="var(--sidebar, #0b0d13)" />
    <circle cx="7.5" cy="17.5" r="2" fill="var(--sidebar, #0b0d13)" />
  </S>
)

export const Search = (p) => (
  <S {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.8 15.8 21 21" />
  </S>
)

export const Bell = (p) => (
  <S {...p}>
    <path d="M6.3 9.5a5.7 5.7 0 0 1 11.4 0c0 4.6 1.8 5.8 1.8 5.8H4.5s1.8-1.2 1.8-5.8" />
    <path d="M10.4 18.8a1.7 1.7 0 0 0 3.2 0" />
  </S>
)

export const Clock = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </S>
)

export const Alert = (p) => (
  <S {...p}>
    <path d="M12 4.2 20.6 19a1.4 1.4 0 0 1-1.2 2.1H4.6A1.4 1.4 0 0 1 3.4 19z" />
    <path d="M12 10v4.5M12 17.6h.01" />
  </S>
)

export const CheckCircle = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.4 12.4l2.5 2.5 4.7-5" />
  </S>
)

export const XMark = (p) => (
  <S {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </S>
)

export const ArrowRight = (p) => (
  <S {...p}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />
  </S>
)

export const Download = (p) => (
  <S {...p}>
    <path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </S>
)

export const Bolt = (p) => (
  <S {...p}>
    <path d="M13 3 5.2 13.4h4.6L11 21l7.8-10.4h-4.6z" />
  </S>
)

export const Doc = (p) => (
  <S {...p}>
    <path d="M7 3.5h7l4 4v13H7z" />
    <path d="M14 3.5v4h4M10 12.5h5M10 16h5" />
  </S>
)
