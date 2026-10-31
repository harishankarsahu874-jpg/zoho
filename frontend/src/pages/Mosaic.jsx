// TESSERA Mosaic Board — the tile scheduler.
// · Week view: room lanes × days, period-stacked session tiles.
// · Drag-and-reflow with PRE-COMMIT, CLIENT-SIDE validation (clearly
//   labelled — the backend has no move endpoint; committing goes through
//   the real Rescheduling flow, which the solver re-plans and an admin approves).
// · Ripple Effect: original fades to outline, proposed slides in, connected
//   rooms/faculty/groups illuminate with animated links, change-cost panel.
// · Day / department / faculty / room / group views.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS, FACULTY, LAB_STARTS, LUNCH_AFTER, TEACHING_DAYS } from '../data/campus.js'
import { useToast } from '../App.jsx'

const P_TOP = (p) => (p - 1) * 34
const P_H = (dur) => dur * 34
const PERIODS = Array.from({ length: 13 }, (_, i) => i + 1)

const KIND_CLASS = { lab: 'tile-lab', lecture: 'tile-lecture' }

// ---------------------------------------------------------------- helpers
function tileLabel(p, room) {
  const meta = S.sessMetaOf(p.session_id) || {}
  return {
    t1: S.courseOf(p.session_id) || p.session_id,
    t2: `${meta.faculty || ''} · ${p.session_id}`,
    t3: meta.groups?.length ? meta.groups.join(' ') : '',
  }
}

// ---------------------------------------------------------------- ripple SVG
function RippleLines({ fromEl, toEl, affectedEls, boardRef }) {
  const [paths, setPaths] = useState(null)
  useEffect(() => {
    const b = boardRef.current
    if (!b || !fromEl || !toEl) { setPaths(null); return }
    const bR = b.getBoundingClientRect()
    const c = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left - bR.left + r.width / 2, y: r.top - bR.top + r.height / 2 }
    }
    const f = c(fromEl), t = c(toEl)
    const out = [{ d: `M ${f.x} ${f.y} C ${f.x + 60} ${f.y - 30}, ${t.x - 60} ${t.y - 30}, ${t.x} ${t.y}` }]
    for (const el of affectedEls) {
      if (!el) continue
      const a = c(el)
      out.push({ d: `M ${f.x} ${f.y} Q ${(f.x + a.x) / 2} ${(f.y + a.y) / 2 - 24}, ${a.x} ${a.y}` })
    }
    setPaths(out)
  }, [fromEl, toEl, affectedEls, boardRef])
  if (!paths) return null
  return (
    <svg className="ripple-svg">
      {paths.map((p, i) => <path key={i} d={p.d} />)}
    </svg>
  )
}

