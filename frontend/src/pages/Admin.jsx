import React, { useEffect, useRef, useState } from 'react'
import { api, getUser } from '../api.js'
import { useToast } from '../App.jsx'

export default function Admin() {
  const toast = useToast()
  const user = getUser()
  const [job, setJob] = useState(null)
  const [solution, setSolution] = useState(null)
  const [prio, setPrio] = useState([])
  const [audit, setAudit] = useState([])
  const [file, setFile] = useState(null)
  const fileRef = useRef(null)

  const loadAll = () => {
    api('/admin/solution').then(setSolution).catch(() => {})
    api('/admin/audit?limit=40').then((r) => setAudit(r.entries)).catch(() => {})
    api('/bookings').then((r) => setPrio(r.priority_order)).catch(() => {})
  }
  useEffect(() => { loadAll() }, [])

  // poll job
  useEffect(() => {
    if (!job || job.status !== 'running') return
    const t = setInterval(async () => {
      try {
        const j = await api(`/admin/jobs/${job.id}`)
        setJob({ ...job, ...j })
        if (j.status !== 'running') {
          clearInterval(t)
          if (j.status === 'done') {
            toast(`Timetable generated — ${j.result?.report?.hard_violation_count ?? 0} hard violations, soft ${j.result?.report?.soft_total}.`)
            loadAll()
          } else toast(`Job failed: ${j.error}`, 'err')
        }
      } catch (e) { /* transient */ }
    }, 4000)
    return () => clearInterval(t)
  }, [job?.status])

  const generate = async () => {
    try {
      const r = await api('/admin/generate?time_limit=90', { method: 'POST' })
      setJob({ id: r.job_id, status: 'running', label: 'generate timetable' })
    } catch (e) { toast(e.message, 'err') }
  }

  const reset = async () => {
    if (!confirm('Reset all demo data to the pristine starter-pack dataset? This clears the solution, bookings and changes.')) return
    try { await api('/admin/reset-demo', { method: 'POST' }); toast('Demo data reset.'); loadAll() } catch (e) { toast(e.message, 'err') }
  }

  const savePrio = async () => {
    try {
      await api('/admin/priority-order', { method: 'PUT', body: { priority_order: prio } })
      toast('Priority order updated (re-decided fest bookings).')
    } catch (e) { toast(e.message, 'err') }
  }

  const movePrio = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= prio.length) return
    const next = [...prio]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPrio(next)
  }

  const exportJson = async () => {
    try {
      const r = await api('/admin/export')
      const blob = new Blob([r.content], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'schedule.json'
      a.click()
      toast('Exported schedule.json')
    } catch (e) { toast(e.message, 'err') }
  }

  const loadDataset = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const fd = new FormData()
      fd.append('file', f)
      const tok = localStorage.getItem('cw_token')
      // token also in the query: the preview proxy strips the Authorization header
      const res = await fetch(
        `/api/admin/dataset${tok ? `?token=${encodeURIComponent(tok)}` : ''}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}` },
          body: fd,
        })
      const j = await res.json()
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
      toast(`Dataset ${j.dataset_id} loaded (${j.sessions} sessions). Generate a timetable to solve it.`)
      loadAll()
    } catch (err) { toast(err.message, 'err') }
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>Generate timetable</h3>
        <p className="small muted">
          Two-phase CP-SAT (time → rooms) + local-search polish + booking & exam layers.
          Every solution is validated by the official validator before it is accepted.
        </p>
        {job?.status === 'running' && (
          <div className="mt">
            <div className="row mb"><span className="badge warn"><span className="spin dark" /> solving…</span>
              <span className="small muted">CP-SAT (≤90s) + polish (≤15s) + exams</span></div>
            <div className="prog"><div style={{ width: '70%' }} /></div>
          </div>
        )}
        <div className="row mt">
          <button className="btn primary" onClick={generate} disabled={job?.status === 'running'}>
            {job?.status === 'running' ? <span className="spin" /> : '⚡ Generate'}
          </button>
          <button className="btn" onClick={exportJson}>Export schedule.json</button>
          <button className="btn danger" onClick={reset}>Reset demo data</button>
        </div>
        {solution?.exists && (
          <div className="mt">
            <div className="row wrap">
              <span className={`badge ${solution.report.hard_violation_count === 0 ? 'ok' : 'bad'}`}>
                {solution.report.hard_violation_count} hard violations
              </span>
              <span className="badge info">soft {solution.report.soft_total}</span>
              <span className="badge muted">exam soft {solution.report.exam_soft_penalty}</span>
              <span className="badge violet">bookings {solution.report.bookings?.booking_score}/{solution.report.bookings?.booking_score_max_if_all_approved}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Load dataset</h3>
        <p className="small muted">Upload a cit_public-format JSON to replace the loaded dataset (the current solution is cleared).</p>
        <input ref={fileRef} type="file" accept=".json" onChange={loadDataset} />
      </div>

      <div className="card">
        <h3>Booking priority order</h3>
        <p className="small muted">Drag-free reorder: higher rows win clashes. Applies to fest-week decisions immediately.</p>
        {prio.map((p, i) => (
          <div key={p} className="row" style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f5' }}>
            <span className="mono muted" style={{ width: 20 }}>{i + 1}.</span>
            <span className="badge info" style={{ flex: 1 }}>{p}</span>
            <button className="btn ghost sm" onClick={() => movePrio(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn ghost sm" onClick={() => movePrio(i, 1)} disabled={i === prio.length - 1}>↓</button>
          </div>
        ))}
        <div className="mt"><button className="btn sm primary" onClick={savePrio}>Save order</button></div>
      </div>

      <div className="card">
        <h3>Audit log</h3>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="small muted">{a.at ? new Date(a.at).toLocaleTimeString() : ''}</td>
                  <td className="small">{a.actor.split('@')[0]}</td>
                  <td className="mono small">{a.action}</td>
                  <td className="small muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(a.detail)}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan={4} className="muted small">No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
