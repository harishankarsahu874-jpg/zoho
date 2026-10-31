import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { Hero } from '../App.jsx'
import * as I from '../icons.jsx'

export default function Rooms() {
  const [refs, setRefs] = useState(null)
  const [dash, setDash] = useState(null)
  const [tt, setTt] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api('/reference').then(setRefs).catch((e) => setErr(e.message))
    api('/dashboard').then(setDash).catch(() => {})
    api('/timetable?view=week').then(setTt).catch(() => {})
  }, [])

  const perRoom = useMemo(() => {
    const m = {}
    for (const p of dash?.room_utilisation?.per_room || []) m[p.room] = p
    // sessions per room (anchor rows only, weight by duration)
    for (const [key, items] of Object.entries(tt?.sessions || {})) {
      const [day, pstr] = key.split('|P')
      const p = parseInt(pstr, 10)
      for (const it of items) {
        const inPrev = (tt.sessions[`${day}|P${p - 1}`] || []).some((x) => x.sid === it.sid)
        if (inPrev) continue
        m[it.room] ??= { used_periods: 0 }
        m[it.room].sessions = (m[it.room].sessions || 0) + 1
      }
    }
    // fest bookings per room
    for (const [key, list] of Object.entries(tt?.bookings || {})) {
      const room = key.split('|')[0]
      m[room] ??= {}
      m[room].fest = (m[room].fest || 0) + list.length
    }
    return m
  }, [dash, tt])

  if (err) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!refs) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const rooms = (refs.rooms || []).filter((r) =>
    !q || r.id.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))
  const overall = dash?.room_utilisation?.overall ?? 0
  const labs = (refs.rooms || []).filter((r) => r.type.includes('lab')).length
  const halls = (refs.rooms || []).filter((r) => r.type.includes('hall') || r.type === 'auditorium').length

  return (
    <div>
      <Hero compact eyebrow="Venue Management" title="Rooms & Facilities"
        sub="Every room on campus with capacity, features and this week's teaching + fest usage.">
        <div className="hero-actions">
          <input className="input" style={{ width: 260 }} placeholder="Filter rooms or types…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Hero>

      <div className="grid cols-kpi mb">
        <div className="card kpi"><span className="ki"><I.Building size={20} /></span>
          <div><div className="n">{refs.rooms.length}</div><div className="l">Total Rooms</div></div></div>
        <div className="card kpi"><span className="ki"><I.Chart size={20} /></span>
          <div><div className="n">{overall}%</div><div className="l">Overall Utilisation</div></div></div>
        <div className="card kpi"><span className="ki"><I.Cap size={20} /></span>
          <div><div className="n">{halls}</div><div className="l">Halls & Auditorium</div></div></div>
        <div className="card kpi"><span className="ki"><I.Sliders size={20} /></span>
          <div><div className="n">{labs}</div><div className="l">Labs & Workshop</div></div></div>
      </div>

      <div className="grid cols-3">
        {rooms.map((r) => {
          const pm = perRoom[r.id] || {}
          const pct = pm.used_periods ? Math.min(100, Math.round(100 * pm.used_periods / 45)) : 0
          return (
            <div className="card roomcard" key={r.id}>
              <div className="hd2">
                <span className="rn">{r.id}</span>
                <span className="badge muted">{r.type}</span>
                <span className="spacer" />
                <span className="badge info">cap {r.capacity}</span>
              </div>
              <div className="meta">
                {pm.sessions ?? 0} sessions · {pm.fest ?? 0} fest bookings this week
              </div>
              <div className="feat">
                {(r.features || []).map((f) => <span key={f}>{f}</span>)}
                {r.accessible && <span>accessible</span>}
              </div>
              <div className="urow">
                <div className="prog"><div style={{ width: `${pct}%` }} /></div>
                <span className="up">{pct}%</span>
              </div>
            </div>
          )
        })}
        {rooms.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="empty">No rooms match “{q}”.</div>
          </div>
        )}
      </div>
    </div>
  )
}
