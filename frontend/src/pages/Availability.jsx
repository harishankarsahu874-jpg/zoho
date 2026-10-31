// TESSERA Availability — the occupancy matrix.
// Rows = resources, columns = intervals. Cells are REAL (live week grid +
// approved fest bookings), not hardcoded. Select a free slot → booking
// detail form → a real POST /api/bookings (pending decision, backend-validated).
import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hero, useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS, TEACHING_DAYS } from '../data/campus.js'

const PERIODS = Array.from({ length: 13 }, (_, i) => i + 1)

function useMatrix() {
  const data = useData()
  return useMemo(() => {
    const busy = {} // room -> day -> period -> label
    for (const r of ROOMS) busy[r.id] = {}
    for (const p of data?.placements || []) {
      const m = (busy[p.room] = busy[p.room] || {})
      for (let per = p.start; per <= p.end; per++)
        ((m[p.day] = m[p.day] || {})[per]) = S.courseOf(p.session_id) || p.session_id
    }
    for (const b of data?.festBookings || []) {
      const m = (busy[b.room] = busy[b.room] || {})
      for (let per = b.start; per <= b.end; per++)
        ((m[b.day] = m[b.day] || {})[per]) = `◆ ${b.request_id}`
    }
    return busy
  }, [data?.placements, data?.festBookings])
}

