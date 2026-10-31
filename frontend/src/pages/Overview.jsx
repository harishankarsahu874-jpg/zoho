// TESSERA Overview — the editorial command centre.
// Big serif statement, live stats, today's tiles, featured spaces,
// real activity (audit log) and alerts.
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import { Tessera } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { INSTITUTE, FEST_WEEK, ROOMS } from '../data/campus.js'
const roomById = S.roomById

const DAY_FULL = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' }
function todayIdx(days = ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
  const now = new Date().getDay() // 0 Sun .. 6 Sat
  const map = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI' }
  const d = map[now]
  return days.includes(d) ? days.indexOf(d) : 0
}

const ACTION_TXT = {
  'booking.created': (d) => `booking request “${d.title}” submitted`,
  'booking.decided': (d) => `booking ${d.request_id} decided (${d.status})`,
  'change.submitted': (d) => `change request #${d.change_id} submitted`,
  'change.decided': (d) => `change #${d.change_id} ${d.status}`,
  'ai.ask': (d) => `asked the assistant: “${(d.question || '').slice(0, 60)}”`,
  'ai.change_requested': (d) => `AI-parsed change #${d.change_id} recorded`,
  'admin.generate': () => 'timetable generated',
  'admin.export': () => 'schedule exported',
  'admin.reset': () => 'demo data reset',
  'admin.priority': () => 'priority order updated',
}

