// TESSERA Resource Discovery — the architectural portfolio of spaces.
// Editorial featured layout + fully functional filters (capacity, computers,
// equipment, accessibility, category, building, time-interval).
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS, TEACHING_DAYS, LAB_STARTS } from '../data/campus.js'

const ALL_FEATURES = ['computers', 'projector', 'pa_system', 'stage', 'ac', 'power_benches']
const FEATURE_LABEL = {
  computers: 'Computers', projector: 'Projector', pa_system: 'PA / Sound',
  stage: 'Stage', ac: 'Air-conditioned', power_benches: 'Power benches',
}
const FEATURE_ICON = {
  computers: I.Bolt, projector: I.Doc, pa_system: I.Bell,
  stage: I.Star, ac: I.Sliders, power_benches: I.Check,
}

const CATS = [
  ['auditorium', 'Auditoria'], ['lecture_hall', 'Lecture Halls'], ['classroom', 'Classrooms'],
  ['lab_cs', 'CS Labs'], ['lab_elec', 'EE/ECE Labs'], ['lab_civil', 'Civil Labs'],
  ['lab_phy', 'Physics Labs'], ['seminar_hall', 'Seminars'], ['workshop', 'Workshops'], ['outdoor', 'Outdoor'],
]
const BUILDINGS = [...new Set(ROOMS.map((r) => r.building))].sort()

// weekly availability strip for a room (from live placements + bookings)
function useRoomFree() {
  const data = useData()
  return useMemo(() => {
    const free = {}
    for (const r of ROOMS) {
      const grid = {}
      for (const d of TEACHING_DAYS) grid[d] = {}
      for (const p of data?.placements || []) {
        if (p.room !== r.id) continue
        for (let per = p.start; per <= p.end; per++) grid[p.day][per] = 'session'
      }
      for (const b of data?.festBookings || []) {
        if (b.room !== r.id) continue
        for (let per = b.start; per <= b.end; per++) grid[b.day][per] = 'booking'
      }
      free[r.id] = grid
    }
    return free
  }, [data?.placements, data?.festBookings])
}

