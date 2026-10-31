// TESSERA People & Faculty.
// Profile cards (directory snapshot for names/dept/expertise — labelled),
// live weekly load + availability strips (from the real solution), and
// faculty-to-session compatibility with explicit reasons (front-end
// assessment: free ≠ suitable).
import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hero, useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { FACULTY, TEACHING_DAYS } from '../data/campus.js'

const COURSE_DEPT = { CS: 'CSE', EC: 'ECE', EE: 'EE', ME: 'ME', CE: 'CE', PH: 'PH', HS: 'HSS', MA: 'MA', OE: 'ADMIN', WS: 'ADMIN', ID: 'ADMIN' }
const courseDept = (cid) => COURSE_DEPT[String(cid || '').slice(0, 2)] || '—'
const MAX_H = 4 // campus rule: faculty teach at most 4 hours/day (dataset cit-public-v1)

function loadFor(facId, placements) {
  const mine = placements.filter((p) => (S.sessMetaOf(p.session_id) || {}).faculty === facId)
  const perDay = {}
  const cells = {}
  for (const d of TEACHING_DAYS) { cells[d] = {}; perDay[d] = 0 }
  for (const p of mine) {
    for (let per = p.start; per <= p.end; per++) {
      cells[p.day][per] = p.session_id
      perDay[p.day] += 1
    }
  }
  return { mine, perDay, cells }
}

/** Compatibility of one faculty for one session, with explicit reasons. */
function assessCompatibility(fac, sess, placements) {
  const reasons = []
  let ok = true
  const p = placements.find((x) => x.session_id === sess.id)
  const load = loadFor(fac.id, placements)
  const day = p?.day, start = p?.start, end = p?.end
  const facName = fac.name

  // 1. scheduled slot free?
  if (p) {
    for (let per = start; per <= end; per++) {
      const other = load.cells[day]?.[per]
      if (other && other !== sess.id) {
        ok = false
        reasons.push(`teaches ${S.courseOf(other) || other} in that slot (${day} P${per})`)
      }
    }
  }
  // 2. daily load ceiling
  const dayLoad = p ? (load.perDay[day] || 0) : 0
  if (p && dayLoad + 1 > MAX_H) {
    ok = false
    reasons.push(`would exceed the ${MAX_H} h/day ceiling on ${day} (${dayLoad} h already loaded)`)
  }
  // 3. department alignment
  const cd = courseDept(sess.course)
  if (cd !== '—' && cd !== fac.department) {
    reasons.push(`cross-department: session is ${cd}, ${facName.split(' ').slice(-1)[0]} is ${fac.department} (allowed, but cross-listed)`)
  } else if (cd !== '—') {
    reasons.push(`home department (${fac.department}) — natural fit`)
  }
  // 4. session kind
  if (String(sess.kind || '').includes('lab') || String(sess.kind || '').startsWith('practical')) {
    const labSkill = (fac.specialty || []).some((s) => /lab|systems|embedded|hardware|digital|VLSI|circuit/i.test(s))
    if (!labSkill) reasons.push('lab session — no lab-relevant expertise listed in the directory (verify before assignment)')
    else reasons.push('lab session — directory lists lab-relevant expertise')
  }
  // 5. size
  if (sess.size >= 300) reasons.push(`large cohort (${sess.size}) — only auditoria/lecture halls fit`)
  if (ok) reasons.unshift('slot free and load within limits')
  return { ok, reasons }
}

