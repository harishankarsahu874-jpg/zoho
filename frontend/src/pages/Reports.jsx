// TESSERA Reports & Analytics.
// Read for any user; admin actions (generate, export, reset, priority)
// gate on the role and use the real admin endpoints.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Hero, useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { Tessera, TesseraEmpty, TesseraLoader } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { DATASET_ID, FEST_WEEK } from '../data/campus.js'

const SOFT_LABEL = {
  S1: 'S1 · room preference', S2: 'S2 · spread / fragmentation', S3: 'S3 · faculty preference',
  S4: 'S4 · group preference', S5: 'S5 · travel / building', S6: 'S6 · other soft',
}

function SoftBars({ breakdown }) {
  const entries = Object.entries(breakdown || {})
  if (!entries.length) return <div className="muted small">No soft penalties.</div>
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="stack" style={{ gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
            <span>{SOFT_LABEL[k] || k}</span><span className="mono">{v}</span>
          </div>
          <div className="prog" style={{ marginTop: 3 }}><div style={{ width: `${(100 * v) / max}%`, background: 'var(--violet)' }} /></div>
        </div>
      ))}
    </div>
  )
}

function JobPoller({ jobId, onDone }) {
  const toast = useToast()
  const [job, setJob] = useState(null)
  const timer = useRef(null)
  const poll = useCallback(async () => {
    try {
      const j = await S.adminJob(jobId)
      setJob(j)
      if (j.status === 'done') { clearTimeout(timer.current); onDone(j.result) }
      else if (j.status === 'error') { clearTimeout(timer.current); toast(j.error || 'Job failed', 'err') }
    } catch (e) { /* keep polling on transient errors */ }
  }, [jobId, onDone, toast])
  useEffect(() => {
    poll()
    timer.current = setInterval(poll, 2500)
    return () => clearInterval(timer.current)
  }, [poll])
  if (!job) return <div className="tessera-loader"><Tessera size={26} animated /><span className="mono small">starting…</span></div>
  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="spin" />
      <span className="mono small">{job.status} · {job.label || jobId}</span>
    </div>
  )
}

