// TESSERA icon set — minimal 1.7-stroke icons on a 24px grid, currentColor.
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
  <S {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></S>
)
export const Mosaic = (p) => (
  <S {...p}><rect x="3.5" y="3.5" width="10" height="7" rx="1.2" /><rect x="15.5" y="3.5" width="5" height="12" rx="1.2" />
    <rect x="3.5" y="12.5" width="5" height="8" rx="1.2" /><rect x="10.5" y="12.5" width="10" height="8" rx="1.2" /></S>
)
export const Compass = (p) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5 13.2 13.2 8.5 15.5l2.3-4.7z" /></S>
)
export const Matrix = (p) => (
  <S {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="1.6" /><path d="M3.5 9.2h17M3.5 14.9h17M9.2 3.5v17M14.9 3.5v17" /></S>
)
export const Users = (p) => (
  <S {...p}><circle cx="9" cy="8.5" r="3.4" /><path d="M3.5 20c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5" />
    <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 15.4c2 .7 3.2 2.3 3.5 4.6" /></S>
)
export const Bookmark = (p) => (
  <S {...p}><path d="M6.5 3.5h11V21L12 16.8 6.5 21z" /></S>
)
export const Sparkle = (p) => (
  <S {...p}><path d="M11 4l1.7 4.8 4.8 1.7-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7z" />
    <path d="M18.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" /></S>
)
export const Chart = (p) => (
  <S {...p}><path d="M3.5 20.5h17" /><path d="M6.5 20v-6M12 20V7.5M17.5 20v-9.5" /></S>
)
export const Building = (p) => (
  <S {...p}><path d="M4.5 21V8.5L12 4l7.5 4.5V21" /><path d="M2.5 21h19" /><path d="M9.5 21v-4.5h5V21" />
    <path d="M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2" /></S>
)
export const Cap = (p) => (
  <S {...p}><path d="M2.5 9.8 12 4.8l9.5 5-9.5 5z" /><path d="M6.5 12.2v3.6c0 1.7 2.5 3.2 5.5 3.2s5.5-1.5 5.5-3.2v-3.6" />
    <path d="M21.5 9.8v4.7" /></S>
)
export const Sliders = (p) => (
  <S {...p}><path d="M4 6.5h16M4 12h16M4 17.5h16" /><circle cx="9.5" cy="6.5" r="2" fill="var(--paper,#F1EEE6)" />
    <circle cx="15" cy="12" r="2" fill="var(--paper,#F1EEE6)" /><circle cx="7.5" cy="17.5" r="2" fill="var(--paper,#F1EEE6)" /></S>
)
export const Search = (p) => (
  <S {...p}><circle cx="11" cy="11" r="6.5" /><path d="M15.8 15.8 21 21" /></S>
)
export const Bell = (p) => (
  <S {...p}><path d="M6.3 9.5a5.7 5.7 0 0 1 11.4 0c0 4.6 1.8 5.8 1.8 5.8H4.5s1.8-1.2 1.8-5.8" /><path d="M10.4 18.8a1.7 1.7 0 0 0 3.2 0" /></S>
)
export const Clock = (p) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>
)
export const Alert = (p) => (
  <S {...p}><path d="M12 4.2 20.6 19a1.4 1.4 0 0 1-1.2 2.1H4.6A1.4 1.4 0 0 1 3.4 19z" /><path d="M12 10v4.5M12 17.6h.01" /></S>
)
export const Check = (p) => (
  <S {...p}><path d="M5 12.8l4.5 4.5L19 7.5" /></S>
)
export const CheckCircle = (p) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.4 12.4l2.5 2.5 4.7-5" /></S>
)
export const XMark = (p) => (
  <S {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></S>
)
export const ArrowRight = (p) => (
  <S {...p}><path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" /></S>
)
export const ArrowUpRight = (p) => (
  <S {...p}><path d="M7 17 17 7M9 7h8v8" /></S>
)
export const Chevron = ({ dir = 'right', ...p }) => (
  <S {...p}>{dir === 'right' ? <path d="M9 5.5 15.5 12 9 18.5" /> : dir === 'left' ? <path d="M15 5.5 8.5 12 15 18.5" />
    : dir === 'down' ? <path d="M5.5 9 12 15.5 18.5 9" /> : <path d="M5.5 15 12 8.5 18.5 15" />}</S>
)
export const Collapse = (p) => (
  <S {...p}><rect x="3.5" y="4" width="17" height="16" rx="1.8" /><path d="M9.5 4v16M6.5 12h.01M6.5 9h.01M6.5 15h.01" /></S>
)
export const Pin = (p) => (
  <S {...p}><path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 0 1 13 0c0 4.6-6.5 10-6.5 10z" /><circle cx="12" cy="10.6" r="2.3" /></S>
)
export const Filter = (p) => (
  <S {...p}><path d="M4 5.5h16L14.5 12v6l-5 2.5V12z" /></S>
)
export const Plus = (p) => (
  <S {...p}><path d="M12 5v14M5 12h14" /></S>
)
export const Link = (p) => (
  <S {...p}><path d="M9.5 14.5 14.5 9.5" /><path d="M11 6.5 12.8 4.7a4 4 0 0 1 5.6 5.6L16.5 12.1" />
    <path d="M13 17.5l-1.8 1.8a4 4 0 0 1-5.6-5.6l1.9-1.8" /></S>
)
export const Layers = (p) => (
  <S {...p}><path d="M12 3.5 21 8.5 12 13.5 3 8.5z" /><path d="M4.5 12.5 12 16.7l7.5-4.2" /><path d="M4.5 16.5 12 20.7l7.5-4.2" /></S>
)
export const Eye = (p) => (
  <S {...p}><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></S>
)
export const Download = (p) => (
  <S {...p}><path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></S>
)
export const Bolt = (p) => (
  <S {...p}><path d="M13 3 5.2 13.4h4.6L11 21l7.8-10.4h-4.6z" /></S>
)
export const Doc = (p) => (
  <S {...p}><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M10 12.5h5M10 16h5" /></S>
)
export const Star = (p) => (
  <S {...p}><path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" /></S>
)
export const Shuffle = (p) => (
  <S {...p}><path d="M3 7h5l8 10h5" /><path d="M3 17h5l8-10h5" /><path d="M18.5 4.5 21.5 7l-3 2.5" /><path d="M18.5 14.5l3 2.5-3 2.5" /></S>
)
export const Calendar = (p) => (
  <S {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4" /></S>
)
export const Menu = (p) => (
  <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>
)
export const Drag = (p) => (
  <S {...p}><path d="M12 3v18M3 12h18" /><path d="M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5" /></S>
)
export const Info = (p) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.6h.01" /></S>
)