function AvailabilityStrip({ cells, perDay }) {
  return (
    <>
      <div className="strip">
        {TEACHING_DAYS.map((d) => (
          <div className="sd" key={d} title={`${d}: ${perDay[d] || 0} h teaching`}>
            <div className="sd-l">{d} · {perDay[d] || 0}h</div>
            <div className="cells">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((p) => (
                <span key={p} className={`pc ${cells[d]?.[p] ? 'on' : 'avail'}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="strip-legend">
        <span><i style={{ background: 'var(--charcoal)' }} /> teaching</span>
        <span><i style={{ background: 'rgba(191,226,209,.75)' }} /> free (week)</span>
        <span className="chip" style={{ marginLeft: 4 }}>live solution</span>
      </div>
    </>
  )
}

function FacDrawer({ fac, placements, sessions, onClose, toast }) {
  const load = loadFor(fac.id, placements)
  const [sessSel, setSessSel] = useState('')
  const sess = sessions.find((s) => s.id === sessSel)
  const compat = sess ? assessCompatibility(fac, sess, placements) : null

  const upcoming = [...load.mine].sort((a, b) =>
    TEACHING_DAYS.indexOf(a.day) - TEACHING_DAYS.indexOf(b.day) || a.start - b.start).slice(0, 5)

  return (
    <div className="drawer-host">
      <div className="shade" onClick={onClose} />
      <div className="drawer">
        <div className="d-hd">
          <span className="avatar" style={{ width: 36, height: 36, flexBasis: 36, fontSize: 14 }}>{S.initials(fac.name)}</span>
          <div>
            <h3>{fac.name}</h3>
            <div className="mono small muted">{fac.id} · {fac.department}</div>
          </div>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}><I.XMark size={14} /></button>
        </div>
        <div className="d-bd">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge muted">{fac.department}</span>
            {(fac.specialty || []).map((s) => <span key={s} className="chip">{s}</span>)}
            <span className="chip">directory snapshot</span>
          </div>

          <div className="anno mt" style={{ marginTop: 18 }}>This week — live solution</div>
          <div className="mt" style={{ marginTop: 8 }}>
            <AvailabilityStrip cells={load.cells} perDay={load.perDay} />
          </div>

          <div className="anno mt" style={{ marginTop: 18 }}>Upcoming</div>
          <div className="stack" style={{ marginTop: 8, gap: 6 }}>
            {upcoming.map((p) => (
              <div key={p.session_id} className="feed-row" style={{ borderBottom: '1px solid var(--line-2)' }}>
                <span className="feed-ic mono">{p.day}·P{p.start}</span>
                <span className="feed-t">{S.courseOf(p.session_id) || p.session_id}</span>
                <span className="feed-who mono">{p.room}</span>
                <span className="feed-at mono">{(p.end - p.start + 1)}h</span>
              </div>
            ))}
            {upcoming.length === 0 && <div className="muted small">No sessions this week.</div>}
          </div>

          <div className="anno mt v" style={{ marginTop: 18 }}>Compatibility — is this faculty suitable for a session?</div>
          <div className="vres info mt" style={{ marginTop: 8 }}>
            <span className="vi"><I.Info size={14} /></span>
            <div style={{ fontSize: 12 }}>
              Front-end assessment over the live load + directory. <b>Free ≠ suitable</b> — every reason is shown.
            </div>
          </div>
          <select className="input mt" style={{ marginTop: 10 }} value={sessSel} onChange={(e) => setSessSel(e.target.value)}>
            <option value="">Choose a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{S.courseName(s.course) || s.course} ({s.id})</option>
            ))}
          </select>
          {compat && (
            <div className="mt">
              <div className={`vres ${compat.ok ? 'ok' : 'bad'}`}>
                <span className="vi">{compat.ok ? <I.CheckCircle size={15} /> : <I.Alert size={15} />}</span>
                <div>
                  <b>{compat.ok ? 'Suitable' : 'Not suitable as-is'}</b> — {S.courseName(sess.course)}
                  {(() => { const p = placements.find((x) => x.session_id === sess.id); return p ? ` at ${p.day} P${p.start}` : '' })()}
                </div>
              </div>
              <ul className="reasons">
                {compat.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function People() {
  const data = useData()
  const toast = useToast()
  const [sp] = useSearchParams()
  const [dept, setDept] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(sp.get('id') || '')

  const placements = data?.placements || []
  const sessions = data?.ref?.sessions || []
  const depts = useMemo(() => [...new Set(FACULTY.map((f) => f.department))].sort(), [])

  const list = useMemo(() => FACULTY
    .filter((f) => !dept || f.department === dept)
    .filter((f) => !q || `${f.name} ${f.id} ${f.department}`.toLowerCase().includes(q.toLowerCase())),
    [dept, q])

  if (data?.loading) return <TesseraEmpty title="Counting the faculty…" />

  const openFac = FACULTY.find((f) => f.id === open)

  return (
    <div>
      <Hero compact
        eyebrow="People & Faculty"
        title={<>The hands <em>behind the hours.</em></>}
        sub={`${FACULTY.length} faculty on roster. Names and expertise come from the directory snapshot; weekly load and availability come from the live solution.`}
      >
        <div className="row" style={{ gap: 8 }}>
          <select className="input" style={{ maxWidth: 170, flex: '0 0 auto' }} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input className="input" style={{ maxWidth: 230, flex: '0 0 auto' }} placeholder="Search faculty…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Hero>

      <div className="grid cols-3">
        {list.map((f) => {
          const load = loadFor(f.id, placements)
          const totalH = Object.values(load.perDay).reduce((a, b) => a + b, 0)
          const next = [...load.mine].sort((a, b) =>
            TEACHING_DAYS.indexOf(a.day) - TEACHING_DAYS.indexOf(b.day) || a.start - b.start)[0]
          return (
            <div key={f.id} className="room-card" style={{ cursor: 'pointer' }} onClick={() => setOpen(f.id)}>
              <div className="rc-body">
                <div className="row" style={{ gap: 11 }}>
                  <span className="avatar" style={{ width: 40, height: 40, flexBasis: 40, fontSize: 15 }}>{S.initials(f.name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="rc-name" style={{ fontSize: 14.5 }}>{f.name}</div>
                    <div className="rc-anno">{f.id} · {f.department}</div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 5, marginTop: 9 }}>
                  {(f.specialty || []).slice(0, 2).map((s) => <span key={s} className="chip">{s}</span>)}
                  <span className="chip">directory</span>
                </div>
                <div className="mt" style={{ marginTop: 12 }}>
                  <AvailabilityStrip cells={load.cells} perDay={load.perDay} />
                </div>
                <div className="row mt" style={{ marginTop: 11, gap: 10, fontSize: 12 }}>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>{totalH} h/week</span>
                  {next ? (
                    <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      next: {next.day} P{next.start} · {S.courseOf(next.session_id)}
                    </span>
                  ) : <span className="muted">no sessions</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {list.length === 0 && <div className="card mt"><TesseraEmpty title="No faculty match" /></div>}

      {openFac && (
        <FacDrawer fac={openFac} placements={placements} sessions={sessions}
          onClose={() => setOpen('')} toast={toast} />
      )}
    </div>
  )
}
