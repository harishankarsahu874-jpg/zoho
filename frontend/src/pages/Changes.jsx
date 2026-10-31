import React, { useEffect, useMemo, useState } from 'react'
import { api, getUser } from '../api.js'
import { useToast } from '../App.jsx'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

export default function Changes() {
  const user = getUser()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [ref, setRef] = useState(null)
  const [open, setOpen] = useState(null)

  // NL input
  const [nl, setNl] = useState('')
  const [nlBusy, setNlBusy] = useState(false)

  // structured form
  const [ftype, setFtype] = useState('faculty_unavailable')
  const [fid, setFid] = useState('')
  const [rid, setRid] = useState('')
  const [sid, setSid] = useState('')
  const [day, setDay] = useState('MON')
  const [pfrom, setPfrom] = useState(1)
  const [pto, setPto] = useState(9)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('/changes').then(setData).catch((e) => toast(e.message, 'err'))
  useEffect(() => {
    api('/reference').then(setRef).catch(() => {})
    load()
  }, [])

  // poll while any proposal is computing
  useEffect(() => {
    if (!data) return
    if (!data.changes.some((c) => c.status === 'pending' && c.proposal?.stability == null && !c.proposal?.infeasible)) return
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [data])

  const submitNL = async () => {
    if (!nl.trim()) return
    setNlBusy(true)
    try {
      const r = await api('/ai/change', { method: 'POST', body: { question: nl } })
      if (!r.ok) { toast(r.follow_up || 'Could not parse that change.', 'err'); return }
      toast(`Parsed: ${r.summary}`)
      setNl('')
      load()
    } catch (e) { toast(e.message, 'err') } finally { setNlBusy(false) }
  }

  const submitForm = async () => {
    setBusy(true)
    try {
      let changes = []
      if (ftype === 'faculty_unavailable') {
        if (!fid) throw new Error('pick a faculty')
        changes = [{ type: 'faculty_unavailable', faculty_id: fid, days: [day], periods: range(pfrom, pto), reason: why }]
      } else if (ftype === 'room_unavailable') {
        if (!rid) throw new Error('pick a room')
        changes = [{ type: 'room_unavailable', room_id: rid, days: [day], periods: range(pfrom, pto), reason: why }]
      } else if (ftype === 'remove_session') {
        if (!sid) throw new Error('pick a session')
        changes = [{ type: 'remove_session', session_id: sid }]
      } else if (ftype === 'add_session') {
        if (!sid) throw new Error('pick the new session template id')
        changes = [{ type: 'add_session', session: { ...templateSession(ref), id: sid } }]
      }
      await api('/changes', { method: 'POST', body: { changes } })
      toast('Change submitted — the least-moves proposal is being computed.')
      setWhy('')
      load()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const act = async (id, kind) => {
    try {
      const r = await api(`/changes/${id}/${kind}`, { method: 'POST' })
      toast(kind === 'approve' ? `Approved — ${r.stability?.sessions_moved ?? 0} sessions moved.` : 'Change rejected.')
      load()
    } catch (e) { toast(e.message, 'err') }
  }

  return (
    <div>
      <div className="grid cols-2 mb">
        <div className="card">
          <h3>✦ Describe the change (English / Hinglish)</h3>
          <textarea className="input" rows={2} placeholder="e.g. “F07 is on leave all Monday” or “CR-101 under maintenance Friday morning” or “remove session CS202-T2”"
            value={nl} onChange={(e) => setNl(e.target.value)} />
          <div className="row mt">
            <button className="btn primary sm" disabled={nlBusy} onClick={submitNL}>
              {nlBusy ? <span className="spin" /> : 'Parse & submit'}
            </button>
            <span className="small muted">Parsed into a structured change; the solver then proposes the least-moves repair for admin approval.</span>
          </div>
        </div>
        <div className="card">
          <h3>Structured change</h3>
          <label className="fld">Type</label>
          <select className="input" value={ftype} onChange={(e) => setFtype(e.target.value)}>
            <option value="faculty_unavailable">Faculty unavailable</option>
            <option value="room_unavailable">Room unavailable</option>
            <option value="remove_session">Remove session</option>
            <option value="add_session">Add session</option>
          </select>
          <div className="row mt">
            {ftype === 'faculty_unavailable' && (
              <select className="input" value={fid} onChange={(e) => setFid(e.target.value)}>
                <option value="">faculty…</option>
                {(ref?.faculty || []).map((f) => <option key={f}>{f}</option>)}
              </select>
            )}
            {(ftype === 'room_unavailable') && (
              <select className="input" value={rid} onChange={(e) => setRid(e.target.value)}>
                <option value="">room…</option>
                {(ref?.rooms || []).map((r) => <option key={r.id}>{r.id} (cap {r.capacity})</option>)}
              </select>
            )}
            {(ftype === 'remove_session' || ftype === 'add_session') && (
              <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
                <option value={ftype === 'remove_session' ? 'session id…' : 'new session id (e.g. CS202-T9)'}>{ftype === 'remove_session' ? 'session id…' : 'new session id (e.g. CS202-T9)'}</option>
                {(ref?.sessions || []).map((s) => <option key={s.id} value={s.id}>{s.id} — {s.course}</option>)}
              </select>
            )}
            {(ftype === 'faculty_unavailable' || ftype === 'room_unavailable') && (
              <>
                <select className="input" style={{ width: 90 }} value={day} onChange={(e) => setDay(e.target.value)}>
                  {DAYS.map((d) => <option key={d}>{d}</option>)}
                </select>
                <select className="input" style={{ width: 90 }} value={pfrom} onChange={(e) => setPfrom(+e.target.value)}>
                  {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>P{i + 1}</option>)}
                </select>
                <select className="input" style={{ width: 90 }} value={pto} onChange={(e) => setPto(+e.target.value)}>
                  {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>P{i + 1}</option>)}
                </select>
              </>
            )}
          </div>
          <label className="fld">Reason</label>
          <input className="input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. on medical leave" />
          <div className="mt">
            <button className="btn primary sm" disabled={busy} onClick={submitForm}>
              {busy ? <span className="spin" /> : 'Submit change request'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Change requests</h3>
        {!data?.changes?.length && <div className="empty">No change requests yet.</div>}
        {data?.changes?.map((c) => (
          <div key={c.id} style={{ borderBottom: '1px solid #f0f2f5', padding: '12px 0' }}>
            <div className="row wrap">
              <span className="mono small">#{c.id}</span>
              <b>{describeChanges(c.payload.changes)}</b>
              <span className="spacer" />
              <ChangeStatusBadge c={c} />
              <button className="btn ghost sm" onClick={() => setOpen(open === c.id ? null : c.id)}>
                {open === c.id ? 'hide diff' : 'view diff'}
              </button>
              {user?.role === 'admin' && c.status === 'pending' && proposalReady(c) && (
                <>
                  <button className="btn sm primary" onClick={() => act(c.id, 'approve')}>approve</button>
                  <button className="btn sm danger" onClick={() => act(c.id, 'reject')}>reject</button>
                </>
              )}
              {user?.role === 'admin' && c.status === 'pending' && !proposalReady(c) && (
                <button className="btn sm" disabled><span className="spin dark" /> computing…</button>
              )}
            </div>
            <div className="small muted">by {c.created_by} · {new Date(c.created_at).toLocaleString()}</div>
            {c.proposal?.infeasible && (
              <div className="badge bad" style={{ marginTop: 8 }}>
                No feasible repair: {c.proposal.reason}
              </div>
            )}
            {open === c.id && c.proposal?.schedule && (
              <DiffView c={c} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function proposalReady(c) {
  const p = c.proposal || {}
  return !p.infeasible && (p.stability != null)
}

function ChangeStatusBadge({ c }) {
  if (c.status === 'approved') return <span className="badge ok">approved</span>
  if (c.status === 'rejected') return <span className="badge bad">rejected</span>
  if (c.proposal?.infeasible) return <span className="badge bad">infeasible</span>
  if (proposalReady(c)) return <span className="badge info">proposal ready</span>
  return <span className="badge warn">computing proposal…</span>
}

function describeChanges(changes) {
  return (changes || []).map((c) => {
    if (c.type === 'faculty_unavailable') return `${c.faculty_id} unavailable ${c.days?.join(',')} P${Math.min(...c.periods || [])}–P${Math.max(...c.periods || [])}`
    if (c.type === 'room_unavailable') return `room ${c.room_id} unavailable ${c.days?.join(',')} P${Math.min(...c.periods || [])}–P${Math.max(...c.periods || [])}`
    if (c.type === 'remove_session') return `remove ${c.session_id}`
    if (c.type === 'add_session') return `add ${c.session?.id}`
    return c.type
  }).join(' · ')
}

function range(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

function templateSession(ref) {
  const s = (ref?.sessions || [])[0]
  return { course_id: 'CS202', kind: 'tutorial', groups: ['Y2-A'], faculty_id: 'F20', size: 40, duration: 1, room_types: ['classroom', 'lecture_hall'], needs_accessible: false, basket_slot: null, fixed_slot: null }
}

function DiffView({ c }) {
  const stab = c.proposal.stability || {}
  const moved = stab.moved_ids || []
  return (
    <div className="mt">
      <div className="row wrap mb">
        <span className="badge warn">{stab.sessions_moved} sessions moved</span>
        <span className="badge muted">{stab.time_changed} time changed · {stab.room_only_changed} room-only</span>
        <span className={`badge ${c.proposal.hard_count === 0 ? 'ok' : 'bad'}`}>
          {c.proposal.hard_count === 0 ? '0 hard violations' : `${c.proposal.hard_count} hard violations`}
        </span>
        <span className="badge info">soft {c.proposal.soft_total}</span>
      </div>
      <DiffLines c={c} />
    </div>
  )
}

function DiffLines({ c }) {
  const [lines, setLines] = useState(null)
  const movedFrom = c.proposal.moved_from || {}
  useEffect(() => {
    let on = true
    // new placements come from the full proposal (detail endpoint)
    api(`/changes/${c.id}`).then((full) => {
      if (!on) return
      const propMap = Object.fromEntries(
        (full.proposal?.schedule?.sessions || []).map((s) => [s.session_id, s]))
      const moved = Object.keys(movedFrom).length
        ? Object.keys(movedFrom)
        : full.proposal?.stability?.moved_ids || []
      const out = moved.map((sid) => ({
        sid,
        old: movedFrom[sid] || null,
        neu: propMap[sid] || null,
      }))
      setLines(out)
    }).catch(() => setLines([]))
    return () => { on = false }
  }, [c.id, c.status])
  if (!lines) return <div className="muted small"><span className="spin dark" /> loading diff…</div>
  return (
    <>
      {lines.map(({ sid, old, neu }) => (
        <div key={sid}>
          <div className="diff-line old">− {sid} · {old ? `${old[0]} P${old[1]} in ${old[2]}` : '—'}</div>
          <div className="diff-line new">+ {sid} · {neu ? `${neu.day} P${neu.start_period} in ${neu.room_id}` : '—'}</div>
        </div>
      ))}
      {lines.length === 0 && <div className="muted small">No sessions needed to move.</div>}
    </>
  )
}
