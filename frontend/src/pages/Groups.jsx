// TESSERA Academic Groups — the cohorts the schedule is built around.
// Group roll (size, year, department) from the directory snapshot;
// placements and weekly load from the live solution.
import React, { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { GROUPS, TEACHING_DAYS } from '../data/campus.js'

function GroupStrip({ gid, placements }) {
  const cells = {}
  const perDay = {}
  for (const d of TEACHING_DAYS) { cells[d] = {}; perDay[d] = 0 }
  for (const p of placements) {
    const meta = S.sessMetaOf(p.session_id)
    if (!meta?.groups?.includes(gid)) continue
    for (let per = p.start; per <= p.end; per++) {
      cells[p.day][per] = p.session_id
      perDay[p.day] += 1
    }
  }
  return (
    <div className="strip">
      {TEACHING_DAYS.map((d) => (
        <div className="sd" key={d}>
          <div className="sd-l">{d} · {perDay[d] || 0}h</div>
          <div className="cells">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((p) => (
              <span key={p} className={`pc ${cells[d]?.[p] ? 'on' : 'avail'}`} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Groups() {
  const data = useData()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState(sp.get('group') || '')
  const placements = data?.placements || []
  const refGroups = data?.ref?.groups || []

  const list = useMemo(() => GROUPS
    .filter((g) => !year || String(g.year) === year)
    .filter((g) => !q || `${g.id} ${g.name} ${g.department}`.toLowerCase().includes(q.toLowerCase())),
    [q, year])

  if (data?.loading) return <TesseraEmpty title="Counting the cohorts…" />

  const openG = GROUPS.find((g) => g.id === open)
  const openSessions = openG
    ? (data?.ref?.sessions || []).filter((s) => s.groups?.includes(openG.id))
    : []

  return (
    <div>
      <Hero compact
        eyebrow="Academic Groups"
        title={<>The cohorts <em>behind the cells.</em></>}
        sub={`${GROUPS.length} groups across the institute. Sizes and rolls from the directory snapshot; weekly load from the live solution.`}
      >
        <div className="row" style={{ gap: 8 }}>
          <select className="input" style={{ maxWidth: 130, flex: '0 0 auto' }} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <input className="input" style={{ maxWidth: 230, flex: '0 0 auto' }} placeholder="Search groups…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Hero>

      <div className="grid cols-2">
        {list.map((g) => {
          const sess = (data?.ref?.sessions || []).filter((s) => s.groups?.includes(g.id))
          const placed = placements.filter((p) => (S.sessMetaOf(p.session_id)?.groups || []).includes(g.id))
          const hours = placed.reduce((a, p) => a + (p.end - p.start + 1), 0)
          return (
            <div key={g.id} className="room-card" style={{ cursor: 'pointer' }} onClick={() => setOpen(g.id)}>
              <div className="rc-body">
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="rc-name" style={{ fontSize: 14 }}>{g.name}</div>
                    <div className="rc-anno">{g.id} · Year {g.year} · {g.department}</div>
                  </div>
                  <span className="chip" style={{ flex: '0 0 auto' }}>{g.size} students</span>
                </div>
                <div className="row mt" style={{ marginTop: 9, gap: 12, fontSize: 12 }}>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>{sess.length} sessions</span>
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>{hours} h/week</span>
                </div>
                <div className="mt" style={{ marginTop: 11 }}>
                  <GroupStrip gid={g.id} placements={placements} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {list.length === 0 && <div className="card mt"><TesseraEmpty title="No groups match" /></div>}

      {openG && (
        <div className="drawer-host">
          <div className="shade" onClick={() => setOpen('')} />
          <div className="drawer">
            <div className="d-hd">
              <I.Layers size={17} />
              <div>
                <h3>{openG.name}</h3>
                <div className="mono small muted">{openG.id} · Year {openG.year} · {openG.department} · {openG.size} students</div>
              </div>
              <span className="spacer" />
              <Link to={`/board?group=${openG.id}`} className="btn sm primary" style={{ textDecoration: 'none' }}>
                <I.Mosaic size={13} /> Board
              </Link>
              <button className="btn ghost sm" onClick={() => setOpen('')}><I.XMark size={14} /></button>
            </div>
            <div className="d-bd">
              <div className="anno mb" style={{ marginBottom: 8 }}>Sessions this week — live solution</div>
              <table className="tbl">
                <thead><tr><th>Course</th><th>Day</th><th>Periods</th><th>Room</th></tr></thead>
                <tbody>
                  {openSessions.map((s) => {
                    const p = placements.find((x) => x.session_id === s.id)
                    return (
                      <tr key={s.id}>
                        <td><b>{S.courseName(s.course) || s.course}</b><div className="mono muted small">{s.id}</div></td>
                        <td className="mono">{p?.day || '—'}</td>
                        <td className="mono">{p ? `P${p.start}–P${p.end}` : '—'}</td>
                        <td className="mono">{p?.room || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="row mt">
                <span className="chip">group roll from directory snapshot · placements from live solution</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
