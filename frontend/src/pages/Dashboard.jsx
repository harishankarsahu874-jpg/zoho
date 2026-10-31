import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

export default function Dashboard() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/dashboard').then(setD).catch((e) => setErr(e.message))
  }, [])

  if (err) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!d) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const c = d.counts
  return (
    <div>
      {!d.timetable_generated && (
        <div className="card mb" style={{ borderColor: '#f0c987', background: '#fffbeb' }}>
          <div className="row">
            <span style={{ fontSize: 20 }}>🗓</span>
            <div>
              <b>No timetable yet.</b> Ask an admin to generate one —
              <Link to="/admin"> open Admin → Generate timetable</Link>.
            </div>
          </div>
        </div>
      )}
      <div className="grid cols-4 mb">
        <div className="card stat">
          <span className="k">Sessions / week</span>
          <span className="v">{c.sessions}</span>
          <span className="s">{c.groups} groups · {c.faculty} faculty</span>
        </div>
        <div className="card stat">
          <span className="k">Rooms</span>
          <span className="v">{c.rooms}</span>
          {d.room_utilisation && <span className="s">{d.room_utilisation.overall}% average teaching utilisation</span>}
        </div>
        <div className="card stat">
          <span className="k">Hard conflicts</span>
          <span className={`v ${d.conflicts ? (d.conflicts.hard === 0 ? 'ok' : 'bad') : ''}`}>
            {d.conflicts ? d.conflicts.hard : '—'}
          </span>
          <span className="s">validator-checked on every change</span>
        </div>
        <div className="card stat">
          <span className="k">Soft penalty</span>
          <span className={`v ${d.soft_penalty == null ? '' : d.soft_penalty <= 20 ? 'ok' : 'warn'}`}>
            {d.soft_penalty ?? '—'}
          </span>
          <span className="s">preference cost (S1–S6)</span>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h3>Fest-week bookings</h3>
          {d.bookings ? (
            <>
              <div className="row wrap">
                <span className="badge ok">{d.bookings.approved} approved</span>
                <span className="badge warn">{d.bookings.alternative_offered} alternatives</span>
                <span className="badge bad">{d.bookings.rejected} rejected</span>
              </div>
              <div className="mt small muted">
                Score {d.bookings.score} / {d.bookings.max_score} · {d.bookings.inversions?.length || 0} priority inversions
              </div>
              <div className="mt"><Link to="/bookings"><button className="btn sm">Open Fest Week</button></Link></div>
            </>
          ) : <div className="muted small">Generate a timetable to see booking decisions.</div>}
        </div>
        <div className="card">
          <h3>Pending approvals</h3>
          {d.pending ? (
            <>
              <div className="stat"><span className="k">Venue requests</span><span className="v">{d.pending.bookings}</span></div>
              <div className="stat mt"><span className="k">Change requests</span><span className="v">{d.pending.changes}</span></div>
            </>
          ) : <div className="muted small">—</div>}
        </div>
        <div className="card">
          <h3>Exams</h3>
          {d.exams ? (
            <>
              <div className="stat"><span className="k">Placed (AM/PM)</span><span className="v">{d.exams.placed}</span></div>
              <div className="stat mt"><span className="k">Soft penalty</span><span className={`v ${d.exams.soft === 0 ? 'ok' : ''}`}>{d.exams.soft}</span></div>
            </>
          ) : <div className="muted small">—</div>}
        </div>
      </div>

      {d.room_utilisation && d.room_utilisation.per_room.length > 0 && (
        <div className="card mt">
          <h3>Room utilisation (teaching week, P1–P9)</h3>
          <div className="grid cols-3">
            {d.room_utilisation.per_room
              .slice()
              .sort((a, b) => b.used_periods - a.used_periods)
              .map((r) => (
                <div key={r.room}>
                  <div className="row">
                    <span className="mono small" style={{ width: 92 }}>{r.room}</span>
                    <div className="prog" style={{ flex: 1 }}>
                      <div style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="small muted" style={{ width: 64, textAlign: 'right' }}>{r.pct}%</span>
                  </div>
                  <div className="small muted" style={{ marginTop: 2 }}>{r.used_periods} periods · cap {r.capacity}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