// ---------------------------------------------------------------- board
function MosaicBoard({ data, focus, toast }) {
  const { placements, festBookings, occupancy, ref } = data
  const [day, setDay] = useState('')            // '' = all days
  const [typeFilter, setTypeFilter] = useState('')
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(null)        // live drag state
  const [ripple, setRipple] = useState(null)    // settled preview under review
  const boardRef = useRef(null)
  const tileRefs = useRef({})
  const rafRef = useRef(0)

  const days = day ? [day] : TEACHING_DAYS
  const lanes = useMemo(() => ROOMS
    .filter((r) => !typeFilter || r.type === typeFilter)
    .filter((r) => !q || `${r.id} ${r.name} ${r.building}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.building + a.id).localeCompare(b.building + b.id)), [typeFilter, q])

  const types = useMemo(() => [...new Set(ROOMS.map((r) => r.type))].sort(), [])

  // ----- focus highlight
  useEffect(() => {
    if (!focus) return
    const el = tileRefs.current[focus]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      const t = setTimeout(() => {
        el.classList.remove('aff')
        // re-trigger
        void el.offsetWidth
        el.classList.add('aff')
      }, 300)
      return () => clearTimeout(t)
    }
  }, [focus, day, typeFilter, q, placements])

  // ----- drag engine (client-side preview; ref-mirrored state)
  const dragRef = useRef(null)
  const startDrag = (e, p) => {
    if (e.button !== 0) return
    e.preventDefault()
    const meta = S.sessMetaOf(p.session_id) || {}
    setRipple(null)
    const d = {
      sid: p.session_id, from: { day: p.day, start: p.start, end: p.end, room: p.room },
      duration: p.end - p.start + 1, size: meta.size, faculty: meta.faculty,
      room_types: meta.room_types, groups: meta.groups,
      target: null, result: null,
    }
    dragRef.current = d
    setDrag(d)
  }

  useEffect(() => {
    if (!drag) return
    const sessMap = Object.fromEntries((ref?.sessions || []).map((s) => [s.id, s]))
    const onMove = (e) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const d = dragRef.current
        if (!d) return
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const slot = el && el.closest('.slot[data-room]')
        const target = slot
          ? { room: slot.dataset.room, day: slot.dataset.day, start: +slot.dataset.period }
          : null
        let result = null
        if (target) {
          const same = target.room === d.from.room && target.day === d.from.day && target.start === d.from.start
          if (!same) {
            result = S.validateMove(
              { session_id: d.sid, day: target.day, start: target.start,
                duration: d.duration, room: target.room, faculty: d.faculty,
                size: d.size, room_types: d.room_types },
              { placements, occupancy, sessions: sessMap,
                labStarts: LAB_STARTS, days: TEACHING_DAYS, lunchAfter: LUNCH_AFTER })
          }
        }
        const nd = { ...d, target, result }
        dragRef.current = nd
        setDrag(nd)
      })
    }
    const onUp = () => {
      const d = dragRef.current
      if (d?.result && !d.result.noop) {
        setRipple({ from: d.from, to: d.target, result: d.result, sid: d.sid,
                    meta: S.sessMetaOf(d.sid) || {} })
      }
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cancelAnimationFrame(rafRef.current)
    }
  }, [drag, placements, occupancy, ref])

  // affected tile elements for ripple illumination
  const affectedIds = useMemo(() => {
    const r = ripple?.result
    if (!r) return new Set()
    const ids = new Set()
    for (const a of r.affected) {
      const [kind, id] = a.split(':')
      if (kind === 'room') for (const p of placements) if (p.room === id) ids.add(p.session_id)
      if (kind === 'fac') for (const p of placements) if ((S.sessMetaOf(p.session_id) || {}).faculty === id) ids.add(p.session_id)
      if (kind === 'grp') for (const p of placements) if ((S.sessMetaOf(p.session_id) || {}).groups?.includes(id)) ids.add(p.session_id)
    }
    return ids
  }, [ripple, placements])

  const verdict = drag?.result?.verdict
  const verdictCls = { valid: 'ok', warning: 'warn', invalid: 'bad' }[verdict] || 'info'

  return (
    <div>
      {/* controls */}
      <div className="row wrap mb" style={{ rowGap: 10 }}>
        <div className="seg">
          {['', 'MON', 'TUE', 'WED', 'THU', 'FRI'].map((d) => (
            <button key={d || 'all'} className={day === d ? 'active' : ''} onClick={() => setDay(d)}>
              {d ? d : 'Full week'}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={!typeFilter ? 'active' : ''} onClick={() => setTypeFilter('')}>All rooms</button>
          {types.map((t) => (
            <button key={t} className={typeFilter === t ? 'active' : ''} onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
              {S.roomTypeLabel(t)}
            </button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 210, flex: '0 0 auto' }} placeholder="Filter rooms…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <span className="chip">front-end check · client-side</span>
      </div>

      {/* drag status strip */}
      {drag && (
        <div className={`vres ${drag.result ? verdictCls : 'info'} mb`}>
          <span className="vi">
            {drag.result?.verdict === 'valid' ? <I.Check size={15} />
              : drag.result?.verdict === 'warning' ? <I.Alert size={15} />
              : drag.result?.verdict === 'invalid' ? <I.XMark size={15} />
              : <I.Drag size={15} />}
          </span>
          <div>
            <b>
              {S.courseOf(drag.sid) || drag.sid}
              {drag.result?.noop ? ' — no change' :
                drag.result ? ` → ${drag.target?.room} ${drag.target?.day} P${drag.target?.start} (front-end check)`
                  : ' — choose a target slot'}
            </b>
            {drag.result?.conflicts?.map((c, i) => <div key={i} className="small">✕ {c}</div>)}
            {drag.result?.warnings?.map((w, i) => <div key={'w' + i} className="small">△ {w}</div>)}
          </div>
        </div>
      )}

      {/* board */}
      <div className="board-wrap">
        <div className="board" ref={boardRef}>
          <table>
            <thead>
              <tr>
                <th className="lanehead">
                  Room
                  <div className="lh-sub">{lanes.length} lanes · P1–P13</div>
                </th>
                {days.map((d) => (
                  <th key={d} className="dayhead">{d}<div className="dh-date">{S.dayFull(d)}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lanes.map((rm) => (
                <tr key={rm.id}>
                  <td className="lanehead">
                    <div className="lh-name">{rm.name}</div>
                    <div className="lh-sub">{rm.id} · {rm.capacity} · {S.roomTypeLabel(rm.type)}</div>
                  </td>
                  {days.map((d) => {
                    const cellPl = placements.filter((p) => p.room === rm.id && p.day === d)
                    const cellBk = festBookings.filter((b) => b.room === rm.id && b.day === d)
                    return (
                      <td key={d} className="cell">
                        <div style={{ position: 'relative', height: PERIODS.length * 34 }}>
                          {PERIODS.map((p) => (
                            <div key={p} className={`slot ${p > 9 ? 'slot-even' : ''}`}
                              data-room={rm.id} data-day={d} data-period={p}
                              style={{ position: 'absolute', top: P_TOP(p), left: 0, right: 0, height: 34 }}>
                              <span className="pnum">P{p}</span>
                            </div>
                          ))}
                          {/* session tiles */}
                          {cellPl.map((p) => {
                            const isDragged = drag?.sid === p.session_id
                            const inRipple = ripple?.sid === p.session_id
                            const affected = (drag?.result || ripple?.result)?.affected
                            const isAff = affected?.has(`room:${rm.id}`) || affected?.has(`fac:${(S.sessMetaOf(p.session_id) || {}).faculty}`) ||
                              ((S.sessMetaOf(p.session_id) || {}).groups || []).some((g) => affected?.has(`grp:${g}`))
                            return (
                              <div key={p.session_id}
                                ref={(el) => { tileRefs.current[p.session_id] = el }}
                                className={`st-tile ${KIND_CLASS[p.kind] || ''}
                                  ${isDragged ? 'dragging src-muted' : ''}
                                  ${inRipple && !drag ? 'src-muted' : ''}
                                  ${isAff && !isDragged ? 'aff' : ''}`}
                                style={{ top: P_TOP(p.start) + 1, height: P_H(p.end - p.start + 1) - 2 }}
                                onMouseDown={(e) => startDrag(e, p)}
                                title={`${p.session_id} · ${S.courseOf(p.session_id)} · ${rm.id} · ${S.rangeLabel(p.start, p.end)}`}>
                                {(() => { const l = tileLabel(p, rm); return (
                                  <>
                                    <div className="tt1">{l.t1}</div>
                                    <div className="tt2">{l.t2}</div>
                                    {(p.end - p.start + 1) > 1 && <div className="tt3">{l.t3 || S.rangeLabel(p.start, p.end)}</div>}
                                  </>
                                ) })()}
                              </div>
                            )
                          })}
                          {/* booking tiles */}
                          {cellBk.map((b, i) => (
                            <div key={b.request_id + i} className="st-tile tile-booking"
                              style={{ top: P_TOP(b.start) + 1, height: P_H(b.end - b.start + 1) - 2 }}
                              title={`${b.request_id} · ${S.rangeLabel(b.start, b.end)}`}>
                              <div className="tt1">◆ {b.request_id}</div>
                              <div className="tt2">{S.rangeLabel(b.start, b.end)}</div>
                            </div>
                          ))}
                          {/* ghost */}
                          {drag && drag.target && drag.target.room === rm.id && drag.target.day === d && (
                            <div className={`st-tile ghost ${verdict === 'invalid' ? 'ghost-bad' : verdict === 'warning' ? 'ghost-warn' : ''}`}
                              style={{ top: P_TOP(drag.target.start) + 1, height: P_H(drag.duration) - 2 }}>
                              <div className="tt1">{S.courseOf(drag.sid) || drag.sid}</div>
                              <div className="tt2">{verdict === 'valid' ? 'front-end check ✓' : verdict === 'warning' ? 'warnings' : 'blocked'}</div>
                            </div>
                          )}
                          {/* ripple proposed tile */}
                          {ripple && !drag && ripple.to.room === rm.id && ripple.to.day === d && (
                            <div className={`st-tile ghost`}
                              style={{ top: P_TOP(ripple.to.start) + 1, height: P_H(ripple.result.duration) - 2 }}>
                              <div className="tt1">{S.courseOf(ripple.sid) || ripple.sid}</div>
                              <div className="tt2">proposed · front-end preview</div>
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* animated links */}
          {(() => {
            const srcEl = tileRefs.current[drag ? drag.sid : ripple?.sid]
            const affEls = [...affectedIds].filter((id) => id !== (drag ? drag.sid : ripple?.sid)).slice(0, 5)
              .map((id) => tileRefs.current[id])
            const tgtEl = drag?.target
              ? boardRef.current?.querySelector(`.slot[data-room="${drag.target.room}"][data-day="${drag.target.day}"][data-period="${drag.target.start}"]`)
              : null
            if (!srcEl) return null
            return <RippleLines fromEl={srcEl} toEl={tgtEl} affectedEls={affEls} boardRef={boardRef} />
          })()}
        </div>
      </div>

      {/* ripple / change-cost review */}
      {ripple && !drag && (
        <RipplePanel ripple={ripple} placements={placements} onClose={() => setRipple(null)} toast={toast} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- ripple review panel
function RipplePanel({ ripple, placements, onClose, toast }) {
  const { from, to, result, sid, meta } = ripple
  const canCommit = result.verdict === 'valid'
  const unchanged = placements.length - 1
  const [posting, setPosting] = useState(false)

  const fileChange = async (kind) => {
    setPosting(true)
    try {
      const changes = kind === 'room'
        ? [{ type: 'room_unavailable', room_id: from.room, day: from.day,
            periods: Array.from({ length: result.duration }, (_, i) => from.start + i),
            reason: `move requested: ${sid} → ${to.room} ${to.day} P${to.start} (front-end preview, filed by user)` }]
        : [{ type: 'faculty_unavailable', faculty_id: meta.faculty, day: from.day,
            periods: Array.from({ length: result.duration }, (_, i) => from.start + i),
            reason: `move requested: ${sid} → ${to.room} ${to.day} P${to.start} (front-end preview, filed by user)` }]
      const res = await S.postChange(changes)
      toast(`Change request #${res.change_id} filed — solver is computing the least-moves repair. Review it under Reports & Analytics.`)
      onClose()
    } catch (e) {
      toast(e.message, 'err')
    } finally { setPosting(false) }
  }

  const copyPlan = async () => {
    const txt =
      `TESSERA move plan (front-end preview, not committed)\n` +
      `Session: ${sid} (${S.courseOf(sid) || '—'}, faculty ${meta.faculty || '—'})\n` +
      `From: ${from.room} ${from.day} P${from.start}–P${from.end}\n` +
      `To:   ${to.room} ${to.day} P${to.start}–P${to.start + result.duration - 1}\n` +
      `Front-end checks: ${result.verdict}${result.warnings.length ? ' — ' + result.warnings.join('; ') : ''}\n` +
      `Affected: ${[...result.affected].join(', ') || 'none'}\n` +
      `Commit path: file as a rescheduling change → solver least-moves repair → admin approval.`
    try { await navigator.clipboard.writeText(txt); toast('Plan copied to clipboard.') }
    catch { toast('Could not access clipboard.', 'err') }
  }

  return (
    <div className="impact mt">
      <div className="ihd">
        <I.Sparkle size={17} />
        <h4>Ripple preview — {S.courseOf(sid) || sid}</h4>
        <span className="badge lime">front-end preview · not committed</span>
        <span className="spacer" />
        <button className="btn sm" onClick={onClose}><I.XMark size={13} /> Dismiss</button>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <span className={`vres ${{ valid: 'ok', warning: 'warn', invalid: 'bad' }[result.verdict] || 'info'}`}
          style={{ flex: '0 0 auto', padding: '6px 12px' }}>
          <span className="vi" style={{ width: 22, height: 22, flexBasis: 22 }}>
            {result.verdict === 'valid' ? <I.Check size={13} /> : result.verdict === 'warning' ? <I.Alert size={13} /> : <I.XMark size={13} />}
          </span>
          <div style={{ fontWeight: 600, fontFamily: 'var(--sans)', fontSize: 12.5 }}>{result.verdict}</div>
        </span>
        <span className="small muted">
          Client-side checks ran against the live week grid (rooms, faculty, capacity, groups, lab-slot rules).
          The backend solver re-validates on commit.
        </span>
      </div>

      {/* diff */}
      <div style={{ marginBottom: 12 }}>
        <div className="anno mb" style={{ marginBottom: 6 }}>Move</div>
        <div className="diff-line old"><span>−</span><span>{from.room} · {from.day} · {S.rangeLabel(from.start, from.end)}</span></div>
        <div className="diff-line new"><span>+</span><span>{to.room} · {to.day} · {S.rangeLabel(to.start, to.start + result.duration - 1)}</span></div>
      </div>

      {/* change-cost */}
      <div className="irows">
        <div className="irow"><b>{result.affected.size}</b> connected entities lit</div>
        <div className="irow"><b>{result.conflicts.length}</b> hard conflicts</div>
        <div className="irow"><b>{result.warnings.length}</b> soft warnings</div>
        <div className="irow"><b>{unchanged}</b> of {placements.length} assignments untouched</div>
      </div>

      {result.conflicts.length > 0 && (
        <div className="inote" style={{ borderColor: 'var(--coral)', background: '#f9e4df', color: '#8a3c2b' }}>
          <b>Blocked — cannot commit:</b> {result.conflicts.join(' ')}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="inote">
          <b>Warnings:</b> {result.warnings.join(' ')}
        </div>
      )}

      <div className="inote">
        <b>Commit path (real backend):</b> no direct move endpoint exists. File this as a rescheduling change —
        the solver computes the least-moves repair and an admin approves it under Reports &amp; Analytics.
        Nothing here has been committed yet.
      </div>

      <div className="row mt" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn sm" onClick={copyPlan}><I.Link size={13} /> Copy plan</button>
        {meta.faculty && <button className="btn sm" disabled={!canCommit || posting}
          onClick={() => fileChange('faculty')} title="File as faculty_unavailable at the current slot; solver re-plans the session.">
          <I.Users size={13} /> File as faculty change
        </button>}
        <button className="btn primary sm" disabled={!canCommit || posting}
          onClick={() => fileChange('room')} title="File as room_unavailable at the current slot; solver re-plans the session.">
          {posting ? <span className="spin" /> : <I.ArrowRight size={13} />}
          {canCommit ? 'File rescheduling request' : 'Resolve conflicts to file'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- entity views
function EntityView({ title, sub, entities, value, onChange, rows, placements, note }) {
  return (
    <div>
      <div className="row wrap mb" style={{ rowGap: 10 }}>
        <select className="input" style={{ maxWidth: 320 }} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select {title.toLowerCase()}…</option>
          {entities.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        {note}
      </div>
      {!value ? (
        <div className="card"><TesseraEmpty title={`Choose a ${title.toLowerCase()}`} sub={sub} /></div>
      ) : (
        <EntityTable rows={rows} placements={placements} />
      )}
    </div>
  )
}

function EntityTable({ rows, placements }) {
  const days = TEACHING_DAYS
  const byDay = (sid) => placements.find((p) => p.session_id === sid)
  return (
    <div className="board-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Course / Session</th>{days.map((d) => <th key={d} style={{ textAlign: 'center' }}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const p = byDay(s.id)
            return (
              <tr key={s.id}>
                <td>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{S.courseName(s.course) || s.course}</div>
                  <div className="mono small muted">{s.id} · {s.groups?.join(', ') || '—'}{s.faculty ? ` · ${s.faculty}` : ''}</div>
                </td>
                {days.map((d) => (
                  <td key={d} style={{ textAlign: 'center' }}>
                    {p && p.day === d ? (
                      <span className="chip" style={{ background: 'var(--sage)', color: '#2c5c46', border: '1px solid rgba(111,174,143,.4)' }}>
                        {p.room} · P{p.start}{p.end > p.start ? `–P${p.end}` : ''}
                      </span>
                    ) : <span className="muted">·</span>}
                  </td>
                ))}
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={6}><TesseraEmpty title="No sessions for this selection" /></td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- page
export default function Mosaic() {
  const data = useData()
  const toast = useToast()
  const [sp] = useSearchParams()
  const [mode, setMode] = useState('week')
  const [groupSel, setGroupSel] = useState(sp.get('group') || '')
  const [deptSel, setDeptSel] = useState('')
  const [facSel, setFacSel] = useState(sp.get('fac') || '')
  const focus = sp.get('session') || ''

  const ref = data?.ref
  const placements = data?.placements || []

  const groups = useMemo(() => (ref?.groups || []).map((g) => ({ id: g.id, label: `${g.id} — ${g.name}` })), [ref])
  const depts = useMemo(() => {
    const d = new Map()
    // derive departments from faculty directory snapshot
    for (const f of FACULTY) if (!d.has(f.department)) d.set(f.department, { id: f.department, label: f.department })
    return [...d.values()]
  }, [ref])
  const facs = useMemo(() => (ref?.faculty || []).map((id) => {
    const f = S.facById[id] || { name: id, department: '' }
    return { id, label: `${f.name} (${f.department})` }
  }), [ref])

  const groupSessions = useMemo(() =>
    (ref?.sessions || []).filter((s) => s.groups?.includes(groupSel)), [ref, groupSel])
  const deptSessions = useMemo(() => {
    const facIds = new Set(Object.values({}) && (ref?.faculty || []).filter((id) => (S.facById[id]?.department) === deptSel))
    return (ref?.sessions || []).filter((s) => s.faculty && facIds.has(s.faculty))
  }, [ref, deptSel])
  const facSessions = useMemo(() =>
    (ref?.sessions || []).filter((s) => s.faculty === facSel), [ref, facSel])

  if (data?.loading) return <TesseraEmpty title="Composing the mosaic" sub="Loading the week grid…" />
  if (data?.error) return <TesseraEmpty title="Could not load the board" sub={data.error} />
  if (!data?.week) {
    return (
      <div>
        <Hero compact eyebrow="Mosaic Board" title={<>The week, <em>room by room.</em></>} />
        <div className="card"><TesseraEmpty title="No timetable yet"
          sub="Generate one from Reports & Analytics (admin)." /></div>
      </div>
    )
  }

  return (
    <div>
      <Hero compact
        eyebrow="Mosaic Board"
        title={<>The week, <em>room by room.</em></>}
        sub="Drag any session tile to re-flow it. Validation runs client-side before you commit — the solver re-plans and an admin approves."
      >
        <div className="row" style={{ gap: 8 }}>
          {[
            ['week', 'Room lanes', I.Mosaic],
            ['group', 'By group', I.Layers],
            ['dept', 'By department', I.Building],
            ['faculty', 'By faculty', I.Users],
          ].map(([m, label, Ic]) => (
            <button key={m} className={`btn sm ${mode === m ? 'primary' : ''}`} onClick={() => setMode(m)}>
              <Ic size={13} /> {label}
            </button>
          ))}
        </div>
      </Hero>

      {mode === 'week' && <MosaicBoard data={data} focus={focus} toast={toast} />}
      {mode === 'group' && (
        <EntityView title="Group" sub="Every session a group attends, with its placed room."
          entities={groups} value={groupSel} onChange={setGroupSel}
          rows={groupSessions} placements={placements}
          note={<span className="chip">placement from the live solution</span>} />
      )}
      {mode === 'dept' && (
        <EntityView title="Department" sub="Sessions taught by that department's faculty."
          entities={depts} value={deptSel} onChange={setDeptSel}
          rows={deptSessions} placements={placements}
          note={<span className="chip">department from the directory snapshot</span>} />
      )}
      {mode === 'faculty' && (
        <EntityView title="Faculty" sub="The teaching load for one faculty member."
          entities={facs} value={facSel} onChange={setFacSel}
          rows={facSessions} placements={placements}
          note={<span className="chip">load = sessions in the live solution</span>} />
      )}
    </div>
  )
}
