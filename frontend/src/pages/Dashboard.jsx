import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUser } from '../api.js'
import { Hero, useToast } from '../App.jsx'
import * as I from '../icons.jsx'
import DecideModal from './DecideModal.jsx'

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]
const TINTS = ['c0', 'c1', 'c2', 'c3', 'c4']
const tintOf = (s) => {
  let h = 0
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % 5]
}
const LEGEND_COLORS = { Classrooms: '#8b5cf6', 'Lecture Halls': '#a78bfa', Labs: '#c4b5fd', Others: '#ddd6fe' }

export default function Dashboard() {
  const toast = useToast()
  const user = getUser()
  const [d, setD] = useState(null)
  const [tt, setTt] = useState(null)
  const [refs, setRefs] = useState(null)
  const [bk, setBk] = useState(null)
  const [chg, setChg] = useState(null)
  const [audit, setAudit] = useState([])
  const [decideFor, setDecideFor] = useState(null)
  const [err, setErr] = useState('')

  const load = () => {
    api('/dashboard').then(setD).catch((e) => setErr(e.message))
    api('/timetable?view=week').then(setTt).catch(() => {})
    api('/reference').then(setRefs).catch(() => {})
    api('/bookings').then(setBk).catch(() => {})
    api('/changes').then(setChg).catch(() => {})
    api('/admin/audit?limit=8').then((r) => setAudit(r.entries || [])).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const pendingBk = useMemo(
    () => (bk?.bookings || []).filter((b) => b.decision.status === 'pending'), [bk])
  const pendingChg = useMemo(
    () => (chg?.changes || []).filter((c) => c.status === 'pending'), [chg])

  // day × period → courses (for the overview mini-grid)
  const cells = useMemo(() => {
    const m = {}
    for (const [key, items] of Object.entries(tt?.sessions || {})) {
      const [day, pstr] = key.split('|P')
      const p = parseInt(pstr, 10)
      if (p > 8) continue
      for (const it of items) {
        const course = refs?.sessions?.find((s) => s.id === it.sid)?.course || it.sid
        m[`${day}|${p}`] ??= []
        if (!m[`${day}|${p}`].some((x) => x.course === course)) m[`${day}|${p}`].push({ course })
      }
    }
    return m
  }, [tt, refs])

  const rejectBooking = async (b) => {
    try {
      await api(`/bookings/${b.decision.request_id}/decide`, { method: 'POST',
        body: { status: 'rejected', reason: 'Rejected from dashboard review.' } })
      toast(`Rejected ${b.decision.request_id}.`)
      load()
    } catch (e) { toast(e.detail?.blocker || e.message, 'err') }
  }

  if (err) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!d) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const c = d.counts
  const catOf = (r) => {
    const t = r.type || ''
    if (t.includes('lab')) return 'Labs'
    if (t.includes('hall') || t === 'auditorium') return 'Lecture Halls'
    if (t.includes('class') || r.id.startsWith('CR')) return 'Classrooms'
    return 'Others'
  }
  const catStats = { Classrooms: { u: 0, m: 0 }, 'Lecture Halls': { u: 0, m: 0 }, Labs: { u: 0, m: 0 }, Others: { u: 0, m: 0 } }
  ;(refs?.rooms || []).forEach((r) => { catStats[catOf(r)].m += 45 })
  ;(d.room_utilisation?.per_room || []).forEach((p) => {
    const r = (refs?.rooms || []).find((x) => x.id === p.room)
    if (r) catStats[catOf(r)].u += p.used_periods
  })
  const catPct = (k) => Math.min(100, Math.round(100 * catStats[k].u / Math.max(catStats[k].m, 1)))
  const overall = d.room_utilisation?.overall ?? 0
  const critical = (d.conflicts?.hard || 0) > 0 || (d.exams?.soft || 0) > 0 ? 1 : 0
  const canDecide = ['admin', 'department_coordinator'].includes(user?.role)
  const feed = audit.slice(0, 6).map((a) => ({
    t: a.at ? new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    actor: (a.actor || '').split('@')[0],
    action: (a.action || '').replace(/\./g, ' '),
    detail: a.detail ? JSON.stringify(a.detail) : '',
  }))

  return (
    <div>
      <Hero eyebrow="Campus Operations" title="Schedule. Manage. Resolve."
        sub="Centralised control for academic scheduling and venue management at CIT." />

      {!d.timetable_generated && (
        <div className="banner">
          <span style={{ fontSize: 19 }}>🗓</span>
          <span>
            <b>No timetable yet.</b> Ask an admin to generate one —
            <Link to="/admin"> open Reports &amp; Export → Generate timetable</Link>.
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid cols-kpi mb">
        <div className="card kpi"><span className="ki"><I.Calendar size={20} /></span>
          <div><div className="n">{c.sessions}</div><div className="l">Total Sessions</div></div></div>
        <div className="card kpi"><span className="ki"><I.Building size={20} /></span>
          <div><div className="n">{c.rooms}</div><div className="l">Total Rooms</div></div></div>
        <div className="card kpi"><span className="ki"><I.Users size={20} /></span>
          <div><div className="n">{c.faculty}</div><div className="l">Faculty Members</div></div></div>
        <div className="card kpi"><span className="ki"><I.Cap size={20} /></span>
          <div><div className="n">{c.groups}</div><div className="l">Student Groups</div></div></div>
      </div>

      {/* schedule overview + right column */}
      <div className="grid cols-main mb">
        <div className="card">
          <div className="hd">
            <h3>Academic Schedule Overview</h3>
            <Link to="/timetable">View Full Timetable <I.ArrowRight size={13} /></Link>
          </div>
          <div className="mini">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Day</th>
                  {PERIODS.map((p) => (
                    <th key={p}>P{p}<span className="ph">{`${8 + p - 1}:00–${8 + p}:00`}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(tt?.days || ['MON', 'TUE', 'WED', 'THU', 'FRI']).map((day) => (
                  <tr key={day}>
                    <td className="dh">{day}</td>
                    {PERIODS.map((p) => {
                      const items = cells[`${day}|${p}`] || []
                      return (
                        <td key={p}>
                          {items.slice(0, 3).map((x, i) => (
                            <span key={i} className={`mchip ${tintOf(x.course)}`}>{x.course}</span>
                          ))}
                          {items.length > 3 && <span className="mchip more">+{items.length - 3}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="hd">
              <h3>Pending Approvals</h3>
              <Link to={pendingBk.length ? '/bookings' : '/changes'}>View All <I.ArrowRight size={13} /></Link>
            </div>
            {pendingBk.length === 0 && pendingChg.length === 0 ? (
              <div className="empty" style={{ padding: '22px 10px' }}>
                <div className="eic"><I.CheckCircle size={30} /></div>
                All caught up — no pending approvals.
              </div>
            ) : (
              <div>
                {pendingBk.slice(0, 2).map((b) => (
                  <div key={b.decision.request_id} className="appr">
                    <span className="ai purple"><I.Calendar size={17} /></span>
                    <div>
                      <div className="tt">Venue Booking Request</div>
                      <div className="st">{b.request.title || b.decision.request_id} · {b.request.attendance} pax</div>
                    </div>
                    <div className="aa">
                      {canDecide && <button className="btn primary sm" onClick={() => setDecideFor(b)}>Approve</button>}
                      {canDecide && <button className="btn sm" onClick={() => rejectBooking(b)}>Reject</button>}
                      {!canDecide && <span className="badge muted">awaiting decision</span>}
                    </div>
                  </div>
                ))}
                {pendingChg.slice(0, 2).map((cc) => (
                  <div key={cc.id} className="appr">
                    <span className="ai blue"><I.Shuffle size={17} /></span>
                    <div>
                      <div className="tt">Timetable Change</div>
                      <div className="st">#{cc.id} · by {(cc.created_by || '').split('@')[0]}</div>
                    </div>
                    <div className="aa"><Link className="btn sm" to="/changes">Review</Link></div>
                  </div>
                ))}
                {pendingBk.length + pendingChg.length > 4 && (
                  <div className="small muted" style={{ padding: '10px 0 0' }}>
                    +{pendingBk.length + pendingChg.length - 4} more in the queues
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="hd">
              <h3>Spectra Week Overview</h3>
              <Link to="/bookings">View Details <I.ArrowRight size={13} /></Link>
            </div>
            <div className="fest">
              <span className="fmark"><I.Star size={26} /></span>
              <div><div className="fn">SPECTRA</div><div className="fs">TECH FEST</div></div>
            </div>
            <div className="fest-rows">
              <div className="fest-row"><span>Total Requests</span><span className="fv">{c.bookings}</span></div>
              <div className="fest-row"><span>Pending</span><span className="fv">{pendingBk.length}</span></div>
              <div className="fest-row"><span>Approved</span><span className="fv" style={{ color: 'var(--ok)' }}>{d.bookings?.approved ?? 0}</span></div>
              <div className="fest-row"><span>Alternatives</span><span className="fv" style={{ color: 'var(--warn)' }}>{d.bookings?.alternative_offered ?? 0}</span></div>
              <div className="fest-row"><span>Rejected</span><span className="fv" style={{ color: 'var(--bad)' }}>{d.bookings?.rejected ?? 0}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* bottom row */}
      <div className="grid cols-3">
        <div className="card">
          <div className="hd">
            <h3>Conflict &amp; Disruption Centre</h3>
            <Link to="/changes">View All <I.ArrowRight size={13} /></Link>
          </div>
          <div className="tiles">
            <div className="tile">
              <span className="ti" style={{ background: d.conflicts?.hard ? 'var(--bad-soft)' : 'var(--ok-soft)', color: d.conflicts?.hard ? 'var(--bad)' : 'var(--ok)' }}><I.Alert size={16} /></span>
              <div className="tn">{d.conflicts?.hard ?? '—'}</div><div className="tl">Conflicts</div>
            </div>
            <div className="tile">
              <span className="ti" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><I.Clock size={16} /></span>
              <div className="tn">{d.soft_penalty ?? '—'}</div><div className="tl">Soft Penalties</div>
            </div>
            <div className="tile">
              <span className="ti" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}><I.Shuffle size={16} /></span>
              <div className="tn">{d.pending?.changes ?? 0}</div><div className="tl">Pending Reschedule</div>
            </div>
            <div className="tile">
              <span className="ti" style={{ background: critical ? 'var(--bad-soft)' : 'var(--ok-soft)', color: critical ? 'var(--bad)' : 'var(--ok)' }}><I.CheckCircle size={16} /></span>
              <div className="tn">{critical}</div><div className="tl">Critical Issues</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h3>Room Utilisation</h3>
            <span className="badge muted" style={{ marginLeft: 'auto' }}>This Week</span>
          </div>
          <div className="donut-wrap">
            <Donut pct={overall} />
            <div className="legend">
              {Object.entries(catStats).map(([k]) => (
                <div className="lg" key={k}>
                  <span className="sw" style={{ background: LEGEND_COLORS[k] }} />
                  {k}
                  <span className="lv">{catPct(k)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd">
            <h3>Recent Activities</h3>
            {user?.role === 'admin' && <Link to="/admin">View All <I.ArrowRight size={13} /></Link>}
          </div>
          {feed.length === 0 ? (
            <div className="empty" style={{ padding: '26px 10px' }}>No recent activity.</div>
          ) : (
            <div className="feed">
              {feed.map((f, i) => (
                <div key={i} className="fitem">
                  <span className="fdot" />
                  <span className="ftime">{f.t}</span>
                  <span className="ftxt">
                    <b>{f.actor}</b> {f.action}
                    {f.detail ? ` · ${f.detail.slice(0, 30)}${f.detail.length > 30 ? '…' : ''}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {decideFor && (
        <DecideModal booking={decideFor} refdata={refs} user={user}
          onClose={() => setDecideFor(null)} onDone={() => { setDecideFor(null); load() }} />
      )}
    </div>
  )
}

function Donut({ pct }) {
  const R = 40
  const C = 2 * Math.PI * R
  const len = (Math.max(0, Math.min(100, pct || 0)) / 100) * C
  return (
    <svg width="148" height="148" viewBox="0 0 100 100" style={{ flex: '0 0 148px' }}>
      <circle cx="50" cy="50" r={R} fill="none" stroke="#eef0f4" strokeWidth="11" />
      <circle cx="50" cy="50" r={R} fill="none" stroke="#7c3aed" strokeWidth="11"
        strokeDasharray={`${len} ${C - len}`} transform="rotate(-90 50 50)" strokeLinecap="round" />
      <text x="50" y="49" textAnchor="middle" fontSize="19" fontWeight="800" fill="#0f172a">{Math.round(pct || 0)}%</text>
      <text x="50" y="61" textAnchor="middle" fontSize="7.5" fill="#94a3b8">Overall</text>
    </svg>
  )
}
