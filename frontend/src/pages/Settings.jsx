import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUser } from '../api.js'
import { Hero, useToast } from '../App.jsx'

export default function Settings() {
  const toast = useToast()
  const user = getUser()
  const [dash, setDash] = useState(null)
  const [prio, setPrio] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => {
    api('/dashboard').then(setDash).catch(() => {})
    api('/bookings').then((r) => setPrio(r.priority_order || [])).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const reset = async () => {
    if (!confirm('Reset all demo data to the pristine starter-pack dataset? This clears the solution, bookings and changes.')) return
    setBusy(true)
    try {
      await api('/admin/reset-demo', { method: 'POST' })
      toast('Demo data reset to pristine state.')
      load()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const c = dash?.counts

  return (
    <div>
      <Hero compact eyebrow="Manage" title="Settings"
        sub="Dataset, priority rules and demo controls. (Reordering booking priority lives in Reports & Export.)" />
      <div className="grid cols-2">
        <div className="card">
          <div className="hd"><h3>Dataset</h3></div>
          <div className="stat"><span className="k">Dataset ID</span><span className="v" style={{ fontSize: 18 }}>{dash?.dataset_id || '—'}</span></div>
          {c && (
            <div className="grid cols-4 mt">
              <div className="stat"><span className="k">Sessions</span><span className="v">{c.sessions}</span></div>
              <div className="stat"><span className="k">Rooms</span><span className="v">{c.rooms}</span></div>
              <div className="stat"><span className="k">Faculty</span><span className="v">{c.faculty}</span></div>
              <div className="stat"><span className="k">Exams</span><span className="v">{c.exams}</span></div>
            </div>
          )}
          <div className="small muted mt">
            Timetable {dash?.timetable_generated ? 'generated' : 'not generated yet'}
            {dash?.soft_penalty != null && <> · hard {dash.conflicts?.hard} · soft {dash.soft_penalty}</>}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Booking priority order</h3>
            <Link to="/admin" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600 }}>Reorder in Reports &amp; Export</Link>
          </div>
          {prio.map((p, i) => (
            <div key={p} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
              <span className="mono muted" style={{ width: 20 }}>{i + 1}.</span>
              <span className="badge info" style={{ flex: 1 }}>{p}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="hd"><h3>About</h3></div>
          <div className="small" style={{ lineHeight: 1.7 }}>
            <b>CrunchWeek</b> — campus scheduling &amp; venue management for CIT.<br />
            Solver: OR-Tools CP-SAT (two-phase) + local-search polish · validator-checked on every change.<br />
            Stack: FastAPI + SQLAlchemy · React (Vite) · optional LLM for language understanding only —
            every decision is made and validated by deterministic code.<br />
            Signed in as <b>{user?.name}</b> ({user?.email}).
          </div>
        </div>

        <div className="card" style={{ borderColor: '#fecaca' }}>
          <div className="hd"><h3>Danger zone</h3></div>
          <p className="small muted">Reset the live demo back to the pristine cit-public-v1 starter-pack dataset (clears solution, bookings, changes).</p>
          <div className="mt"><button className="btn danger" onClick={reset} disabled={busy}>{busy ? <span className="spin" /> : 'Reset demo data'}</button></div>
        </div>
      </div>
    </div>
  )
}