function Strip({ grid, start, end, dim }) {
  return (
    <div className="rc-strip">
      <div className="strip">
        {TEACHING_DAYS.map((d) => (
          <div className="sd" key={d}>
            <div className="sd-l">{d}</div>
            <div className="cells">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((p) => {
                const st = grid?.[d]?.[p]
                const inWin = start && p >= start && p <= end
                const cls = st ? 'pc on' : 'pc avail'
                return <span key={p} className={`${cls} ${!st && inWin ? 'pc-win' : ''}`} />
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="strip-legend">
        <span><i style={{ background: 'var(--sage)' }} /> free</span>
        <span><i style={{ background: 'var(--charcoal)' }} /> in use</span>
        {start && <span><i style={{ background: 'var(--lime)', border: '1px solid var(--charcoal)' }} /> requested window</span>}
      </div>
    </div>
  )
}

export default function Discovery() {
  const data = useData()
  const [sp, setSp] = useSearchParams()
  const free = useRoomFree()

  const [cat, setCat] = useState(sp.get('cat') || '')
  const [bldg, setBldg] = useState(sp.get('bldg') || '')
  const [minCap, setMinCap] = useState(sp.get('cap') || '')
  const [needsComputers, setNeedsComputers] = useState(sp.get('comp') === '1')
  const [feats, setFeats] = useState(() => (sp.get('feat') ? sp.get('feat').split(',') : []))
  const [accessible, setAccessible] = useState(sp.get('acc') === '1')
  const [winDay, setWinDay] = useState(sp.get('wday') || '')
  const [winStart, setWinStart] = useState(sp.get('wstart') || '')
  const [winDur, setWinDur] = useState(sp.get('wdur') || '2')
  const [show, setShow] = useState(false)

  const roomFocus = sp.get('room')

  const winEnd = winStart ? Math.min(9, +winStart + (+winDur - 1)) : 0
  const winFree = (grid) => {
    if (!winDay || !winStart) return true
    for (let p = +winStart; p <= winEnd; p++) if (grid?.[winDay]?.[p]) return false
    return true
  }

  const results = useMemo(() => ROOMS.filter((r) =>
    (!cat || r.type === cat) &&
    (!bldg || r.building === bldg) &&
    (!minCap || r.capacity >= +minCap) &&
    (!needsComputers || r.features.includes('computers')) &&
    feats.every((f) => r.features.includes(f)) &&
    (!accessible || r.accessible) &&
    winFree(free[r.id])
  ).sort((a, b) => b.capacity - a.capacity),
    [cat, bldg, minCap, needsComputers, feats, accessible, winDay, winStart, winDur, free])

  const anyFilter = cat || bldg || minCap || needsComputers || feats.length || accessible || (winDay && winStart)
  const featured = useMemo(() => {
    const pick = (pred, n) => results.filter(pred).slice(0, n)
    return {
      lead: results.find((r) => r.type === 'auditorium') || results[0],
      support: pick((r) => r.id !== results[0]?.id && (r.type === 'lab_cs' || r.type === 'seminar_hall' || r.type === 'lecture_hall'), 2),
      collab: results.find((r) => r.type === 'workshop' || r.type === 'outdoor'),
    }
  }, [results])

  useEffect(() => {
    if (roomFocus) {
      const el = document.getElementById('room-' + roomFocus)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [roomFocus, show])

  if (data?.loading) return <TesseraEmpty title="Surveying the campus…" />

  return (
    <div>
      <Hero eyebrow="Resource Discovery"
        title={<>A campus, <em>room by room.</em></>}
        sub={`${ROOMS.length} mapped spaces across ${BUILDINGS.length} buildings. Filter by what a space needs to hold — capacity, equipment, accessibility, or a window of free time.`}>
        <div className="hero-meta">
          <div className="hmeta"><span className="hk">Spaces</span><span className="hv">{ROOMS.length}</span></div>
          <div className="hmeta"><span className="hk">Buildings</span><span className="hv">{BUILDINGS.length}</span></div>
          <div className="hmeta"><span className="hk">Accessible</span><span className="hv">{ROOMS.filter((r) => r.accessible).length}</span></div>
        </div>
      </Hero>

      {/* filters */}
      <div className="disc-filters mb">
        <span className="anno" style={{ marginLeft: 4 }}><I.Filter size={12} /> Filter</span>
        <select className="input" style={{ width: 150 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" style={{ width: 190 }} value={bldg} onChange={(e) => setBldg(e.target.value)}>
          <option value="">All buildings</option>
          {BUILDINGS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input" style={{ width: 150 }} value={minCap} onChange={(e) => setMinCap(e.target.value)}>
          <option value="">Any capacity</option>
          {[20, 40, 60, 100, 200, 400].map((c) => <option key={c} value={c}>{c}+ seats</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={accessible ? '1' : ''}
          onChange={(e) => setAccessible(e.target.value === '1')}>
          <option value="">Any access</option>
          <option value="1">Accessible only</option>
        </select>
        <select className="input" style={{ width: 110 }} value={winDay} onChange={(e) => setWinDay(e.target.value)}>
          <option value="">Any day</option>
          {TEACHING_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={winStart} onChange={(e) => setWinStart(e.target.value)}>
          <option value="">Any period</option>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((p) => <option key={p} value={p}>{S.periodLabel(p)}</option>)}
        </select>
        <select className="input" style={{ width: 110 }} value={winDur} onChange={(e) => setWinDur(e.target.value)} disabled={!winStart}>
          {[1, 2, 3].map((d) => <option key={d} value={d}>{d} period{d > 1 ? 's' : ''}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn sm" onClick={() => setShow(true)}>
          {show ? <I.Eye size={13} /> : <I.Chevron dir="down" size={13} />} Equipment
        </button>
      </div>

      {show && (
        <div className="disc-filters mb" style={{ marginTop: -6 }}>
          <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={needsComputers} onChange={(e) => setNeedsComputers(e.target.checked)} />
            Needs computers
          </label>
          <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
          {ALL_FEATURES.map((f) => {
            const Ic = FEATURE_ICON[f] || I.Check
            const on = feats.includes(f)
            return (
              <button key={f} className={`chip ${on ? 'on' : ''}`} onClick={() =>
                setFeats((cur) => on ? cur.filter((x) => x !== f) : [...cur, f])}>
                <Ic size={11} /> {FEATURE_LABEL[f]}
              </button>
            )
          })}
          <span className="spacer" />
          {(anyFilter) && (
            <button className="btn ghost sm" onClick={() => {
              setCat(''); setBldg(''); setMinCap(''); setNeedsComputers(false); setFeats([]);
              setAccessible(false); setWinDay(''); setWinStart(''); setSp({})
            }}>
              <I.XMark size={12} /> Clear all
            </button>
          )}
        </div>
      )}

      {/* editorial featured (only when unfiltered) */}
      {!anyFilter && (
        <div className="feat-grid mb grain">
          {featured.lead && (
            <div className="feat feat-lg" id={`room-${featured.lead.id}`}>
              <img src={S.roomImage(featured.lead.type)} alt={featured.lead.name} />
              <div className="fshade" />
              <div className="fava">
                <span className="badge ok" style={{ background: 'rgba(248,246,240,.92)' }}>
                  {featured.lead.capacity} seats
                </span>
              </div>
              <div className="fbody">
                <div className="fcat">{S.roomTypeLabel(featured.lead.type)} · {featured.lead.building}</div>
                <div className="fname">{featured.lead.name}</div>
                <div className="fmeta">
                  <span>{featured.lead.id}</span>
                  <span>{featured.lead.features.length} features</span>
                  {featured.lead.accessible && <span>accessible</span>}
                </div>
              </div>
            </div>
          )}
          {featured.support.map((r) => (
            <div className="feat" key={r.id} id={`room-${r.id}`}>
              <img src={S.roomImage(r.type)} alt={r.name} />
              <div className="fshade" />
              <div className="fbody">
                <div className="fcat">{S.roomTypeLabel(r.type)} · {r.building}</div>
                <div className="fname" style={{ fontSize: 24 }}>{r.name}</div>
                <div className="fmeta"><span>{r.id}</span><span>{r.capacity} seats</span></div>
              </div>
            </div>
          ))}
          {featured.collab && (
            <div className="feat feat-collab" id={`room-${featured.collab.id}`}>
              <img src={S.roomImage(featured.collab.type)} alt={featured.collab.name} />
              <div className="fshade" />
              <div className="fbody">
                <div className="fcat">Collaboration · {featured.collab.building}</div>
                <div className="fname" style={{ fontSize: 28 }}>{featured.collab.name}</div>
                <div className="fmeta"><span>{featured.collab.id}</span><span>{S.roomTypeLabel(featured.collab.type)}</span><span>{featured.collab.capacity} capacity</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* results */}
      <div className="row mb">
        <span className="anno">{results.length} of {ROOMS.length} spaces{anyFilter ? ' match' : ''}{winDay && winStart ? ` · free ${winDay} ${S.periodLabel(+winStart)}` : ''}</span>
        <span className="chip">availability from the live week</span>
      </div>

      <div className="grid cols-3">
        {results.map((r) => (
          <div key={r.id} className={`room-card ${roomFocus === r.id ? 'rc-focus' : ''}`} id={`room-${r.id}`}>
            <div className="rc-img">
              <img src={S.roomImage(r.type)} alt={r.name} />
              {r.accessible && (
                <span className="badge ok" style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(248,246,240,.92)' }}>accessible</span>
              )}
            </div>
            <div className="rc-body">
              <div className="rc-name">
                {r.name}
                {r.features.includes('computers') && <I.Bolt size={13} />}
              </div>
              <div className="rc-anno">{r.id} · {S.roomTypeLabel(r.type)} · {r.building}</div>
              <div className="rc-meta">
                <span>◧ {r.capacity}</span>
                {r.features.slice(0, 4).map((f) => <span key={f}>{FEATURE_LABEL[f] || f}</span>)}
              </div>
              <Strip grid={free[r.id]} start={winStart ? +winStart : null} end={winEnd} />
              <div className="row" style={{ marginTop: 13, gap: 8 }}>
                <span className="spacer" />
                <button className="btn ghost sm" onClick={() => setSp({ room: r.id })}>Details</button>
              </div>
            </div>
            {roomFocus === r.id && (
              <div className="rc-detail">
                <div className="anno">Full specification</div>
                <div className="rc-spec">
                  <div><span>Capacity</span><b>{r.capacity}</b></div>
                  <div><span>Type</span><b>{S.roomTypeLabel(r.type)}</b></div>
                  <div><span>Building</span><b>{r.building}</b></div>
                  <div><span>Accessible</span><b>{r.accessible ? 'Yes' : 'No'}</b></div>
                  <div><span>Features</span><b>{r.features.map((f) => FEATURE_LABEL[f] || f).join(', ') || '—'}</b></div>
                </div>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <a className="btn sm primary" href={`#/board?room=${r.id}`}>View on board</a>
                  <a className="btn sm" href={`#/bookings?room=${r.id}`}><I.Bookmark size={13} /> Book</a>
                  <span className="spacer" />
                  <button className="btn ghost sm" onClick={() => setSp({})}>Close</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {results.length === 0 && (
        <div className="card"><TesseraEmpty title="No spaces match" sub="Loosen a filter or two." /></div>
      )}
    </div>
  )
}
