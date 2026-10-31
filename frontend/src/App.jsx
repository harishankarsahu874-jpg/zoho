// TESSERA — application shell.
// Collapsible sidebar, topbar (breadcrumb / search / notifications /
// academic period / profile), shared data context, toasts, mobile drawer.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { clearSession, getUser, setSession } from './api.js'
import { Tessera, Wordmark, TesseraLoader, TesseraEmpty } from './tessera.jsx'
import * as I from './icons.jsx'
import * as S from './services.jsx'
import { FEST_WEEK, INSTITUTE, DATASET_ID } from './data/campus.js'
import Login from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import Mosaic from './pages/Mosaic.jsx'
import Discovery from './pages/Discovery.jsx'
import Availability from './pages/Availability.jsx'
import People from './pages/People.jsx'
import Bookings from './pages/Bookings.jsx'
import Intelligence from './pages/Intelligence.jsx'
import Reports from './pages/Reports.jsx'
import Departments from './pages/Departments.jsx'
import Groups from './pages/Groups.jsx'
import Locations from './pages/Locations.jsx'
import Settings from './pages/Settings.jsx'

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

// ---------------------------------------------------------------- shared data
// Loads /reference + /dashboard + week grid once; every operational page
// reads from here. All values are backend-validated API responses.
const DataCtx = createContext(null)
export const useData = () => useContext(DataCtx)

function DataProvider({ children }) {
  const [state, setState] = useState({
    loading: true, error: null, ref: null, week: null,
    placements: [], festBookings: [], occupancy: null, dashboard: null,
  })
  const load = useCallback(async () => {
    try {
      const [ref, dash] = await Promise.all([S.getReference(), S.getDashboard()])
      S.setSessionMeta(ref)
      let week = null, placements = [], festBookings = []
      try {
        week = await S.getTimetableWeek()
        placements = S.placementsFromWeekGrid(week)
        festBookings = S.bookingsFromWeekGrid(week)
      } catch { /* timetable not generated yet — reference still usable */ }
      const occupancy = S.buildOccupancy(placements, festBookings)
      setState({ loading: false, error: null, ref, week, placements,
                 festBookings, occupancy, dashboard: dash })
      return true
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Failed to load data' }))
      return false
    }
  }, [])
  useEffect(() => { load() }, [load])
  const value = useMemo(() => ({ ...state, reload: load }), [state, load])
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

// ---------------------------------------------------------------- navigation
const NAV_MAIN = [
  { to: '/', label: 'Overview', icon: I.Grid, end: true },
  { to: '/board', label: 'Mosaic Board', icon: I.Mosaic },
  { to: '/discovery', label: 'Resource Discovery', icon: I.Compass },
  { to: '/availability', label: 'Availability', icon: I.Matrix },
  { to: '/people', label: 'People & Faculty', icon: I.Users },
  { to: '/bookings', label: 'Bookings', icon: I.Bookmark },
  { to: '/intelligence', label: 'TESSERA Intelligence', icon: I.Sparkle },
  { to: '/reports', label: 'Reports & Analytics', icon: I.Chart },
]
const NAV_MGMT = [
  { to: '/departments', label: 'Departments', icon: I.Building },
  { to: '/groups', label: 'Academic Groups', icon: I.Layers },
  { to: '/locations', label: 'Locations', icon: I.Pin },
  { to: '/settings', label: 'Settings', icon: I.Sliders, admin: true },
]

function NavGroup({ title, items, user }) {
  return (
    <>
      <div className="ngroup">{title}</div>
      {items.filter((n) => !n.admin || user?.role === 'admin').map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} title={n.label}>
          <span className="ic"><n.icon /></span> {n.label}
        </NavLink>
      ))}
    </>
  )
}

// ---------------------------------------------------------------- search index
function useSearchIndex(data) {
  const q = data?.q || ''
  return useMemo(() => {
    if (q.trim().length < 2) return []
    const t = q.trim().toLowerCase()
    const hits = []
    for (const r of Object.values(S.roomById))
      if (`${r.id} ${r.name} ${r.building} ${r.type}`.toLowerCase().includes(t))
        hits.push({ kind: 'Space', id: r.id, title: r.name, sub: `${r.id} · ${r.building}`, to: `/discovery?room=${r.id}` })
    for (const f of Object.values(S.facById))
      if (`${f.id} ${f.name} ${f.department}`.toLowerCase().includes(t))
        hits.push({ kind: 'Faculty', id: f.id, title: f.name, sub: `${f.id} · ${f.department}`, to: `/people?id=${f.id}` })
    for (const g of Object.values(S.groupById))
      if (`${g.id} ${g.name}`.toLowerCase().includes(t))
        hits.push({ kind: 'Group', id: g.id, title: g.name, sub: g.id, to: `/board?group=${g.id}` })
    if (data?.ref?.sessions)
      for (const s of data.ref.sessions)
        if (`${s.id} ${s.course}`.toLowerCase().includes(t) && hits.length < 9)
          hits.push({ kind: 'Session', id: s.id, title: S.courseName(s.course) || s.course, sub: s.id, to: `/board?session=${s.id}` })
    return hits.slice(0, 8)
  }, [q, data?.ref])
}

