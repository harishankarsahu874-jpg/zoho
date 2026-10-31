import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { clearSession, getUser, setSession } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Timetable from './pages/Timetable.jsx'
import Bookings from './pages/Bookings.jsx'
import Exams from './pages/Exams.jsx'
import Changes from './pages/Changes.jsx'
import Admin from './pages/Admin.jsx'
import Assistant from './pages/Assistant.jsx'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

const TITLES = {
  '/': 'Dashboard',
  '/timetable': 'Timetable',
  '/bookings': 'Fest Week Bookings',
  '/exams': 'Midsem Exams',
  '/changes': 'Changes & Disruptions',
  '/admin': 'Admin',
  '/assistant': 'AI Assistant',
}

function Shell({ children, user }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
  }, [])
  const loc = useLocation()
  const title = TITLES[loc.pathname] || 'CrunchWeek'
  const navigate = useNavigate()

  const sections = [
    { name: 'Overview', items: [
      { to: '/', label: 'Dashboard', ic: '▦' },
    ]},
    { name: 'Schedule', items: [
      { to: '/timetable', label: 'Timetable', ic: '🗓' },
      { to: '/bookings', label: 'Fest Week', ic: '🎪' },
      { to: '/exams', label: 'Exams', ic: '📝' },
    ]},
    { name: 'Workflow', items: [
      { to: '/changes', label: 'Changes', ic: '⚙' },
      { to: '/assistant', label: 'AI Assistant', ic: '✦' },
    ]},
    { name: 'Manage', items: [
      { to: '/admin', label: 'Admin', ic: '🛡' },
    ], roles: ['admin'] },
  ]

  return (
    <ToastCtx.Provider value={push}>
      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <div className="mark">CW</div>
            <div>
              <div className="name">CrunchWeek</div>
              <div className="sub">CIT campus scheduling</div>
            </div>
          </div>
          <nav className="nav">
            {sections.filter((s) => !s.roles || s.roles.includes(user?.role)).map((s) => (
              <React.Fragment key={s.name}>
                <div className="sec">{s.name}</div>
                {s.items.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.to === '/'}>
                    <span className="ic">{l.ic}</span> {l.label}
                  </NavLink>
                ))}
              </React.Fragment>
            ))}
          </nav>
          <div className="user">
            <div className="nm">{user?.name}</div>
            <div className="small muted" style={{ color: '#8b96ad' }}>{user?.email}</div>
            <span className="rl">{user?.role}</span>
            <button
              className="btn ghost sm"
              style={{ color: '#aab4c8', marginTop: 8 }}
              onClick={() => { clearSession(); navigate('/login') }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <h1>{title}</h1>
            <div className="spacer" />
            <span className="badge muted">cit-public-v1</span>
          </div>
          <div className="content">{children}</div>
        </div>
        <div className="toast-host">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : 'ok'}`}>{t.text}</div>
          ))}
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
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
