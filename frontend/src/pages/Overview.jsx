// TESSERA Overview — the week board (calendar style).
// Reference-style layout: month title + Month/Week/Day + Today/‹ › header,
// rounded day cards, a flat 8am–9pm time grid with colourful department-tinted
// session tiles, reservations, evening "+" quick-add zones, and a floating
// "New booking" card that creates a real PENDING request.
// All schedule data is backend-validated (/reference + /timetable?view=week).
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUser } from '../api.js'
import { useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS } from '../data/campus.js'

const ROLE_CAP = { admin: 'institute_event', faculty: 'guest_lecture', department_coordinator: 'department_event', club: 'club_event' }
const CAT_LABEL = { club_event: 'Club event', department_event: 'Department event', guest_lecture: 'Guest lecture', institute_event: 'Institute event' }
const CAT_TINT = { club_event: 'c-blue', department_event: 'c-green', guest_lecture: 'c-violet', institute_event: 'c-amber' }

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const DOW_FULL = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// 08:00 → 21:00 in hour bands; band 5 = the 13:00–14:00 lunch break
const BANDS = 14
const BAND_H = 46
const bandOf = (p) => (p <= 5 ? p - 1 : p)
const boundHour = (b) => (b <= 4 ? 8 + b : b === 5 ? 13 : 7 + b)
const h12 = (h) => (h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`)

// department → tile colour (functional pastels, TESSERA palette family)
const DEPT_KEY = { CSE: 'cse', ECE: 'ece', EE: 'ee', ME: 'me', CE: 'ce', PH: 'ph', MA: 'ma', HSS: 'hss' }
const deptOf = (meta) => {
  const g = (meta?.groups || [])[0]
  const dep = S.groupById[g]?.department
  return DEPT_KEY[dep] || 'com'
}
const DEPT_LEGEND = [
  ['cse', 'CSE'], ['ece', 'ECE'], ['ee', 'EE'], ['me', 'ME'], ['ce', 'CE'],
]

function weekDates(anchor) {
  const d = new Date(anchor)
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  const mon = new Date(d); mon.setDate(d.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x })
}
function monthCells(anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth()
  const first = new Date(y, m, 1)
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// greedy interval lanes for one day column
function layOut(items, maxLanes) {
  const laneEnds = []
  const placed = []
  for (const it of items) {
    let lane = laneEnds.findIndex((e) => e < it.start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end) } else laneEnds[lane] = it.end
    placed.push({ ...it, lane })
  }
  return placed.map((o) => ({ ...o, overflow: o.lane >= maxLanes }))
}

const timeStr = (s, e) => `${S.periodTime(s)[0].slice(0, 5)} – ${S.periodTime(e)[1].slice(0, 5)}`

function DayColumn({ day, items, maxLanes, detailed, onQuickAdd }) {
  const laid = useMemo(() => layOut(items, maxLanes), [items, maxLanes])
  const shown = laid.filter((l) => !l.overflow)
  const lanes = Math.max(1, ...shown.map((l) => l.lane + 1), 0) || 1
  const w = 100 / lanes
  const overflows = laid.filter((l) => l.overflow)
  const pillAt = overflows.length ? bandOf(Math.min(...overflows.map((o) => o.start))) : null
  const weekend = day === 'SAT' || day === 'SUN'
  const eveningFree = !weekend && !items.some((it) => it.kind === 'booking' && it.start <= 13 && it.end >= 10)
  const saturdayFree = day === 'SAT' && items.length === 0

  return (
    <div className={`ovc-col${weekend ? ' ovc-we' : ''}`}>
      {eveningFree && (
        <button className="ovc-plus" style={{ top: 10 * BAND_H + 4, height: 4 * BAND_H - 8 }}
          onClick={() => onQuickAdd(day, 10)} title={`New booking · ${DOW_FULL[day]} evening`}>
          <I.Plus size={16} />
        </button>
      )}
      {saturdayFree && (
        <button className="ovc-plus" style={{ top: 4 * BAND_H + 4, height: 4 * BAND_H - 8 }}
          onClick={() => onQuickAdd('SAT', 6)} title="New booking · Saturday">
          <span className="ovc-plus-t">New booking</span>
        </button>
      )}
      {overflows.length > 0 && (
        <Link to={`/board?day=${day}`} className="ovc-more mono" style={{ top: pillAt * BAND_H + 2 }}
          title={`${overflows.length} more sessions in this slot — open the Mosaic Board`}>
          +{overflows.length} more
        </Link>
      )}
      {shown.map((it) => {
        const top = bandOf(it.start) * BAND_H + 2
        const h = (bandOf(it.end) - bandOf(it.start) + 1) * BAND_H - 4
        if (it.kind === 'booking') {
          return (
            <Link to="/bookings" key={it.id} className="ovc-blk ovc-bk" style={{ top, height: h, left: `${it.lane * w}%`, width: `calc(${w}% - 3px)` }}
              title={`Reservation ${it.rid} · ${it.room}`}>
              <span className="ovc-blk-t">Reservation</span>
              <span className="ovc-blk-tm">{timeStr(it.start, it.end)}</span>
              {h > 52 && <span className="ovc-blk-r">{it.rid} · {it.room}</span>}
            </Link>
          )
        }
        const dk = deptOf(it.meta)
        const meta = it.meta || {}
        const fac = meta.faculty ? S.facById[meta.faculty] : null
        const course = S.courseOf(it.sid) || it.sid
        const tall = h >= 60
        return (
          <Link to={`/board?session=${it.sid}`} key={it.id} className={`ovc-blk ovc-c-${dk}`}
            style={{ top, height: h, left: `${it.lane * w}%`, width: `calc(${w}% - 3px)` }}
            title={`${course} · ${DOW_FULL[it.day]} ${timeStr(it.start, it.end)} · ${it.room}${fac ? ' · ' + fac.name : ''}`}>
            <span className="ovc-blk-t">{course}</span>
            <span className="ovc-blk-tm">{timeStr(it.start, it.end)}{detailed ? ` · P${it.start}–P${it.end}` : ''}</span>
            {detailed && <span className="ovc-blk-r ful">{it.room}{fac ? ` · ${fac.name}` : ''}</span>}
            {detailed && (meta.groups || []).length > 0 && (
              <span className="ovc-blk-chips">{(meta.groups || []).map((g) => <span key={g} className="ovc-blk-chip">{g}</span>)}</span>
            )}
            {tall && !detailed && fac && <span className="ovc-ava">{S.initials(fac.name)}</span>}
          </Link>
        )
      })}
      {day === 'SUN' && <span className="ovc-we-label">off</span>}
    </div>
  )
}

function AddBookingCard({ prefill, week, onClose, onDone }) {
  const user = getUser()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [day, setDay] = useState(prefill?.day || 'FRI')
  const [from, setFrom] = useState(prefill?.from || 10)
  const [to, setTo] = useState((prefill?.from || 10) + 1)
  const [room, setRoom] = useState('SH-1')
  const [cat, setCat] = useState(ROLE_CAP[user?.role] || 'club_event')
  const [att, setAtt] = useState(60)
  const [busy, setBusy] = useState(false)

  const rm = S.roomById[room]
  const submit = async () => {
    if (to < from) { toast('End period must be after the start period.', 'err'); return }
    setBusy(true)
    try {
      const res = await S.postBooking({
        title: title.trim() || 'Untitled event',
        role: user?.role || 'club',
        requested_category: cat,
        attendance: +att || 60,
        duration_periods: to - from + 1,
        windows: [{ day, from_period: from, to_period: to }],
        room_types: [rm?.type || 'classroom'],
        needs: [],
        requested_room: room,
        mandatory_for_groups: [],
        notes: '',
      })
      toast(`${res.message || 'Request recorded.'} It is PENDING — a coordinator or admin will decide it.`)
      onDone()
    } catch (e) {
      toast(typeof e.detail === 'string' ? e.detail : e.detail?.problems?.join?.('; ') || e.message, 'err')
    } finally { setBusy(false) }
  }

  const pOpt = (v) => <option key={v} value={v}>{h12(+S.periodTime(v)[0].slice(0, 2))} · P{v}</option>

  return (
    <div className="ovc-add">
      <button className="ovc-add-x" onClick={onClose} title="Close"><I.XMark size={13} /></button>
      <input className="ovc-add-title" placeholder="e.g. Makers’ Club demo workshop" value={title}
        onChange={(e) => setTitle(e.target.value)} maxLength={80} />

      <div className="ovc-ard">
        <span className="ovc-ard-ic"><I.Calendar size={14} /></span>
        <select className="ovc-sel" value={day} onChange={(e) => setDay(e.target.value)}>
          {week.slice(0, 6).map((dt, i) => (
            <option key={DOW[i]} value={DOW[i]}>{DOW_FULL[DOW[i]]}, {dt.getDate()} {MONTHS[dt.getMonth()].slice(0, 3)}</option>
          ))}
        </select>
      </div>
      <div className="ovc-ard">
        <span className="ovc-ard-ic"><I.Clock size={14} /></span>
        <select className="ovc-sel" value={from} onChange={(e) => { const f = +e.target.value; setFrom(f); if (to <= f) setTo(Math.min(13, f + 1)) }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(pOpt)}
        </select>
        <span className="muted">–</span>
        <select className="ovc-sel" value={to} onChange={(e) => setTo(+e.target.value)}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter((v) => v > from).map(pOpt)}
        </select>
      </div>
      <div className="ovc-ard">
        <span className="ovc-ard-ic"><I.Pin size={14} /></span>
        <select className="ovc-sel" value={room} onChange={(e) => setRoom(e.target.value)}>
          {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}
        </select>
      </div>

      <div className="ovc-chips">
        {Object.keys(CAT_LABEL).map((c) => (
          <button key={c} type="button" className={`ovc-chip${cat === c ? ` on ${CAT_TINT[c]}` : ''}`} onClick={() => setCat(c)}>
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="ovc-ava-row">
        <span className="ovc-av" title="you">{S.initials(user?.name || user?.email || 'U')}</span>
        <span className="ovc-av add" title="More attendees (not supported yet)"><I.Plus size={11} /></span>
        <span className="spacer" />
        <span className="muted small">≈</span>
        <input className="ovc-att" type="number" min={1} max={800} value={att} onChange={(e) => setAtt(+e.target.value)} title="Expected attendance" />
        <span className="muted small">attending</span>
      </div>

      <div className="row ovc-add-f">
        <button className="btn dark ovc-add-go" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Add booking'}</button>
        <Link to="/bookings" className="ovc-add-dots" title="Open the full booking composer">···</Link>
      </div>
      <div className="ovc-add-note">Creates a <b>PENDING</b> request — a coordinator or admin decides it. It is not an approved booking until then.</div>
    </div>
  )
}

export default function Overview() {
  const data = useData()
  const dash = data?.dashboard
  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [selDay, setSelDay] = useState(() => {
    const d = (new Date().getDay() + 6) % 7
    return DOW[d] && DOW[d] !== 'SUN' ? DOW[d] : 'MON'
  })
  const [addOpen, setAddOpen] = useState(true)
  const [prefill, setPrefill] = useState(null)

  const today = new Date()
  const week = weekDates(anchor)
  const todayDow = DOW[(today.getDay() + 6) % 7]

  const byDay = useMemo(() => {
    const m = {}
    for (const d of DOW) m[d] = []
    for (const p of data?.placements || []) {
      m[p.day]?.push({ id: 's' + p.session_id, kind: p.kind || 'lecture', start: p.start, end: p.end,
        day: p.day, sid: p.session_id, room: p.room, meta: S.sessMetaOf(p.session_id) || {} })
    }
    for (const b of data?.festBookings || []) {
      m[b.day]?.push({ id: 'b' + b.request_id, kind: 'booking', start: b.start, end: b.end,
        day: b.day, room: b.room, rid: b.request_id })
    }
    for (const d of DOW) m[d].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    return m
  }, [data?.placements, data?.festBookings])

  const counts = useMemo(() => {
    const perDay = {}
    for (const d of DOW) perDay[d] = (data?.placements || []).filter((p) => p.day === d).length
    return perDay
  }, [data?.placements])

  if (data?.loading) return <TesseraEmpty title="Composing the week" sub="Fetching the live schedule…" />
  if (data?.error) return <TesseraEmpty title="Could not load data" sub={data.error} />

  if (!dash?.timetable_generated) {
    return (
      <div className="ovc">
        <div className="ovc-head">
          <div className="ovc-month">The week is not composed yet.</div>
        </div>
        <div className="card">
          <TesseraEmpty title="Awaiting the first solve"
            sub="No timetable has been generated for this period. An admin can compose one from Reports & Analytics." />
          <Link to="/reports" className="btn sm"><I.Bolt size={14} /> Reports & Analytics</Link>
        </div>
      </div>
    )
  }

  // ---------- titles
  const mon = week[0], sun = week[6]
  const dayDate = week[DOW.indexOf(selDay)]
  let title
  if (view === 'day') {
    title = `${sameDay(dayDate, today) ? 'Today' : DOW_FULL[selDay]}, ${dayDate.getDate()} ${MONTHS[dayDate.getMonth()].slice(0, 3)} ${dayDate.getFullYear()}`
  } else if (mon.getMonth() === sun.getMonth()) {
    title = `${MONTHS[mon.getMonth()]}, ${mon.getFullYear()}`
  } else {
    title = `${MONTHS[mon.getMonth()].slice(0, 3)} – ${MONTHS[sun.getMonth()]}, ${sun.getFullYear()}`
  }

  const shift = (n) => setAnchor((a) => {
    const x = new Date(a)
    if (view === 'month') x.setMonth(x.getMonth() + n)
    else x.setDate(x.getDate() + n * 7)
    return x
  })

  const quickAdd = (day, from) => { setPrefill({ day, from }); setAddOpen(true) }

  const strip = (
    <div className="ovc-strip">
      <span className="ovc-strip-ic"><I.Calendar size={15} /></span>
      {DOW.map((d, i) => {
        const dt = week[i]
        const isToday = sameDay(dt, today)
        const active = view === 'day' && selDay === d
        return (
          <button key={d} className={`ovc-day${isToday ? ' today' : ''}${active ? ' on' : ''}`}
            onClick={() => { setSelDay(d); setView('day') }} title={DOW_FULL[d]}>
            <span className="ovc-day-n">{DOW_FULL[d]}</span>
            <span className="ovc-day-d">{dt.getDate()}</span>
          </button>
        )
      })}
    </div>
  )

  const grid = (days, maxLanes, detailed) => (
    <div className="ovc-grid" style={{ gridTemplateColumns: `54px repeat(${days.length}, minmax(0, 1fr))` }}>
      <div className="ovc-rail" style={{ height: BANDS * BAND_H }}>
        {Array.from({ length: BANDS + 1 }, (_, b) => (
          <span key={b} className="ovc-rail-t" style={{ top: b * BAND_H - 7 }}>{h12(boundHour(b))}</span>
        ))}
      </div>
      {days.map((d) => <DayColumn key={d} day={d} items={byDay[d] || []} maxLanes={maxLanes} detailed={detailed} onQuickAdd={quickAdd} />)}
    </div>
  )

  return (
    <div className="ovc">
      {/* header — month title, view toggle, nav */}
      <div className="ovc-head">
        <div className="ovc-month">{title}</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="seg">
            {['month', 'week', 'day'].map((v) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 7 }}>
            <button className="ovc-navb" onClick={() => shift(-1)} title="Previous"><I.Chevron dir="left" size={14} /></button>
            <button className="btn dark ovc-today" onClick={() => { setAnchor(new Date()); if (view === 'day') setSelDay(todayDow === 'SUN' ? 'MON' : todayDow) }}>Today</button>
            <button className="ovc-navb" onClick={() => shift(1)} title="Next"><I.Chevron dir="right" size={14} /></button>
          </div>
          <button className="btn ovc-newb" onClick={() => { setPrefill(null); setAddOpen(true) }}><I.Plus size={13} /> New booking</button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="card ovc-mcard">
          <div className="ovc-mhead">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="ovc-mgrid">
            {monthCells(anchor).map((d, i) => {
              const inMonth = d.getMonth() === anchor.getMonth()
              const dow = DOW[(d.getDay() + 6) % 7]
              const n = counts[dow] || 0
              const isToday = sameDay(d, today)
              return (
                <button key={i} className={`ovc-mcell${inMonth ? '' : ' out'}${isToday ? ' today' : ''}`}
                  onClick={() => { if (inMonth) { setSelDay(dow); setAnchor(new Date(d)); setView('day') } }}>
                  <span className="ovc-mn">{d.getDate()}</span>
                  {inMonth && dow !== 'SAT' && dow !== 'SUN' && n > 0 && (
                    <span className="ovc-mdots"><i className="d-cse" /><i className="d-ece" /><span className="ovc-mcount">{n}</span></span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="muted small" style={{ marginTop: 12 }}>
            The generated timetable is a recurring weekly pattern — month cells preview each weekday’s typical load. Click a day for its full schedule.
          </div>
        </div>
      ) : (
        <>
          {strip}
          <div className="ovc-gridwrap" style={{ maxHeight: view === 'day' ? 'calc(100vh - 320px)' : 'calc(100vh - 350px)' }}>
            {grid(view === 'day' ? [selDay] : DOW, view === 'day' ? 6 : 5, view === 'day')}
          </div>
          <div className="ovc-legend">
            {DEPT_LEGEND.map(([k, label]) => <span key={k} className="ovc-lg"><i className={`d-${k}`} /> {label}</span>)}
            <span className="ovc-lg"><i className="d-bk" /> Reservation</span>
            <span className="spacer" />
            <span className="ovc-lg-note">
              full detail on the <Link to={`/board?day=${view === 'day' ? selDay : todayDow}`}>Mosaic Board</Link>
            </span>
          </div>
        </>
      )}

      {addOpen && (
        <div className="ovc-add-wrap">
          <AddBookingCard key={`${prefill?.day || '-'}-${prefill?.from || '-'}`} prefill={prefill} week={week}
            onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); data.reload?.() }} />
        </div>
      )}
    </div>
  )
}