// ---------------------------------------------------------------- shell
function Shell({ user, onSignOut, children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200)
  }, [])

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cw_side') === '1')
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const [bell, setBell] = useState(false)
  const [q, setQ] = useState('')
  const loc = useLocation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()

  const data = useData()
  const hits = useSearchIndex({ q, ref: data?.ref })

  const toggleSide = () => setCollapsed((c) => {
    localStorage.setItem('cw_side', c ? '0' : '1')
    return !c
  })

  const item = [...NAV_MAIN, ...NAV_MGMT].find((n) =>
    n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to))

  useEffect(() => { setMenu(false); setBell(false); setDrawer(false) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setBell(false); setDrawer(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dash = data?.dashboard || {}
  const pending = (dash.pending?.bookings || 0) + (dash.pending?.changes || 0)

  const go = (to) => { setQ(''); navigate(to) }

  return (
    <ToastCtx.Provider value={push}>
      <div className={`app ${collapsed ? 'side-collapsed' : ''} ${drawer ? 'side-open' : ''}`}>
        <aside className="sidebar">
          <div className="brand" title="TESSERA">
            <Wordmark size={26} light />
          </div>
          <nav className="nav">
            <NavGroup title="Main" items={NAV_MAIN} user={user} />
            <NavGroup title="Manage" items={NAV_MGMT} user={user} />
          </nav>
          <div className="sfoot">
            <div className="fsite" title={INSTITUTE}>
              <I.Pin size={12} /><span>{INSTITUTE}</span>
            </div>
            <button className="collapse-btn" onClick={toggleSide}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <I.Collapse size={16} />
            </button>
          </div>
        </aside>
        {drawer && <div className="backdrop" onClick={() => setDrawer(false)} />}

        <div className="main">
          <div className="topbar">
            <button className="icon-btn burger" onClick={() => setDrawer(true)} title="Menu">
              <I.Menu size={17} />
            </button>
            <span className="crumb">
              {item?.label || 'TESSERA'}
              <span className="ctx">{DATASET_ID} · {FEST_WEEK}</span>
            </span>
            <div className="search">
              <span className="sicon"><I.Search size={14} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search spaces, faculty, groups, sessions…"
                aria-label="Search" />
              {hits.length > 0 && (
                <div className="search-pop">
                  {hits.map((h, i) => (
                    <button key={h.kind + h.id + i} onClick={() => go(h.to)}>
                      <span className="sp-kind">{h.kind}</span>
                      <span className="sp-t">{h.title}</span>
                      <span className="sp-s">{h.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="spacer" />
            <span className="period-chip" title={`Academic period · ${FEST_WEEK}`}>
              {dash.timetable_generated ? 'Timetable live' : 'Awaiting timetable'}
            </span>
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" title="Pending decisions" onClick={() => setBell(!bell)}>
                <I.Bell size={16} />
                {pending > 0 && <span className="dot">{pending}</span>}
              </button>
              {bell && (
                <div className="usermenu bellmenu">
                  <div className="um-hd">
                    <div className="nm">Decisions waiting</div>
                    <div className="em">Coordinators &amp; admins</div>
                  </div>
                  <button onClick={() => go('/bookings')}>
                    <I.Bookmark size={15} />
                    <span>{dash.pending?.bookings || 0} booking requests pending</span>
                  </button>
                  <button onClick={() => go('/reports')}>
                    <I.Shuffle size={15} />
                    <span>{dash.pending?.changes || 0} change requests pending</span>
                  </button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="userchip" onClick={() => setMenu(!menu)} title={user?.email}>
                <span className="avatar">{S.initials(user?.name)}</span>
                <span>{user?.name?.split(' ')[0] || user?.email}</span>
                <span className="caret">▼</span>
              </button>
              {menu && (
                <div className="usermenu">
                  <div className="um-hd">
                    <div className="nm">{user?.name}</div>
                    <div className="em">{user?.email} · {String(user?.role || '').replace(/_/g, ' ')}</div>
                  </div>
                  <button className="out" onClick={() => { clearSession(); onSignOut() }}>
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

// ---------------------------------------------------------------- not found
function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="card">
      <TesseraEmpty title="Page not found"
        sub="This tile is not part of the mosaic."
        action={<button className="btn primary sm" onClick={() => navigate('/')}>
          <I.ArrowRight size={14} /> Back to Overview
        </button>} />
    </div>
  )
}

// ---------------------------------------------------------------- hero
/** Editorial page header. `title` may contain <em> markup via node children. */
export function Hero({ eyebrow, title, sub, compact, children }) {
  return (
    <div className={`hero ${compact ? 'compact' : ''}`}>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="h1">{title}</h1>
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- app
export default function App() {
  const [user, setUser] = useState(getUser())

  useEffect(() => {
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
    <DataProvider>
      <Shell user={user}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Overview />} />
          <Route path="/board" element={<Mosaic />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="/people" element={<People />} />
          <Route path="/bookings" element={<Bookings user={user} />} />
          <Route path="/intelligence" element={<Intelligence user={user} />} />
          <Route path="/reports" element={<Reports user={user} />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/settings" element={user.role === 'admin' ? <Settings user={user} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </DataProvider>
  )
}
