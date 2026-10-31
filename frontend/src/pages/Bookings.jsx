import React, { useEffect, useMemo, useState } from 'react'
import { api, getUser } from '../api.js'
import { Hero, useToast } from '../App.jsx'
import DecideModal from './DecideModal.jsx'

const ROLE_CAP = { admin: 'institute_event', faculty: 'guest_lecture', department_coordinator: 'department_event', club: 'club_event' }

export default function Bookings() {
  const user = getUser()
  const toast = useToast()
  const [ref, setRef] = useState(null)
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [decideFor, setDecideFor] = useState(null)
  const [explainFor, setExplainFor] = useState(null)
  const canDecide = ['admin', 'department_coordinator'].includes(user?.role)

  const load = () => api('/bookings').then(setData).catch((e) => toast(e.message, 'err'))
  useEffect(() => {
    api('/reference').then(setRef).catch(() => {})
    load()
  }, [])

  const rows = useMemo(() => (data?.bookings || []).filter((b) =>
    filter === 'all' ? true : b.decision.status === filter), [data, filter])

  const counts = useMemo(() => {
    const c = { approved: 0, alternative_offered: 0, rejected: 0, pending: 0 }
    for (const b of data?.bookings || []) c[b.decision.status] = (c[b.decision.status] || 0) + 1
    return c
  }, [data])

  const explain = async (rid) => {
    try {
      const r = await api('/ai/explain', { method: 'POST', body: { kind: 'booking', id: rid } })
      setExplainFor({ rid, text: r.explanation, llm: r.llm_used, status: r.decision?.status })
    } catch (e) { toast(e.message, 'err') }
  }

  return (
    <div>
      <Hero compact eyebrow="Spectra Week" title="Venue Bookings"
        sub="Plain-English or form-based venue requests, decided by coordinators with explainable, constraint-checked reasons." />
      <NewBooking refdata={ref} onCreated={load} />
      <div className="card mt">
        <div className="row wrap mb">
          <h3 style={{ fontSize: 15 }}>All requests</h3>
          <span className="badge ok">{counts.approved} approved</span>
          <span className="badge warn">{counts.alternative_offered} alternatives</span>
          <span className="badge bad">{counts.rejected} rejected</span>
          <span className="badge muted">{counts.pending} pending</span>
          <span className="spacer" />
          <select className="input" style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="alternative_offered">Alternative offered</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>Request</th><th>Title</th><th>Role → category</th><th>Size</th><th>Windows</th><th>Status</th><th>Placement / reason</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const d = b.decision, r = b.request
              return (
                <tr key={d.request_id}>
                  <td className="mono">{d.request_id}</td>
                  <td>
                    <b>{r.title || '—'}</b>
                    {d.request_id.startsWith('MB-') && <span className="badge violet" style={{ marginLeft: 6 }}>manual</span>}
                  </td>
                  <td><span className="small">{r.role} → {r.requested_category}</span></td>
                  <td>{r.attendance} · {r.duration_periods}p</td>
                  <td className="small">{(r.windows || []).map((w) => `${w.day} P${w.from_period}–P${w.to_period}`).join(', ') || '—'}</td>
                  <td><StatusBadge s={d.status} /></td>
                  <td className="small">
                    {d.room_id
                      ? <span className="mono">{d.room_id} {d.day} P{d.start_period}–P{d.end_period}</span>
                      : <span className="muted" style={{ maxWidth: 340, display: 'inline-block' }}>{d.reason || ''}</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 5 }}>
                      <button className="btn ghost sm" onClick={() => explain(d.request_id)}>why?</button>
                      {canDecide && d.status !== 'pending' && (
                        <button className="btn ghost sm" onClick={() => setDecideFor(b)}>re-decide</button>
                      )}
                      {canDecide && d.status === 'pending' && (
                        <button className="btn sm primary" onClick={() => setDecideFor(b)}>decide</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {decideFor && (
        <DecideModal booking={decideFor} refdata={ref} user={user}
          onClose={() => setDecideFor(null)} onDone={() => { setDecideFor(null); load() }} />
      )}
      {explainFor && (
        <div className="card mt" style={{ background: 'var(--brand-soft)', borderColor: '#c7d2fe' }}>
          <div className="row">
            <b>✦ Why {explainFor.rid} → {explainFor.status}?</b>
            {explainFor.llm && <span className="badge violet">LLM-assisted</span>}
            <span className="spacer" />
            <button className="btn ghost sm" onClick={() => setExplainFor(null)}>close</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{explainFor.text}</div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ s }) {
  if (s === 'approved') return <span className="badge ok">approved</span>
  if (s === 'alternative_offered') return <span className="badge warn">alternative</span>
  if (s === 'rejected') return <span className="badge bad">rejected</span>
  return <span className="badge muted">pending</span>
}

/* ------------------------------------------------------------------ */
function NewBooking({ refdata, onCreated }) {
  const toast = useToast()
  const user = getUser()
  const [mode, setMode] = useState('ai')
  const [text, setText] = useState('')
  const [draft, setDraft] = useState(null)
  const [followUp, setFollowUp] = useState([])
  const [busy, setBusy] = useState(false)

  const aiDraft = async () => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const r = await api('/bookings/ai-draft', { method: 'POST', body: { text } })
      setDraft(r.draft)
      setFollowUp(r.follow_up)
      if (r.problems?.length) toast(r.problems.join('; '), 'err')
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const blank = () => ({
    title: '', role: user?.role || 'club', requested_category: ROLE_CAP[user?.role] || 'club_event',
    attendance: 50, duration_periods: 2,
    windows: [{ day: 'FRI', from_period: 11, to_period: 13 }],
    room_types: ['classroom', 'lecture_hall'], needs: [], requested_room: null,
    mandatory_for_groups: [], notes: '',
  })
  const [form, setForm] = useState(null)
  const effForm = form ?? draft ?? null

  const submit = async () => {
    if (!effForm) return
    setBusy(true)
    try {
      await api('/bookings', { method: 'POST', body: effForm })
      toast('Booking request submitted — a coordinator/admin will decide it.')
      setDraft(null); setForm(null); setText(''); setFollowUp([])
      onCreated()
    } catch (e) {
      toast(e.detail?.problems?.join?.('; ') || e.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="row mb">
        <h3 style={{ fontSize: 15 }}>New venue request</h3>
        <div className="row">
          <button className={`btn sm ${mode === 'ai' ? 'primary' : ''}`} onClick={() => setMode('ai')}>✦ Describe it</button>
          <button className={`btn sm ${mode === 'form' ? 'primary' : ''}`} onClick={() => { setMode('form'); setForm(blank()) }}>Fill form</button>
        </div>
      </div>
      {mode === 'ai' && (
        <>
          <textarea className="input" rows={3} placeholder="e.g. “Dramatics society ko Friday shaam 6 baje se 2 ghante ke liye auditorium chahiye, 150 log, projector aur mic”"
            value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row mt">
            <button className="btn primary sm" disabled={busy} onClick={aiDraft}>{busy ? <span className="spin" /> : 'Parse →'}</button>
            {followUp.length > 0 && (
              <span className="badge warn">{followUp.join(' · ')}</span>
            )}
          </div>
        </>
      )}
      {effForm && (
        <BookingForm form={effForm} setForm={(f) => { setForm(f); setDraft(f) }} refdata={refdata} busy={busy} onSubmit={submit} />
      )}
    </div>
  )
}

const ROOM_TYPES = ['classroom', 'lecture_hall', 'auditorium', 'seminar_hall', 'outdoor', 'lab_cs', 'lab_elec', 'lab_phy', 'lab_civil', 'workshop']
const NEEDS = ['projector', 'pa_system', 'stage', 'computers', 'accessible', 'ac', 'power_benches']
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

function WindowPicker({ form, setForm }) {
  const w0 = form.windows?.[0] || { day: 'FRI', from_period: 11, to_period: 13 }
  const patch = (p) => setForm({ ...form, windows: [{ ...w0, ...p }] })
  return (
    <div className="row">
      <select className="input" style={{ width: 90 }} value={w0.day} onChange={(e) => patch({ day: e.target.value })}>
        {DAYS.map((d) => <option key={d}>{d}</option>)}
      </select>
      <span className="muted small">P</span>
      <select className="input" style={{ width: 80 }} value={w0.from_period} onChange={(e) => patch({ from_period: +e.target.value })}>
        {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
      </select>
      <span className="muted small">→ P</span>
      <select className="input" style={{ width: 80 }} value={w0.to_period} onChange={(e) => patch({ to_period: +e.target.value })}>
        {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
      </select>
    </div>
  )
}

function BookingForm({ form, setForm, refdata, busy, onSubmit }) {
  const set = (k, v) => setForm({ ...form, [k]: v })
  const toggleList = (k, v) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v])
  return (
    <div style={{ marginTop: 14, borderTop: '1px dashed var(--line)', paddingTop: 6 }}>
      <div className="row wrap">
        <div style={{ flex: '2 1 260px' }}>
          <label className="fld">Title</label>
          <input className="input" value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <label className="fld">Attendance</label>
          <input className="input" type="number" value={form.attendance || 0} onChange={(e) => set('attendance', +e.target.value)} />
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <label className="fld">Duration (periods)</label>
          <input className="input" type="number" min={1} max={13} value={form.duration_periods || 1} onChange={(e) => set('duration_periods', +e.target.value)} />
        </div>
      </div>
      <div className="row wrap">
        <div style={{ flex: '1 1 320px' }}>
          <label className="fld">Window (day + periods)</label>
          <WindowPicker form={form} setForm={(f) => setForm({ ...form, windows: f.windows })} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label className="fld">Preferred room (optional)</label>
          <select className="input" value={form.requested_room || ''} onChange={(e) => set('requested_room', e.target.value || null)}>
            <option value="">any matching room</option>
            {(refdata?.rooms || []).filter((r) => r.type === (form.room_types || [])[0] || r.type === 'auditorium' || r.type === 'outdoor' || r.type === 'lecture_hall' || r.type === 'seminar_hall' || r.type === 'classroom').map((r) => (
              <option key={r.id} value={r.id}>{r.id} (cap {r.capacity})</option>
            ))}
          </select>
        </div>
      </div>
      <label className="fld">Room types (any)</label>
      <div className="row wrap">
        {ROOM_TYPES.map((t) => (
          <label key={t} className={`badge ${(form.room_types || []).includes(t) ? 'info' : 'muted'}`} style={{ cursor: 'pointer' }}
            onClick={() => toggleList('room_types', t)}>
            {t}
          </label>
        ))}
      </div>
      <label className="fld">Needs</label>
      <div className="row wrap">
        {NEEDS.map((t) => (
          <label key={t} className={`badge ${(form.needs || []).includes(t) ? 'violet' : 'muted'}`} style={{ cursor: 'pointer' }}
            onClick={() => toggleList('needs', t)}>
            {t}
          </label>
        ))}
      </div>
      <div className="row mt">
        <button className="btn primary sm" disabled={busy} onClick={onSubmit}>
          {busy ? <span className="spin" /> : 'Submit request'}
        </button>
        <span className="small muted">
          It goes to a coordinator/admin for approval — hard constraints are checked server-side.
        </span>
      </div>
    </div>
  )
}