export default function Overview() {
  const data = useData()
  const dash = data?.dashboard
  const [audit, setAudit] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    S.adminAudit(14).then((r) => setAudit(r.entries || [])).catch((e) => setErr(e.message))
  }, [])

  const tIdx = todayIdx(data?.ref?.days)
  const day = data?.ref?.days?.[tIdx]

  const todays = useMemo(() =>
    (data?.placements || []).filter((p) => p.day === day)
      .sort((a, b) => a.start - b.start), [data?.placements, day])

  const featured = useMemo(() => [
    { room: roomById['AUD'], img: 'img/auditorium.jpg', tag: 'Institute events', cap: 500 },
    { room: ROOMS.find(r => r.id === 'LAB-CS') || roomById['LAB-CS'] || ROOMS[8], img: 'img/lab-cs.jpg', tag: 'Teaching labs', cap: 40 },
    { room: roomById['SEM-1'] || ROOMS.find(r => r.type === 'seminar_hall') || ROOMS[0], img: 'img/seminar.jpg', tag: 'Seminars & talks', cap: 120 },
  ], [])

  const hard = dash?.conflicts?.hard
  const soft = dash?.soft_penalty
  const util = dash?.room_utilisation?.overall
  const bstat = dash?.bookings

  if (data?.loading) return <TesseraEmpty title="Composing the mosaic" sub="Fetching live schedule data…" />
  if (data?.error) return <TesseraEmpty title="Could not load data" sub={data.error} />
  if (!dash?.timetable_generated) {
    return (
      <div>
        <Hero eyebrow={`${INSTITUTE} · ${FEST_WEEK}`}
          title={<>Spaces, people and time — <em>not in sync yet.</em></>}
          sub="No timetable has been generated for this period. An admin can compose one from Reports & Analytics." />
        <div className="card"><TesseraEmpty title="Awaiting the first solve"
          sub="Use Reports & Analytics → Generate (admin) to run the solver." /></div>
      </div>
    )
  }

  return (
    <div>
      <Hero eyebrow={
        <span className="row" style={{ gap: 10 }}>
          <span className="live"><i /> LIVE</span> {INSTITUTE} · {FEST_WEEK}
        </span>}
        title={<>Spaces, people and time — <em>in sync.</em></>}
        sub={`The week is composed by the solver and validated against every hard constraint. Live state of the campus mosaic: ${dash.counts?.sessions} sessions across ${dash.counts?.rooms} rooms, ${dash.counts?.faculty} faculty on roster.`}
      >
        <div className="hero-meta">
          <div className="hmeta"><span className="hk">Sessions</span><span className="hv">{dash.counts?.sessions} scheduled</span></div>
          <div className="hmeta"><span className="hk">Rooms</span><span className="hv">{dash.counts?.rooms} mapped</span></div>
          <div className="hmeta"><span className="hk">Faculty</span><span className="hv">{dash.counts?.faculty} on roster</span></div>
          <div className="hmeta"><span className="hk">Decisions waiting</span>
            <span className="hv" style={{ color: (dash.pending?.bookings || 0) + (dash.pending?.changes || 0) ? 'var(--coral-deep)' : undefined }}>
              {(dash.pending?.bookings || 0) + (dash.pending?.changes || 0)}
            </span></div>
        </div>
      </Hero>

      {/* KPI strip — operational */}
      <div className="grid cols-4 mb">
        <div className="stat sage">
          <div className="bignum">{hard ?? '—'}</div>
          <div className="statlabel">Hard conflicts</div>
          <div className="statnote">{hard === 0 ? 'fully constraint-valid' : 'review required'}</div>
        </div>
        <div className="stat violet">
          <div className="bignum">{soft ?? '—'}<span className="unit"> pts</span></div>
          <div className="statlabel">Soft penalties</div>
          <div className="statnote">preference-level only</div>
        </div>
        <div className="stat sky">
          <div className="bignum">{bstat?.score ?? '—'}<span className="unit">/{bstat?.max_score ?? 70}</span></div>
          <div className="statlabel">Booking score</div>
          <div className="statnote">{bstat?.approved ?? 0} approved · {bstat?.rejected ?? 0} rejected</div>
        </div>
        <div className="stat lime">
          <div className="bignum">{util != null ? Math.round(util) : '—'}<span className="unit">%</span></div>
          <div className="statlabel">Room utilisation</div>
          <div className="statnote">teaching week, P1–P9</div>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="stack">
          {/* today's tiles */}
          <div className="card">
            <div className="hd">
              <h3>Today on the mosaic</h3>
              <span className="anno hd-anno">{DAY_FULL[day] || day} · {todays.length} sessions</span>
              <Link to={`/board?day=${day}`} className="row" style={{ gap: 4 }}>
                Board <I.ArrowRight size={13} />
              </Link>
            </div>
            {todays.length === 0 ? (
              <TesseraEmpty title="Nothing scheduled this day" sub="The solver kept this day free." />
            ) : (
              <div className="today-tiles">
                {todays.slice(0, 8).map((p, i) => {
                  const meta = S.sessMetaOf(p.session_id) || {}
                  const rm = roomById[p.room]
                  return (
                    <Link to={`/board?session=${p.session_id}`} key={p.session_id + i} className="today-tile">
                      <span className="tt-time mono">{S.periodLabel(p.start)}</span>
                      <span className="tt-course">{S.courseOf(p.session_id) || p.session_id}</span>
                      <span className="tt-room">{rm ? rm.id : p.room}{meta.faculty ? ` · ${meta.faculty}` : ''}</span>
                    </Link>
                  )
                })}
              </div>
            )}
            {todays.length > 8 && (
              <div className="muted small mt">+{todays.length - 8} more on the board</div>
            )}
          </div>

          {/* activity */}
          <div className="card">
            <div className="hd">
              <h3>Activity</h3>
              <span className="anno hd-anno">audit log · last 14</span>
              <Link to="/reports" className="row" style={{ gap: 4 }}>All <I.ArrowRight size={13} /></Link>
            </div>
            {audit === null ? (
              <TesseraEmpty title="Loading activity…" />
            ) : audit.length === 0 ? (
              <TesseraEmpty title="No activity yet" sub="Actions across TESSERA will appear here." />
            ) : (
              <div className="feed">
                {audit.map((a) => (
                  <div className="feed-row" key={a.id}>
                    <span className="feed-ic"><Tessera size={13} mono color="#8d8a80" /></span>
                    <span className="feed-t">{ACTION_TXT[a.action]?.(a.detail || {}) || a.action}</span>
                    <span className="feed-who mono">{a.actor}</span>
                    <span className="feed-at mono">{a.at ? new Date(a.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          {/* alerts */}
          <div className="card">
            <div className="hd"><h3>Alerts</h3></div>
            <div className="stack" style={{ gap: 8 }}>
              {(dash.pending?.bookings || 0) > 0 && (
                <div className="vres violet"><span className="vi"><I.Bookmark size={14} /></span>
                  <div><b>{dash.pending.bookings}</b> booking request{(dash.pending.bookings > 1 ? 's' : '')} awaiting a coordinator decision.</div>
                </div>
              )}
              {(dash.pending?.changes || 0) > 0 && (
                <div className="vres warn"><span className="vi"><I.Shuffle size={14} /></span>
                  <div><b>{dash.pending.changes}</b> change proposal{(dash.pending.changes > 1 ? 's' : '')} awaiting admin review.</div>
                </div>
              )}
              {(hard || 0) > 0 && (
                <div className="vres bad"><span className="vi"><I.Alert size={14} /></span>
                  <div><b>{hard}</b> hard constraint violation{(hard > 1 ? 's' : '')} in the current solution.</div>
                </div>
              )}
              {(soft || 0) > 0 && (
                <div className="vres info"><span className="vi"><I.Info size={14} /></span>
                  <div><b>{soft}</b> soft-penalty points remain (preference level, not violations).</div>
                </div>
              )}
              {(dash.pending?.bookings || 0) === 0 && (dash.pending?.changes || 0) === 0 && (hard || 0) === 0 && (
                <div className="vres ok"><span className="vi"><I.Check size={14} /></span>
                  <div>Nothing needs attention. The mosaic holds.</div>
                </div>
              )}
            </div>
          </div>

          {/* featured spaces — editorial */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="hd" style={{ padding: '18px 20px 0' }}>
              <h3>Featured spaces</h3>
              <span className="anno hd-anno">from the directory</span>
              <Link to="/discovery" className="row" style={{ gap: 4 }}>Explore <I.ArrowRight size={13} /></Link>
            </div>
            <div className="stack" style={{ padding: 16, gap: 10 }}>
              {featured.filter(f => f.room).map((f) => (
                <Link to={`/discovery?room=${f.room.id}`} key={f.room.id} className="feat-mini grain">
                  <img src={f.img} alt={f.room.name} />
                  <div className="fm-body">
                    <div className="fm-tag">{f.tag}</div>
                    <div className="fm-name">{f.room.name}</div>
                    <div className="fm-meta mono">{f.room.id} · {f.room.building}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card grain" style={{ background: 'var(--deep)', borderColor: 'var(--deep)' }}>
            <div className="hd" style={{ color: '#F1EEE6' }}>
              <h3 style={{ color: '#F1EEE6' }}>Need a what-if?</h3>
            </div>
            <p style={{ color: '#a5a29a', fontSize: 13, margin: '0 0 12px' }}>
              Ask TESSERA Intelligence to find a free lab, explain a rejection,
              or preview a session move — every answer links to the exact tile.
            </p>
            <Link to="/intelligence" className="btn ai sm"><I.Sparkle size={14} /> Open Intelligence</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
