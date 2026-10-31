import React, { createContext, useCallback, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { clearSession, getUser, setSession, api } from './api.js'
import * as I from './icons.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Timetable from './pages/Timetable.jsx'
import Exams from './pages/Exams.jsx'
import Rooms from './pages/Rooms.jsx'
import Bookings from './pages/Bookings.jsx'
import Changes from './pages/Changes.jsx'
import Assistant from './pages/Assistant.jsx'
import Groups from './pages/Groups.jsx'
import Admin from './pages/Admin.jsx'
import Settings from './pages/Settings.jsx'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

/** Page header — big on the Overview page, compact elsewhere. */
export function Hero({ eyebrow, title, sub, compact, children }) {
  return (
    <div className={`hero ${compact ? 'compact' : ''}`}>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Overview', icon: I.Grid, end: true },
  { to: '/timetable', label: 'Timetable', icon: I.Calendar },
  { to: '/exams', label: 'Examinations', icon: I.Cap },
  { to: '/rooms', label: 'Venue Management', icon: I.Building },
  { to: '/bookings', label: 'Spectra Week', icon: I.Star },
  { to: '/changes', label: 'Rescheduling', icon: I.Shuffle },
  { to: '/assistant', label: 'AI Assistant', icon: I.Sparkle },
  { to: '/groups', label: 'Faculty & Groups', icon: I.Users },
  { to: '/admin', label: 'Reports & Export', icon: I.Chart, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: I.Sliders, roles: ['admin'] },
]

function Shell({ children, user }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
  }, [])
  const loc = useLocation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false)
  const [pending, setPending] = useState(0)

  const item = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))
  useEffect(() => { setMenu(false) }, [loc.pathname])
  useEffect(() => {
    if (loc.pathname === '/timetable') setQ(sp.get('q') || '')
  }, [loc.pathname, sp])

  // pending approvals → bell badge
  useEffect(() => {
    api('/dashboard').then((d) => {
      setPending((d.pending?.bookings || 0) + (d.pending?.changes || 0))
    }).catch(() => {})
  }, [loc.pathname])

  const doSearch = (e) => {
    e.preventDefault()
    const v = q.trim()
    navigate(v ? `/timetable?q=${encodeURIComponent(v)}` : '/timetable')
  }

  const role = (user?.role || '').replace(/_/g, ' ')

  return (
    <ToastCtx.Provider value={push}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="ct">CIT</div>
            <div className="sub">Chilika Institute of Technology · Campus Operations</div>
          </div>
          <nav className="nav">
            {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="ic"><n.icon /></span> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="foot">
            <span className="fmark">✦</span>
            <span><span className="v">CrunchWeek 4.0</span><br />CIT Scheduling Platform</span>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <span className="crumb">{item ? item.label : 'CrunchWeek'}</span>
            <form className="search" onSubmit={doSearch}>
              <span className="sicon"><I.Search size={15} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search rooms / sessions… (opens Timetable)" />
            </form>
            <span className="spacer" />
            <button className="icon-btn" title="Pending approvals" onClick={() => navigate('/bookings')}>
              <I.Bell size={17} />
              {pending > 0 && <span className="dot txt">{pending}</span>}
            </button>
            <div style={{ position: 'relative' }}>
              <button className="userchip" onClick={() => setMenu(!menu)}>
                <span className="avatar">{((user?.name || user?.email || 'U')[0] || 'U').toUpperCase()}</span>
                <span style={{ textTransform: 'capitalize' }}>{role}</span>
                <span className="caret">▼</span>
              </button>
              {menu && (
                <div className="usermenu">
                  <div className="um-hd">
                    <div className="nm">{user?.name}</div>
                    <div className="em">{user?.email}</div>
                  </div>
                  <button className="out" onClick={() => { clearSession(); navigate('/login') }}>
                    <I.XMark size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="content">{children}</div>
          <div className="toast-host">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : 'ok'}`}>{t.text}</div>
            ))}
          </div>
        </div>
      </div>
    </ToastCtx.Provider>
  )
}

export default function App() {
  const [user, setUser] = useState(getUser())
  useEffect(() => {
    // The api client fires this when a request comes back 401 (stale token):
    // clearing `user` drops the shell back onto the login route.
    const onExpired = () => setUser(null)
    window.addEventListener('cw:auth-expired', onExpired)
    return () => window.removeEventListener('cw:auth-expired', onExpired)
  }, [])
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={(t, u) => { setSession(t, u); setUser(u) }} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  return (
    <Shell user={user}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={user.role === 'admin' ? <Settings /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
