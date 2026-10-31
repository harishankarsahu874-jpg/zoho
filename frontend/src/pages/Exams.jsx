import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Hero } from '../App.jsx'

export default function Exams() {
  const [data, setData] = useState(null)
  const [ref, setRef] = useState(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api('/exams').then(setData).catch((e) => setErr(e.message))
    api('/reference').then(setRef).catch(() => {})
  }, [])

  const groupName = (g) => ref?.groups?.find((x) => x.id === g)?.name || g
  const examMeta = (id) => ref?.exams?.find((x) => x.id === id)

  if (err) return <div className="empty"><div className="big">⚠</div>{err}</div>
  if (!data) return <div className="empty"><span className="spin dark" /> Loading…</div>

  const rows = (data.exams || []).filter((e) => filter === 'all' ? true : e.session === filter)

  return (
    <div>
      <Hero compact eyebrow="Examinations" title="Midsem Exams"
        sub="41 exams placed in AM/PM half-day slots across rooms with half-capacity sharing — zero exam conflicts." />
      <div className="row mb wrap">
        <span className="badge info">{data.exams.length} exams</span>
        <span className="badge muted">AM / PM half-day slots</span>
        <span className="badge muted">½ room capacity per exam</span>
        <span className="spacer" />
        <select className="input" style={{ width: 150 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All sessions</option>
          <option value="AM">AM only</option>
          <option value="PM">PM only</option>
        </select>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Exam</th><th>Courses</th><th>Groups</th><th>Day</th><th>Session</th><th>Rooms (½ cap each)</th></tr></thead>
          <tbody>
            {rows.map((e) => {
              const meta = examMeta(e.exam_id) || {}
              return (
                <tr key={e.exam_id}>
                  <td className="mono">{e.exam_id}</td>
                  <td className="small">{(meta.course_ids || []).join(', ') || '—'}</td>
                  <td className="small">{(meta.groups || []).map(groupName).join(', ')}</td>
                  <td>{e.day}</td>
                  <td><span className={`badge ${e.session === 'AM' ? 'info' : 'violet'}`}>{e.session}</span></td>
                  <td className="mono small">{e.rooms.join(', ')} <span className="muted">({meta.size ?? '?'} seats)</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
