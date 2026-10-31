import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

const PERIOD_TIME = { 1: '08:00', 2: '09:00', 3: '10:00', 4: '11:00', 5: '12:00',
  6: '13:00', 7: '14:00', 8: '15:00', 9: '16:00', 10: '18:00', 11: '19:00', 12: '20:00', 13: '21:00' }

export default function Timetable() {
  const [view, setView] = useState('week')
  const [ref, setRef] = useState(null)
  const [id, setId] = useState('')
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [explanation, setExplanation] = useState(null)

  useEffect(() => { api('/reference').then(setRef).catch((e) => setErr(e.message)) }, [])

  const opts = view === 'group' ? (ref?.groups || []).map((g) => g.id)
    : view === 'faculty' ? (ref?.faculty || [])
    : (ref?.rooms || []).map((r) => r.id)

  useEffect(() => {
    if (!ref) return
    if (view !== 'week' && !id && opts.length) setId(opts[0])
  }, [ref, view, id, opts.length])

  useEffect(() => {
    if (view === 'week') api('/timetable?view=week').then(setData).catch((e) => setErr(e.message))
    else if (id) api(`/timetable?view=${view}&id=${encodeURIComponent(id)}`).then(setData).catch((e) => setErr(e.message))
  }, [view, id])

  const explain = async (kind, sid) => {
    try {
      const r = await api('/ai/explain', { method: 'POST', body: { kind, id: sid } })
      setExplanation({ kind, id: sid, text: r.explanation, llm: r.llm_used })
    } catch (e) { setErr(e.message) }
  }

  const courseOf = (sid) => {
    const s = (ref?.sessions || []).find((x) => x.id === sid)
    return s ? s.course : sid
  }

  if (err && !data) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!data) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const viewBtns = (
    <div className="row mb wrap">
      {['week', 'group', 'faculty', 'room'].map((v) => (
        <button key={v} className={`btn sm ${view === v ? 'primary' : ''}`} onClick={() => { setView(v); setId('') }}>
          {v === 'week' ? 'Whole week (by room)' : v === 'group' ? 'By group' : v === 'faculty' ? 'By faculty' : 'By room'}
        </button>
      ))}
      <span className="spacer" />
      {view === 'week' && <span className="badge muted">teaching = blue · lab = purple · fest booking = amber</span>}
    </div>
  )

  // ---------------- WEEK view (room rows x day cols, Gantt-style slots) ----------------
  if (view === 'week') {
    const days = data.days
    const SLOT = 30 // px per period slot
    // teaching sessions: grid repeats each session in every period it
    // occupies; anchor the chip at its first period (no session at p-1).
    const sess = {} // room -> day -> startP -> item
    for (const [key, items] of Object.entries(data.sessions)) {
      const [day, pstr] = key.split('|P')
      const p = parseInt(pstr, 10)
      for (const it of items) {
        const inPrev = (data.sessions[`${day}|P${p - 1}`] || []).some((x) => x.sid === it.sid)
        if (inPrev) continue
        sess[it.room] ??= {}
        sess[it.room][day] ??= {}
        sess[it.room][day][p] = it
      }
    }
    // fest bookings grouped by room -> day -> start -> item
    const fest = {}
    for (const [key, list] of Object.entries(data.bookings || {})) {
      const [room, day] = key.split('|')
      for (const b of list) {
        fest[room] ??= {}
        fest[room][day] ??= {}
        fest[room][day][b.start] = b
      }
    }
    return (
      <div>
        {viewBtns}
        <div className="card tt-grid">
          <table className="tt-table">
            <thead>
              <tr>
                <th className="rowhead">Room</th>
                {days.map((d) => <th key={d}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {(ref?.rooms || []).map((room) => (
                <tr key={room.id}>
                  <td className="rowhead">
                    {room.id}
                    <div className="small muted" style={{ fontWeight: 400 }}>cap {room.capacity} · {room.type}</div>
                  </td>
                  {days.map((day) => (
                    <td key={day} className="tt-cell" style={{ height: 13 * SLOT, width: 118 }}>
                      {/* period gridlines */}
                      {Array.from({ length: 13 }, (_, i) => (
                        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * SLOT, height: SLOT, borderBottom: '1px solid #eef0f4', background: i < 9 ? 'transparent' : 'rgba(244,246,251,.6)' }} />
                      ))}
                      {Object.entries(sess[room.id]?.[day] || {}).map(([p, it]) => (
                        <div key={it.sid} className={`tt-chip ${it.kind === 'lab' ? 'lab' : 'lg'}`}
                          style={{ position: 'absolute', left: 3, right: 3, top: (p - 1) * SLOT + 2, height: it.dur * SLOT - 4 }}
                          title={`${courseOf(it.sid)} · ${it.sid} · ${day} P${p}${it.dur > 1 ? `–P${p + it.dur - 1}` : ''} · ${room.id}`}>
                          <span className="ttl">{courseOf(it.sid)}</span>
                          <span className="r">P{p}{it.dur > 1 ? `–${p + it.dur - 1}` : ''} · {PERIOD_TIME[+p]}</span>
                          <button className="tt-why" onClick={() => explain('session', it.sid)}>why?</button>
                        </div>
                      ))}
                      {Object.entries(fest[room.id]?.[day] || {}).map(([p, b]) => (
                        <div key={b.request_id} className="tt-chip booking"
                          style={{ position: 'absolute', left: 3, right: 3, top: (b.start - 1) * SLOT + 2, height: (b.end - b.start + 1) * SLOT - 4 }}
                          title={`${b.request_id} · ${day} P${b.start}–P${b.end}${b.manual ? ' (manual booking)' : ''} · ${room.id}`}>
                          <span className="ttl">{b.request_id}{b.manual ? ' ✎' : ''}</span>
                          <span className="r">P{b.start}–{b.end} · fest</span>
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {explanation && <ExplainBox e={explanation} onClose={() => setExplanation(null)} />}
        </div>
      </div>
    )
  }

  // ---------------- group / faculty / room ----------------
  return (
    <div>
      <div className="row mb wrap">
        {['week', 'group', 'faculty', 'room'].map((v) => (
          <button key={v} className={`btn sm ${view === v ? 'primary' : ''}`} onClick={() => { setView(v); setId('') }}>
            {v === 'week' ? 'Whole week' : v === 'group' ? 'By group' : v === 'faculty' ? 'By faculty' : 'By room'}
          </button>
        ))}
        <select className="input" style={{ width: 260 }} value={id} onChange={(e) => setId(e.target.value)}>
          {opts.map((o) => (
            <option key={o} value={o}>
              {view === 'group' ? `${o} — ${ref.groups.find((g) => g.id === o)?.name || ''}` : o}
            </option>
          ))}
        </select>
        {view === 'room' && data.capacity != null && <span className="badge info">capacity {data.capacity}</span>}
      </div>
      <div className="card">
        {data.entries.length === 0 ? <div className="empty">No sessions for this selection.</div> : (
          <table className="tbl">
            <thead><tr><th>Day</th><th>Period</th><th>Session</th><th>Course</th><th>Room</th><th /></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={`${e.day}${e.start_period}${e.session_id}`}>
                  <td>{e.day}</td>
                  <td className="mono">P{e.start_period} · {PERIOD_TIME[e.start_period]}</td>
                  <td className="mono">{e.session_id}</td>
                  <td>{e.course}</td>
                  <td>{e.room_id}</td>
                  <td><button className="btn ghost sm" onClick={() => explain('session', e.session_id)}>why?</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {view === 'room' && data.bookings?.length > 0 && (
          <>
            <h3 className="mt">Fest-week bookings in this room</h3>
            <table className="tbl">
              <thead><tr><th>Request</th><th>Day</th><th>Periods</th><th>Source</th></tr></thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.request_id}>
                    <td className="mono">{b.request_id}</td><td>{b.day}</td>
                    <td className="mono">P{b.start_period}–P{b.end_period}</td>
                    <td>{b.manual ? <span className="badge violet">manual</span> : <span className="muted small">dataset</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {explanation && <ExplainBox e={explanation} onClose={() => setExplanation(null)} />}
      </div>
    </div>
  )
}

function ExplainBox({ e, onClose }) {
  return (
    <div className="card mt" style={{ background: 'var(--brand-soft)', borderColor: '#c7d2fe' }}>
      <div className="row">
        <b>✦ Why {e.kind} {e.id}?</b>
        {e.llm && <span className="badge violet">LLM-assisted</span>}
        <span className="spacer" />
        <button className="btn ghost sm" onClick={onClose}>close</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{e.text}</div>
    </div>
  )
}
