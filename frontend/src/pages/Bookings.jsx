// TESSERA Bookings — create / modify / cancel / approve venue requests.
// · NL composer: text → structured draft (backend ai-draft). Extraction is
//   NOT an approved booking — the user confirms, then it's a PENDING request.
// · Compatible spaces: client-side match over the directory (labelled).
// · Detail drawer with real AI explanation + real decide (DecideModal).
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, getUser } from '../api.js'
import { Hero, useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import DecideModal from './DecideModal.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS } from '../data/campus.js'

const ROLE_CAP = { admin: 'institute_event', faculty: 'guest_lecture', department_coordinator: 'department_event', club: 'club_event' }
const TABS = ['all', 'pending', 'approved', 'alternative_offered', 'rejected']
const TAB_LABEL = { all: 'All', pending: 'Pending', approved: 'Approved', alternative_offered: 'Alternatives', rejected: 'Rejected' }

function StatusBadge({ s }) {
  if (s === 'approved') return <span className="badge ok">approved</span>
  if (s === 'rejected') return <span className="badge bad">rejected</span>
  if (s === 'alternative_offered') return <span className="badge warn">alternative</span>
  return <span className="badge violet">pending</span>
}

/* --------------------------------------------------------- compatible spaces (client-side) */
function compatibleSpaces(form) {
  const att = +form.attendance || 0
  const needs = form.needs || []
  const types = form.room_types || []
  return ROOMS.filter((r) =>
    (types.length === 0 || types.includes(r.type)) &&
    r.capacity >= att &&
    needs.every((n) => (r.features || []).includes(n) || (n === 'accessible' && r.accessible))
  ).sort((a, b) => a.capacity - b.capacity)
}

/* --------------------------------------------------------- detail drawer */
function DetailDrawer({ booking, refdata, onClose, onDecide, onReload }) {
  const user = getUser()
  const toast = useToast()
  const [explain, setExplain] = useState(null)
  const [busy, setBusy] = useState(false)
  const d = booking.decision, r = booking.request
  const canDecide = ['admin', 'department_coordinator'].includes(user?.role)
  const isOwn = d.request_id.startsWith('MB-')

  const doExplain = async () => {
    setBusy(true)
    try {
      const res = await api('/ai/explain', { method: 'POST', body: { kind: 'booking', id: d.request_id } })
      setExplain({ text: res.explanation, llm: res.llm_used })
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  return (
    <div className="drawer-host">
      <div className="shade" onClick={onClose} />
      <div className="drawer">
        <div className="d-hd">
          <I.Bookmark size={17} />
          <div>
            <h3>{r.title || d.request_id}</h3>
            <div className="mono small muted">{d.request_id}{isOwn ? ' · manual' : ' · dataset'} · {r.requester || '—'}</div>
          </div>
          <span className="spacer" />
          <StatusBadge s={d.status} />
          <button className="btn ghost sm" onClick={onClose}><I.XMark size={14} /></button>
        </div>
        <div className="d-bd">
          <div className="grid cols-2" style={{ gap: 10 }}>
            <div className="stat" style={{ padding: 12 }}><div className="statlabel">Category</div><div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{r.role} → {r.requested_category}</div></div>
            <div className="stat" style={{ padding: 12 }}><div className="statlabel">Size</div><div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{r.attendance} · {r.duration_periods} period(s)</div></div>
          </div>

          <div className="anno mt" style={{ marginTop: 16 }}>Requested windows</div>
          <div className="row wrap mt" style={{ marginTop: 7, gap: 6 }}>
            {(r.windows || []).map((w, i) => (
              <span key={i} className="chip">{w.day} · {S.rangeLabel(w.from_period, w.to_period)}</span>
            ))}
          </div>

          <div className="row wrap mt" style={{ gap: 6 }}>
            {(r.room_types || []).map((t) => <span key={t} className="chip">{S.roomTypeLabel(t)}</span>)}
            {(r.needs || []).map((n) => <span key={n} className="chip">{n}</span>)}
            {r.requested_room && <span className="chip on">{r.requested_room}</span>}
          </div>

          {r.notes && <p className="small muted mt" style={{ marginTop: 10 }}>{r.notes}</p>}

          <div className="anno mt" style={{ marginTop: 16 }}>Decision</div>
          <div className={`vres mt ${d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'bad' : d.status === 'alternative_offered' ? 'warn' : 'violet'}`} style={{ marginTop: 8 }}>
            <span className="vi">{d.status === 'approved' ? <I.Check size={14} /> : d.status === 'rejected' ? <I.XMark size={14} /> : d.status === 'alternative_offered' ? <I.Alert size={14} /> : <I.Clock size={14} />}</span>
            <div>
              {d.room_id
                ? <b className="mono">{d.room_id} · {d.day} · P{d.start_period}–P{d.end_period}</b>
                : <span>{d.reason || 'awaiting decision'}</span>}
            </div>
          </div>

          {explain && (
            <div className="mt" style={{ marginTop: 10 }}>
              <div className="vres violet"><span className="vi"><I.Sparkle size={14} /></span>
                <div style={{ fontSize: 12.5 }}>{explain.text}
                  {explain.llm && <span className="badge violet" style={{ marginLeft: 6 }}>LLM-assisted</span>}
                </div>
              </div>
            </div>
          )}

          {r.raw_text && (
            <>
              <div className="anno mt" style={{ marginTop: 16 }}>Original request text</div>
              <p className="small mt" style={{ marginTop: 7, background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: '9px 11px' }}>{r.raw_text}</p>
            </>
          )}
        </div>
        <div className="d-ft">
          <button className="btn" onClick={doExplain} disabled={busy}>
            {busy ? <span className="spin" /> : <I.Sparkle size={14} />} Why this decision?
          </button>
          <span className="spacer" />
          {canDecide && (
            <button className="btn primary" onClick={() => onDecide(booking)}>
              {d.status === 'pending' ? 'Decide' : 'Re-decide'}
            </button>
          )}
          {!canDecide && d.status === 'pending' && (
            <span className="small muted">Waiting for a coordinator/admin.</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- NL composer */
function Composer({ onCreated, prefillRoom }) {
  const user = getUser()
  const toast = useToast()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const eff = form ?? draft

  useEffect(() => {
    if (prefillRoom && !eff) {
      const rm = S.roomById[prefillRoom]
      if (rm) {
        setDraft({
          title: '', role: user?.role || 'club',
          requested_category: ROLE_CAP[user?.role] || 'club_event',
          attendance: 60, duration_periods: 2,
          windows: [{ day: 'FRI', from_period: 10, to_period: 11 }],
          room_types: [rm.type], needs: [], requested_room: rm.id,
          mandatory_for_groups: [], notes: '',
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRoom])

  const parse = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const r = await S.postAIDraft(text)
      setDraft(r.draft); setForm(null)
      if (r.follow_up) toast(`Extraction follow-up: ${r.follow_up}`, 'err')
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const compat = eff ? compatibleSpaces(eff) : []

  const submit = async () => {
    if (!eff) return
    setBusy(true)
    try {
      const res = await S.postBooking(eff)
      toast(`${res.message || 'Request recorded.'} It is PENDING — a coordinator or admin will decide it.`)
      setDraft(null); setForm(null); setText('')
      onCreated()
    } catch (e) {
      toast(typeof e.detail === 'string' ? e.detail : e.detail?.problems?.join?.('; ') || e.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="hd">
        <h3 className="row" style={{ gap: 8 }}><I.Sparkle size={16} /> New venue request</h3>
        <span className="anno hd-anno v">natural language → structured draft → pending decision</span>
      </div>
      <div className="row wrap" style={{ rowGap: 10 }}>
        <textarea className="input" rows={2} style={{ flex: '2 1 380px' }}
          placeholder='Describe it in plain words — e.g. "Dramatics ko Friday shaam 6 se 8 baje tak auditorium chahiye, 150 log, stage aur mic"'
          value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn ai sm" disabled={busy || !text.trim()} onClick={parse} style={{ alignSelf: 'flex-end' }}>
          {busy && !eff ? <span className="spin" /> : <I.Sparkle size={13} />} Parse request
        </button>
      </div>

      {eff && (
        <div className="mt" style={{ marginTop: 14 }}>
          <div className="vres info">
            <span className="vi"><I.Info size={14} /></span>
            <div style={{ fontSize: 12.5 }}>
              This is an <b>extraction, not a booking</b>. Nothing is reserved until you submit and a coordinator/admin approves it.
            </div>
          </div>

          <div className="grid cols-4 mt" style={{ marginTop: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="fld">Title</label>
              <input className="input" value={eff.title || ''} onChange={(e) => setForm({ ...eff, title: e.target.value })} />
            </div>
            <div>
              <label className="fld">Attendance</label>
              <input className="input" type="number" min={1} value={eff.attendance || 0}
                onChange={(e) => setForm({ ...eff, attendance: +e.target.value })} />
            </div>
            <div>
              <label className="fld">Duration (periods)</label>
              <input className="input" type="number" min={1} max={13} value={eff.duration_periods || 1}
                onChange={(e) => setForm({ ...eff, duration_periods: +e.target.value })} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="fld">Window</label>
              <WindowPicker form={eff} setForm={(f) => setForm({ ...eff, windows: f.windows })} />
            </div>
            <div>
              <label className="fld">Category</label>
              <input className="input" disabled value={`${eff.role} → ${eff.requested_category}`} />
            </div>
          </div>

          <label className="fld">Room types (any)</label>
          <div className="row wrap" style={{ rowGap: 5 }}>
            {['classroom', 'lecture_hall', 'auditorium', 'seminar_hall', 'outdoor', 'lab_cs', 'lab_elec', 'lab_phy', 'lab_civil', 'workshop'].map((t) => (
              <button key={t} className={`chip ${(eff.room_types || []).includes(t) ? 'on' : ''}`}
                onClick={() => setForm({ ...eff, room_types: (eff.room_types || []).includes(t)
                  ? eff.room_types.filter((x) => x !== t) : [...(eff.room_types || []), t] })}>
                {S.roomTypeLabel(t)}
              </button>
            ))}
          </div>

          <label className="fld">Equipment needed</label>
          <div className="row wrap" style={{ rowGap: 5 }}>
            {['projector', 'pa_system', 'stage', 'computers', 'accessible', 'ac', 'power_benches'].map((n) => (
              <button key={n} className={`chip ${(eff.needs || []).includes(n) ? 'on' : ''}`}
                onClick={() => setForm({ ...eff, needs: (eff.needs || []).includes(n)
                  ? eff.needs.filter((x) => x !== n) : [...(eff.needs || []), n] })}>
                {n}
              </button>
            ))}
          </div>

          {/* compatible spaces — client-side */}
          <div className="row wrap mt" style={{ marginTop: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 150px' }}>
              <div className="anno">Compatible spaces</div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {compat.length} match · front-end match over the directory
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, flexWrap: 'wrap' }}>
              {compat.slice(0, 10).map((r) => (
                <button key={r.id}
                  className={`chip ${eff.requested_room === r.id ? 'on' : ''}`}
                  onClick={() => setForm({ ...eff, requested_room: r.id })}
                  title={`${r.name} · ${r.building} · ${r.capacity} seats`}>
                  {r.id} · {r.capacity}
                </button>
              ))}
              {compat.length === 0 && <span className="badge bad">no room matches — adjust type/size/equipment</span>}
              {eff.requested_room && (
                <button className="btn ghost sm" onClick={() => setForm({ ...eff, requested_room: null })}>
                  <I.XMark size={12} /> clear preference
                </button>
              )}
            </div>
          </div>

          <div className="row mt" style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={busy || !eff.title?.trim()} onClick={submit}>
              {busy ? <span className="spin" /> : <I.ArrowRight size={14} />} Submit as pending request
            </button>
            <button className="btn ghost" onClick={() => { setDraft(null); setForm(null) }}>Discard draft</button>
          </div>
        </div>
      )}
    </div>
  )
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
function WindowPicker({ form, setForm }) {
  const w0 = form.windows?.[0] || { day: 'FRI', from_period: 11, to_period: 13 }
  const patch = (p) => setForm({ ...form, windows: [{ ...w0, ...p }] })
  return (
    <div className="row wrap">
      <select className="input" style={{ width: 84 }} value={w0.day} onChange={(e) => patch({ day: e.target.value })}>
        {DAYS.map((d) => <option key={d}>{d}</option>)}
      </select>
      <select className="input" style={{ width: 74 }} value={w0.from_period} onChange={(e) => patch({ from_period: +e.target.value })}>
        {Array.from({ length: 13 }, (_, i) => <option key={i + 1} value={i + 1}>P{i + 1}</option>)}
      </select>
      <select className="input" style={{ width: 74 }} value={w0.to_period} onChange={(e) => patch({ to_period: +e.target.value })}>
        {Array.from({ length: 13 }, (_, i) => <option key={i + 1} value={i + 1}>P{i + 1}</option>)}
      </select>
    </div>
  )
}

/* --------------------------------------------------------- page */
export default function Bookings({ user }) {
  const toast = useToast()
  const data = useData()
  const [sp] = useSearchParams()
  const [list, setList] = useState(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [decideFor, setDecideFor] = useState(null)
  const canDecide = ['admin', 'department_coordinator'].includes(user?.role)

  const load = () => S.getBookings().then(setList).catch((e) => toast(e.message, 'err'))
  useEffect(() => { load() }, [])

  const rows = useMemo(() => (list?.bookings || []).filter((b) =>
    filter === 'all' ? true : b.decision.status === filter), [list, filter])
  const counts = useMemo(() => {
    const c = { all: 0, approved: 0, alternative_offered: 0, rejected: 0, pending: 0 }
    for (const b of list?.bookings || []) { c.all++; c[b.decision.status] = (c[b.decision.status] || 0) + 1 }
    return c
  }, [list])

  return (
    <div>
      <Hero compact
        eyebrow="Bookings"
        title={<>Events find <em>their room.</em></>}
        sub="Fest-week venue requests: describe in plain words or fill the form, get a structured draft, then a real decision from a coordinator or admin."
      >
        <div className="row" style={{ gap: 7 }}>
          {TABS.map((t) => (
            <button key={t} className={`btn sm ${filter === t ? 'primary' : ''}`} onClick={() => setFilter(t)}>
              {TAB_LABEL[t]} <span className="mono" style={{ opacity: .65 }}>{counts[t] || 0}</span>
            </button>
          ))}
        </div>
      </Hero>

      <Composer onCreated={load} prefillRoom={sp.get('room') || ''} />

      <div className="card mt">
        <div className="hd">
          <h3>All requests</h3>
          <span className="anno hd-anno">backend-validated decisions</span>
        </div>
        {!list ? <TesseraEmpty title="Loading requests…" /> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Request</th><th>Title</th><th>Role → category</th><th>Size</th>
                <th>Windows</th><th>Status</th><th>Placement / reason</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const d = b.decision, r = b.request
                return (
                  <tr key={d.request_id} className="click" onClick={() => setOpen(b)}>
                    <td className="mono">{d.request_id}</td>
                    <td>
                      <b>{r.title || '—'}</b>
                      {d.request_id.startsWith('MB-') && <span className="badge violet" style={{ marginLeft: 6 }}>manual</span>}
                    </td>
                    <td><span className="small">{r.role} → {r.requested_category}</span></td>
                    <td>{r.attendance} · {r.duration_periods}p</td>
                    <td className="small mono">{(r.windows || []).map((w) => `${w.day} P${w.from_period}–${w.to_period}`).join(', ') || '—'}</td>
                    <td><StatusBadge s={d.status} /></td>
                    <td className="small">
                      {d.room_id
                        ? <span className="mono">{d.room_id} {d.day} P{d.start_period}–P{d.end_period}</span>
                        : <span className="muted" style={{ maxWidth: 300, display: 'inline-block' }}>{d.reason || ''}</span>}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 5 }} onClick={(e) => e.stopPropagation()}>
                        {canDecide && d.status === 'pending' && (
                          <button className="btn sm primary" onClick={() => setDecideFor(b)}>decide</button>
                        )}
                        {canDecide && d.status !== 'pending' && (
                          <button className="btn ghost sm" onClick={() => setDecideFor(b)}>re-decide</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8}><TesseraEmpty title="Nothing here" sub={`No ${filter === 'all' ? '' : TAB_LABEL[filter].toLowerCase() + ' '}requests.`} /></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <DetailDrawer booking={open} onClose={() => setOpen(null)}
          onDecide={(b) => { setOpen(null); setDecideFor(b) }} onReload={load} />
      )}
      {decideFor && (
        <DecideModal booking={decideFor} refdata={data?.ref} user={user}
          onClose={() => setDecideFor(null)} onDone={() => { setDecideFor(null); load() }} />
      )}
    </div>
  )
}
