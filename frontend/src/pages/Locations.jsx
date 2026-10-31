// TESSERA Locations — the campus map.
// Buildings/room specs from the directory snapshot; utilisation and
// live occupancy from the backend (dashboard + week grid).
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hero, useData } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { ROOMS, TEACHING_DAYS } from '../data/campus.js'

export default function Locations() {
  const data = useData()
  const [open, setOpen] = useState('')
  const util = useMemo(() => Object.fromEntries(
    (data?.dashboard?.room_utilisation?.per_room || []).map((r) => [r.room, r.pct])
  ), [data?.dashboard])

  const buildings = useMemo(() => {
    const m = new Map()
    for (const r of ROOMS) {
      if (!m.has(r.building)) m.set(r.building, [])
      m.get(r.building).push(r)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [])

  if (data?.loading) return <TesseraEmpty title="Plotting the campus…" />

  const totalRooms = ROOMS.length
  const seats = ROOMS.reduce((a, r) => a + r.capacity, 0)

  return (
    <div>
      <Hero compact
        eyebrow="Locations"
        title={<>The campus, <em>building by building.</em></>}
        sub={`${totalRooms} rooms across ${buildings.length} buildings, ${seats.toLocaleString()} total seats. Room specs from the directory; utilisation from the live solution.`}
      >
        <div className="hero-meta">
          <div className="hmeta"><span className="hk">Buildings</span><span className="hv">{buildings.length}</span></div>
          <div className="hmeta"><span className="hk">Rooms</span><span className="hv">{totalRooms}</span></div>
          <div className="hmeta"><span className="hk">Total seats</span><span className="hv">{seats.toLocaleString()}</span></div>
        </div>
      </Hero>

      <div className="grid cols-2">
        {buildings.map(([bldg, rooms]) => {
          const bSeats = rooms.reduce((a, r) => a + r.capacity, 0)
          const usages = rooms.map((r) => util[r.id]).filter((u) => u != null)
          const avg = usages.length ? Math.round(usages.reduce((a, b) => a + b, 0) / usages.length) : null
          return (
            <div key={bldg} className="card">
              <div className="hd">
                <span className="ri" style={{ background: 'var(--lime)', color: 'var(--charcoal)' }}><I.Pin size={15} /></span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 15 }}>{bldg}</h3>
                  <div className="mono small muted">{rooms.length} rooms · {bSeats} seats{avg != null ? ` · ~${avg}% used` : ''}</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {rooms
                  .sort((a, b) => b.capacity - a.capacity)
                  .map((r) => (
                    <button key={r.id} className="loc-row" onClick={() => setOpen(open === r.id ? '' : r.id)}>
                      <span className="loc-ic"><I.Building size={13} /></span>
                      <span className="loc-main">
                        <span className="loc-name">{r.name}</span>
                        <span className="loc-sub mono">{r.id} · {S.roomTypeLabel(r.type)} · {r.capacity}{r.accessible ? ' · accessible' : ''}</span>
                      </span>
                      <span className="loc-util">
                        {util[r.id] != null
                          ? <span className="mono" style={{ color: util[r.id] > 40 ? 'var(--sage-deep)' : 'var(--ink-3)' }}>{util[r.id]}%</span>
                          : <span className="muted mono">—</span>}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )
        })}
      </div>

      {open && (() => {
        const r = ROOMS.find((x) => x.id === open)
        if (!r) return null
        const free = {}
        for (const d of TEACHING_DAYS) free[d] = {}
        for (const p of data?.placements || []) {
          if (p.room !== r.id) continue
          for (let per = p.start; per <= p.end; per++) free[p.day][per] = true
        }
        for (const b of data?.festBookings || []) {
          if (b.room !== r.id) continue
          for (let per = b.start; per <= b.end; per++) free[b.day][per] = true
        }
        return (
          <div className="drawer-host">
            <div className="shade" onClick={() => setOpen('')} />
            <div className="drawer" style={{ width: 460 }}>
              <div className="d-hd">
                <div className="rc-img" style={{ flex: '0 0 110px', width: 110, height: 74 }}>
                  <img src={S.roomImage(r.type)} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{r.name}</h3>
                  <div className="mono small muted">{r.id} · {r.building}</div>
                </div>
                <button className="btn ghost sm" onClick={() => setOpen('')}><I.XMark size={14} /></button>
              </div>
              <div className="d-bd">
                <div className="grid cols-2" style={{ gap: 8 }}>
                  <div className="stat" style={{ padding: 11 }}><div className="statlabel">Type</div><div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{S.roomTypeLabel(r.type)}</div></div>
                  <div className="stat" style={{ padding: 11 }}><div className="statlabel">Capacity</div><div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{r.capacity}</div></div>
                </div>
                <div className="row wrap mt" style={{ marginTop: 10, gap: 5 }}>
                  {r.features.map((f) => <span key={f} className="chip">{f}</span>)}
                  <span className={`chip ${r.accessible ? 'on' : ''}`}>accessible</span>
                </div>
                <div className="anno mt" style={{ marginTop: 16 }}>Weekly occupancy — live</div>
                <div className="mt" style={{ marginTop: 8 }}>
                  <div className="strip">
                    {TEACHING_DAYS.map((d) => (
                      <div className="sd" key={d}>
                        <div className="sd-l">{d}</div>
                        <div className="cells">
                          {Array.from({ length: 9 }, (_, i) => i + 1).map((p) => (
                            <span key={p} className={`pc ${free[d][p] ? 'on' : 'avail'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="row mt" style={{ marginTop: 14 }}>
                  <span className="spacer" />
                  <Link to={`/discovery?room=${r.id}`} className="btn sm">Discover</Link>
                  <Link to={`/availability`} className="btn sm primary"><I.Matrix size={13} /> Availability</Link>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