function BookingDrawer({ slot, onClose, toast }) {
  const room = S.roomById[slot.room]
  const [form, setForm] = useState({
    title: '', role: 'club', requested_category: 'club_event',
    attendance: 60, duration_periods: slot.end - slot.start + 1,
    room_types: [room.type], needs: [], notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const featOpts = (room.features || []).concat(room.accessible ? ['accessible'] : [])

  const submit = async () => {
    setBusy(true); setErr(null)
    const payload = {
      ...form,
      windows: [{ day: slot.day, from_period: slot.start, to_period: slot.end }],
      requested_room: slot.room,
      mandatory_for_groups: [],
    }
    try {
      const res = await S.postBooking(payload)
      toast(`${res.message || 'Request recorded.'} Track it under Bookings.`)
      onClose()
    } catch (e) {
      setErr(typeof e.detail === 'string' ? e.detail
        : e.detail?.problems?.join('; ') || e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="drawer-host">
      <div className="shade" onClick={onClose} />
      <div className="drawer">
        <div className="d-hd">
          <I.Bookmark size={17} />
          <h3>New booking — {room?.name || slot.room}</h3>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}><I.XMark size={14} /></button>
        </div>
        <div className="d-bd">
          <div className="vres info mb">
            <span className="vi"><I.Info size={14} /></span>
            <div>
              Requesting <b>{slot.room}</b> on <b>{slot.day}</b>, {S.rangeLabel(slot.start, slot.end)}.
              The window is free on the live matrix. Submission creates a <b>pending request</b> —
              a coordinator or admin decides it. Nothing is reserved until then.
            </div>
          </div>

          <label className="fld">Title</label>
          <input className="input" value={form.title} placeholder="e.g. Guest lecture: edge AI"
            onChange={(e) => setForm({ ...form, title: e.target.value })} />

          <div className="grid cols-2" style={{ marginTop: 4 }}>
            <div>
              <label className="fld">Role</label>
              <select className="input" value={form.role}
                onChange={(e) => {
                  const role = e.target.value
                  const cat = { admin: 'institute_event', department_coordinator: 'department_event', faculty: 'guest_lecture', club: 'club_event' }[role] || 'club_event'
                  setForm({ ...form, role, requested_category: cat })
                }}>
                <option value="admin">Admin</option>
                <option value="department_coordinator">Coordinator</option>
                <option value="faculty">Faculty</option>
                <option value="club">Club</option>
              </select>
            </div>
            <div>
              <label className="fld">Attendance</label>
              <input className="input" type="number" min={1} value={form.attendance}
                onChange={(e) => setForm({ ...form, attendance: +e.target.value })} />
            </div>
          </div>

          <div className="grid cols-2">
            <div>
              <label className="fld">Window duration</label>
              <input className="input" disabled value={`${form.duration_periods} period(s) — ${S.rangeLabel(slot.start, slot.end)}`} />
            </div>
            <div>
              <label className="fld">Room type</label>
              <input className="input" disabled value={S.roomTypeLabel(room.type)} />
            </div>
          </div>

          <label className="fld">Equipment needed</label>
          <div className="row wrap" style={{ rowGap: 6 }}>
            {featOpts.map((f) => (
              <button key={f} className={`chip ${form.needs.includes(f) ? 'on' : ''}`}
                onClick={() => setForm({ ...form, needs: form.needs.includes(f)
                  ? form.needs.filter((x) => x !== f) : [...form.needs, f] })}>
                {f}
              </button>
            ))}
          </div>

          <label className="fld">Notes</label>
          <textarea className="input" rows={3} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          {err && <div className="vres bad mt"><span className="vi">✕</span><div>{err}</div></div>}
        </div>
        <div className="d-ft">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !form.title.trim()} onClick={submit}>
            {busy ? <span className="spin" /> : <I.ArrowRight size={14} />}
            Submit for decision
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Availability() {
  const data = useData()
  const toast = useToast()
  const [sp] = useSearchParams()
  const busy = useMatrix()
  const [mode, setMode] = useState('day')
  const [day, setDay] = useState(sp.get('day') || 'FRI')
  const [typeFilter, setTypeFilter] = useState('')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)   // selected free cell
  const [slot, setSlot] = useState(null) // drawer target

  const rooms = useMemo(() => ROOMS
    .filter((r) => !typeFilter || r.type === typeFilter)
    .filter((r) => !q || `${r.id} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.building + a.id).localeCompare(b.building + b.id)), [typeFilter, q])

  if (data?.loading) return <TesseraEmpty title="Measuring the week…" />
  if (!data?.week) return (
    <div>
      <Hero compact eyebrow="Availability" title={<>Free time, <em>cell by cell.</em></>} />
      <div className="card"><TesseraEmpty title="No timetable yet" sub="Generate one from Reports & Analytics (admin)." /></div>
    </div>
  )

  return (
    <div>
      <Hero compact
        eyebrow="Availability"
        title={<>Free time, <em>cell by cell.</em></>}
        sub="Sage is free, muted coral is reserved — both from the live week. Pick any free cell to draft a real booking request."
      >
        <div className="row" style={{ gap: 8 }}>
          <div className="seg">
            <button className={mode === 'day' ? 'active' : ''} onClick={() => setMode('day')}>Day</button>
            <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>Week</button>
          </div>
          {mode === 'day' && (
            <div className="seg">
              {TEACHING_DAYS.map((d) => (
                <button key={d} className={day === d ? 'active' : ''} onClick={() => { setDay(d); setSel(null) }}>{d}</button>
              ))}
            </div>
          )}
          <select className="input" style={{ maxWidth: 170, flex: '0 0 auto' }} value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All room types</option>
            {[...new Set(ROOMS.map((r) => r.type))].sort().map((t) => (
              <option key={t} value={t}>{S.roomTypeLabel(t)}</option>
            ))}
          </select>
          <input className="input" style={{ maxWidth: 170, flex: '0 0 auto' }} placeholder="Filter rooms…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Hero>

      <div className="mx">
        <table>
          <thead>
            <tr>
              <th className="m-res">Resource</th>
              {PERIODS.map((p) => (
                <th key={p} className="m-col">{S.periodLabel(p).replace('· ', ' ')}
                  {p === 5 && <div style={{ color: 'var(--amber)' }}>↓ lunch</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className="m-res">
                  <div>{r.name}</div>
                  <div className="mr-sub">{r.id} · {r.capacity} · {S.roomTypeLabel(r.type)}</div>
                </td>
                {PERIODS.map((p) => {
                  const dayStates = mode === 'day' ? [busy?.[r.id]?.[day]?.[p] ? 'busy' : 'free']
                    : TEACHING_DAYS.map((d) => busy?.[r.id]?.[d]?.[p] ? 'busy' : 'free')
                  return (
                    <td key={p} className="m-cell">
                      {mode === 'day' ? (
                        <button
                          className={`m-slot ${dayStates[0]} ${sel && sel.room === r.id && sel.start === p ? 'sel' : ''}`}
                          disabled={dayStates[0] === 'busy'}
                          title={dayStates[0] === 'busy'
                            ? `In use: ${busy?.[r.id]?.[day]?.[p]}`
                            : `Free — click to book ${r.id} ${day} P${p}`}
                          onClick={() => {
                            if (dayStates[0] !== 'free') return
                            const dur = Math.min(13 - p, 2)
                            setSel({ room: r.id, start: p, day })
                            setSlot({ room: r.id, day, start: p, end: p + dur - 1 })
                          }}>
                          {dayStates[0] === 'busy'
                            ? <span className="who">{String(busy?.[r.id]?.[day]?.[p]).slice(0, 14)}</span>
                            : <span className="who">free</span>}
                        </button>
                      ) : (
                        <div className="m-week">
                          {TEACHING_DAYS.map((d, i) => (
                            <button key={d}
                              className={`m-slot ${dayStates[i]} ${sel && sel.room === r.id && sel.start === p && sel.day === d ? 'sel' : ''}`}
                              disabled={dayStates[i] === 'busy'}
                              title={`${d} P${p}: ${dayStates[i] === 'busy' ? busy?.[r.id]?.[d]?.[p] : 'free'}`}
                              onClick={() => {
                                if (dayStates[i] !== 'free') return
                                const dur = Math.min(13 - p, 2)
                                setSel({ room: r.id, start: p, day: d })
                                setSlot({ room: r.id, day: d, start: p, end: p + dur - 1 })
                              }}>
                              {d[0]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row mt" style={{ gap: 14, flexWrap: 'wrap' }}>
        <span className="strip-legend">
          <span><i style={{ background: 'var(--sage)' }} /> free</span>
          <span><i style={{ background: '#f3e2dc', border: '1px solid #e3b8aa' }} /> in use</span>
        </span>
        <span className="chip">matrix = live solution + approved bookings (backend-validated)</span>
      </div>

      {slot && <BookingDrawer slot={slot} onClose={() => { setSlot(null); setSel(null) }} toast={toast} />}
    </div>
  )
}
