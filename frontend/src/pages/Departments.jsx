// TESSERA Departments — derived view.
// Department affiliation from the directory snapshot; session load, hours
// and bookings are LIVE (real API data). Labelled accordingly.
import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { FACULTY, GROUPS, ROOMS } from '../data/campus.js'

const DEPT_COLORS = {
  CSE: 'var(--violet)', ECE: 'var(--sky)', EE: 'var(--lime-deep)', ME: 'var(--amber)',
  CE: 'var(--sage-deep)', PH: 'var(--coral)', MA: 'var(--charcoal)', HSS: 'var(--lavender)',
  ADMIN: 'var(--ink-3)',
}

export default function Departments() {
  const data = useData()
  const ref = data?.ref
  const placements = data?.placements || []

  const rows = useMemo(() => {
    const depts = [...new Set(FACULTY.map((f) => f.department))].sort()
    return depts.map((d) => {
      const facs = FACULTY.filter((f) => f.department === d)
      const facIds = new Set(facs.map((f) => f.id))
      const sess = (ref?.sessions || []).filter((s) => s.faculty && facIds.has(s.faculty))
      const placed = placements.filter((p) => facIds.has((S.sessMetaOf(p.session_id) || {}).faculty))
      const hours = placed.reduce((a, p) => a + (p.end - p.start + 1), 0)
      const groups = GROUPS.filter((g) => g.department === d)
      const rooms = ROOMS.filter((r) => r.building === `${d} Building`)
      return { d, facs, sess, placed: placed.length, hours, groups, rooms }
    })
  }, [ref, placements])

  if (data?.loading) return <TesseraEmpty title="Mapping departments…" />

  return (
    <div>
      <Hero compact
        eyebrow="Departments"
        title={<>Faculty, groups and <em>load, by department.</em></>}
        sub="Affiliation and group rolls come from the directory snapshot; weekly load and placements come from the live solution."
      />
      <div className="grid cols-2">
        {rows.map((r) => (
          <div key={r.d} className="card" style={{ borderTop: `3px solid ${DEPT_COLORS[r.d] || 'var(--line)'}` }}>
            <div className="hd">
              <h3>{r.d}</h3>
              <span className="anno hd-anno">{r.facs.length} faculty</span>
            </div>
            <div className="grid cols-3" style={{ gap: 10, marginBottom: 12 }}>
              <div>
                <div className="bignum" style={{ fontSize: 24 }}>{r.placed}</div>
                <div className="statlabel">sessions/week</div>
              </div>
              <div>
                <div className="bignum" style={{ fontSize: 24 }}>{r.hours}<span className="unit"> h</span></div>
                <div className="statlabel">teaching load</div>
              </div>
              <div>
                <div className="bignum" style={{ fontSize: 24 }}>{r.groups.length}</div>
                <div className="statlabel">home groups</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 5 }}>
              {r.facs.slice(0, 6).map((f) => (
                <Link key={f.id} to={`/people?id=${f.id}`} className="chip" style={{ textDecoration: 'none' }}>{f.name.split(' ').slice(-1)[0]}</Link>
              ))}
              {r.facs.length > 6 && <span className="chip">+{r.facs.length - 6}</span>}
            </div>
            {r.groups.length > 0 && (
              <>
                <div className="anno mt" style={{ marginTop: 12 }}>Groups</div>
                <div className="row wrap mt" style={{ marginTop: 6, gap: 5 }}>
                  {r.groups.map((g) => (
                    <Link key={g.id} to={`/board?group=${g.id}`} className="chip" style={{ textDecoration: 'none' }}>{g.id}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="row mt">
        <span className="chip">derived view — department roll from directory snapshot · load from live solution</span>
      </div>
    </div>
  )
}