export default function Reports({ user }) {
  const data = useData()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const [sol, setSol] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [audit, setAudit] = useState(null)
  const [exams, setExams] = useState(null)
  const [changes, setChanges] = useState(null)
  const [limit, setLimit] = useState(120)
  const [activeJob, setActiveJob] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [prio, setPrio] = useState(null)

  const loadAll = useCallback(() => {
    if (isAdmin) {
      S.adminStatus().then(setSol).catch(() => {})
      S.adminJobs().then((r) => setJobs(r.jobs || [])).catch(() => {})
    }
    S.adminAudit(40).then((r) => setAudit(r.entries || [])).catch(() => {})
    S.getExams().then((r) => setExams(r.exams || [])).catch(() => setExams([]))
    S.getChanges().then((r) => setChanges(r.changes || [])).catch(() => {})
  }, [isAdmin])
  useEffect(() => { loadAll() }, [loadAll])

  const gen = async () => {
    try {
      const r = await S.adminGenerate(limit)
      setActiveJob(r.job_id)
      toast(`Solve started (limit ${limit}s). Polling…`)
    } catch (e) { toast(e.message, 'err') }
  }
  const onJobDone = (result) => {
    setActiveJob(null)
    toast(`Solve complete — hard ${(result?.report || {}).hard_violation_count ?? '?'} · soft ${(result?.report || {}).soft_total ?? '?'}.`)
    data?.reload?.()
    loadAll()
  }
  const doExport = async () => {
    try {
      const r = await S.adminExport()
      const blob = new Blob([r.content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = r.download || 'schedule.json'; a.click()
      URL.revokeObjectURL(url)
      toast('Schedule exported.')
    } catch (e) { toast(e.message, 'err') }
  }
  const doReset = async () => {
    if (!confirm('Reset the demo to the pristine dataset? Current solution and requests are cleared.')) return
    setResetting(true)
    try {
      await S.adminReset()
      toast('Demo data reset.')
      data?.reload?.(); loadAll()
    } catch (e) { toast(e.message, 'err') } finally { setResetting(false) }
  }
  const savePrio = async (order) => {
    try {
      await S.adminPriority(order)
      toast('Priority order updated; bookings re-evaluated.')
      data?.reload?.(); loadAll()
    } catch (e) { toast(e.message, 'err') }
  }

  const report = sol?.report
  const dash = data?.dashboard

  return (
    <div>
      <Hero compact
        eyebrow="Reports & Analytics"
        title={<>The week, <em>accounted for.</em></>}
        sub="Constraint report, solve control, rescheduling queue, exports and the full audit trail."
      >
        {isAdmin && (
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="mono small" style={{ alignSelf: 'center' }}>time limit</span>
            <select className="input" style={{ width: 110 }} value={limit} onChange={(e) => setLimit(+e.target.value)}>
              {[30, 60, 120, 300].map((t) => <option key={t} value={t}>{t}s</option>)}
            </select>
            <button className="btn primary sm" onClick={gen} disabled={!!activeJob}>
              <I.Bolt size={14} /> Generate / re-solve
            </button>
            <button className="btn sm" onClick={doExport}><I.Download size={14} /> Export schedule.json</button>
            <button className="btn danger sm" onClick={doReset} disabled={resetting}>{resetting ? <span className="spin" /> : <I.Shuffle size={14} />} Reset demo</button>
          </div>
        )}
      </Hero>

      {!isAdmin && (
        <div className="banner"><I.Info size={16} />
          You're viewing read-only reports. Generation, export, reset and priority order are admin actions.</div>
      )}

      {activeJob && (
        <div className="card mb" style={{ borderColor: 'var(--violet)' }}>
          <div className="row"><span className="ih-t"><span className="live" /> Solving</span></div>
          <div style={{ marginTop: 10 }}><JobPoller jobId={activeJob} onDone={onJobDone} /></div>
        </div>
      )}

      <div className="grid cols-main mb">
        <div className="stack">
          {/* solution report */}
          <div className="card">
            <div className="hd">
              <h3>Constraint report</h3>
              <span className="anno hd-anno">{DATASET_ID} · {FEST_WEEK}</span>
            </div>
            {!dash?.timetable_generated && !isAdmin ? (
              <TesseraEmpty title="No solution to report" sub="An admin must generate the timetable first." />
            ) : isAdmin && !sol ? (
              <TesseraLoader label="loading report…" />
            ) : report ? (
              <>
                <div className="grid cols-4" style={{ gap: 10, marginBottom: 14 }}>
                  <div className={`stat ${report.hard_violation_count === 0 ? 'sage' : 'coral'}`} style={{ padding: 12 }}>
                    <div className="bignum" style={{ fontSize: 26 }}>{report.hard_violation_count}</div>
                    <div className="statlabel">Hard violations</div>
                  </div>
                  <div className="stat violet" style={{ padding: 12 }}>
                    <div className="bignum" style={{ fontSize: 26 }}>{report.soft_total}</div>
                    <div className="statlabel">Soft total</div>
                  </div>
                  <div className="stat sky" style={{ padding: 12 }}>
                    <div className="bignum" style={{ fontSize: 26 }}>{report.exam_soft_penalty ?? 0}</div>
                    <div className="statlabel">Exam soft</div>
                  </div>
                  <div className="stat lime" style={{ padding: 12 }}>
                    <div className="bignum" style={{ fontSize: 26 }}>{dash?.exams?.placed ?? '—'}</div>
                    <div className="statlabel">Exams placed</div>
                  </div>
                </div>
                <div className="anno mb" style={{ marginBottom: 8 }}>Soft-penalty breakdown</div>
                <SoftBars breakdown={report.soft_penalties} />
                {report.hard_violations?.length > 0 && (
                  <>
                    <div className="anno c mt" style={{ marginTop: 16, marginBottom: 8 }}>Hard violations (first 10)</div>
                    <div className="stack" style={{ gap: 5 }}>
                      {report.hard_violations.slice(0, 10).map((v, i) => (
                        <div key={i} className="diff-line old">
                          <span>{v.rule}</span>
                          <span><span className="muted">({v.where})</span> {v.detail}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <TesseraEmpty title="No report yet" sub="Generate a timetable to populate this." />
            )}
          </div>

          {/* rescheduling queue */}
          <div className="card">
            <div className="hd">
              <h3>Rescheduling queue</h3>
              <span className="anno hd-anno">solver proposals · admin decides</span>
            </div>
            {!changes ? <TesseraEmpty title="Loading…" /> : changes.length === 0 ? (
              <TesseraEmpty title="Queue is clear" sub="File a change from the Mosaic Board or Intelligence." />
            ) : (
              <table className="tbl">
                <thead><tr><th>#</th><th>Change</th><th>Proposal</th><th>Status</th>{isAdmin && <th />}</tr></thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.id}</td>
                      <td className="small">{(c.payload?.changes || []).map((ch) => ch.type).join(', ') || '—'}<div className="muted mono">{c.created_by}</div></td>
                      <td className="small">
                        {c.proposal?.infeasible
                          ? <span className="badge bad">infeasible</span>
                          : c.proposal?.soft_total != null
                            ? <span className="mono">soft {c.proposal.soft_total} · hard {c.proposal.hard_count ?? 0} · stability {c.proposal.stability ?? '—'}</span>
                            : <span className="muted">computing…</span>}
                      </td>
                      <td><span className={`badge ${c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'violet'}`}>{c.status}</span></td>
                      {isAdmin && (
                        <td>
                          {c.status === 'pending' && !c.proposal?.infeasible && c.proposal?.soft_total != null && (
                            <div className="row" style={{ gap: 5 }}>
                              <button className="btn sm primary" onClick={async () => {
                                try { await S.approveChange(c.id); toast(`Change #${c.id} approved — schedule updated.`); loadAll(); data?.reload?.() }
                                catch (e) { toast(e.message, 'err') }
                              }}>Approve</button>
                              <button className="btn danger sm" onClick={async () => {
                                try { await S.rejectChange(c.id); toast(`Change #${c.id} rejected.`); loadAll() }
                                catch (e) { toast(e.message, 'err') }
                              }}>Reject</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="stack">
          {/* jobs (admin) */}
          {isAdmin && (
            <div className="card">
              <div className="hd"><h3>Recent jobs</h3><span className="anno hd-anno">in-memory</span></div>
              {!jobs ? <TesseraEmpty title="Loading…" /> : jobs.length === 0 ? (
                <TesseraEmpty title="No jobs yet" />
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  {jobs.slice(0, 8).map((j) => (
                    <div key={j.id} className="feed-row">
                      <span className="feed-ic">{j.status === 'done' ? <I.Check size={13} /> : j.status === 'error' ? <I.XMark size={13} /> : <span className="spin" />}</span>
                      <span className="feed-t">{j.label || j.id}</span>
                      <span className="feed-who mono">{j.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* priority order (admin) */}
          {isAdmin && (
            <PriorityCard prio={prio} setPrio={setPrio} save={savePrio} onLoad={() => S.getBookings().then((r) => setPrio(r.priority_order)).catch(() => {})} />
          )}

          {/* exams */}
          <div className="card">
            <div className="hd"><h3>Mid-sem exams</h3><span className="anno hd-anno">{exams?.length ?? '…'} placed</span></div>
            {!exams ? <TesseraEmpty title="Loading…" /> : exams.length === 0 ? (
              <TesseraEmpty title="No exam week scheduled" />
            ) : (
              <table className="tbl">
                <thead><tr><th>Exam</th><th>Groups</th><th>Time</th></tr></thead>
                <tbody>
                  {exams.map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.id}</b><div className="mono muted small">{(e.course_ids || []).join(', ')}</div></td>
                      <td className="small mono">{(e.groups || []).join(', ')}</td>
                      <td className="mono small">{e.day} {e.slot || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* audit */}
          <div className="card">
            <div className="hd"><h3>Audit trail</h3><span className="anno hd-anno">last 40</span></div>
            {!audit ? <TesseraEmpty title="Loading…" /> : audit.length === 0 ? (
              <TesseraEmpty title="No activity logged yet" />
            ) : (
              <div className="feed">
                {audit.map((a) => (
                  <div className="feed-row" key={a.id}>
                    <span className="feed-ic"><Tessera size={12} mono color="#8d8a80" /></span>
                    <span className="feed-t">{a.action}</span>
                    <span className="feed-who mono">{a.actor}</span>
                    <span className="feed-at mono">{a.at ? new Date(a.at).toLocaleDateString([], { day: '2-digit', month: 'short' }) : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PriorityCard({ prio, setPrio, save, onLoad }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { onLoad(); setLoaded(true) }, [onLoad])
  const move = (i, dir) => {
    const arr = [...prio]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setPrio(arr)
  }
  return (
    <div className="card">
      <div className="hd"><h3>Booking priority order</h3><span className="anno hd-anno">admin</span></div>
      {!loaded || !prio ? <TesseraEmpty title="Loading…" /> : (
        <>
          <div className="stack" style={{ gap: 5 }}>
            {prio.map((p, i) => (
              <div key={p} className="row" style={{ background: '#fff', border: '1px solid var(--line-2)', borderRadius: 8, padding: '6px 10px' }}>
                <span className="mono" style={{ width: 18, color: 'var(--ink-3)' }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 600, fontFamily: 'var(--sans)', fontSize: 12.5 }}>{p.replace('_', ' ')}</span>
                <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}><I.Chevron dir="up" size={12} /></button>
                <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === prio.length - 1}><I.Chevron dir="down" size={12} /></button>
              </div>
            ))}
          </div>
          <div className="row mt" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn primary sm" onClick={() => save(prio)}><I.Check size={13} /> Save &amp; re-evaluate</button>
          </div>
        </>
      )}
    </div>
  )
}
