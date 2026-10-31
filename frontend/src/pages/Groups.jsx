import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { Hero } from '../App.jsx'

export default function Groups() {
  const [refs, setRefs] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api('/reference').then(setRefs).catch((e) => setErr(e.message)) }, [])

  const { gRows, fRows } = useMemo(() => {
    const g = {}, f = {}
    for (const s of refs?.sessions || []) {
      const dur = s.duration || 1
      for (const gr of s.groups || []) {
        g[gr] ??= { n: 0, h: 0 }
        g[gr].n += 1
        g[gr].h += dur
      }
      if (s.faculty) {
        f[s.faculty] ??= { n: 0, h: 0 }
        f[s.faculty].n += 1
        f[s.faculty].h += dur
      }
    }
    return { gRows: g, fRows: f }
  }, [refs])

  if (err) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!refs) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const groupRows = (refs.groups || []).map((gr) => ({
    id: gr.id, name: gr.name, n: gRows[gr.id]?.n || 0, h: gRows[gr.id]?.h || 0,
  }))
  const facultyRows = Object.entries(fRows)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.h - a.h || a.id.localeCompare(b.id))

  return (
    <div>
      <Hero compact eyebrow="People" title="Faculty & Groups"
        sub="Workload per student group and per faculty member across the teaching week (labs count 3 hours each)." />
      <div className="grid cols-2">
        <div className="card">
          <div className="hd"><h3>Student Groups</h3><span className="badge muted" style={{ marginLeft: 'auto' }}>{refs.groups.length} groups</span></div>
          <table className="tbl">
            <thead><tr><th>Group</th><th>Name</th><th>Sessions</th><th>Hours / week</th></tr></thead>
            <tbody>
              {groupRows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.n}</td>
                  <td>{r.h}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="hd"><h3>Faculty</h3><span className="badge muted" style={{ marginLeft: 'auto' }}>{facultyRows.length} members · ≤ 4h/day cap</span></div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Faculty</th><th>Sessions</th><th>Hours / week</th></tr></thead>
              <tbody>
                {facultyRows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.n}</td>
                    <td>{r.h}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
