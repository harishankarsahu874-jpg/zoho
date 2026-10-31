// TESSERA Intelligence — the violet workspace.
// Left: live context + contextual recommendations (every item links to the
//   exact app element). Right: the assistant panel.
// Every AI call is a REAL backend endpoint (/ai/ask, /ai/explain, /ai/change).
// The UI derives "local insights" client-side from real data and labels them.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { FACULTY, ROOMS, TEACHING_DAYS } from '../data/campus.js'

const EXAMPLES = [
  'Which labs are free tomorrow?',
  'Why was a booking rejected this week?',
  'Give me an alternative slot for a CS lecture',
  'Summarise today for the coordinator',
]

/** Derive linked app elements from a question/answer (navigation only — labelled). */
function deriveLinks(q, a) {
  const t = `${q} ${a || ''}`.toLowerCase()
  const links = []
  if (/free|availability|vacant/.test(t) && /lab|cs|elec/.test(t))
    links.push({ to: '/discovery?cat=lab_cs', label: 'See CS labs (filtered)' })
  if (/free|availability|vacant/.test(t))
    links.push({ to: '/availability', label: 'Open the availability matrix' })
  if (/reject|denied|why.*no|why not/.test(t))
    links.push({ to: '/bookings', label: 'Review rejected bookings' })
  if (/alternative|another slot|move|shift|swap/.test(t))
    links.push({ to: '/board', label: 'Re-flow it on the Mosaic Board' })
  if (/summar|today|overview|snapshot/.test(t))
    links.push({ to: '/', label: 'Full overview' })
  if (/book|request|venue|auditorium|room for/.test(t))
    links.push({ to: '/bookings', label: 'Draft a booking request' })
  if (/exam/.test(t))
    links.push({ to: '/reports', label: 'Exam & report centre' })
  if (links.length === 0)
    links.push({ to: '/board', label: 'Inspect the mosaic' })
  return links.slice(0, 3)
}

function ChatPanel({ user, toast }) {
  const [msgs, setMsgs] = useState([])
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('ask')   // ask | change
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const send = async () => {
    const text = q.trim()
    if (!text || busy) return
    setQ('')
    const mine = { who: 'user', text }
    setMsgs((m) => [...m, mine, { who: 'bot', text: '', busy: true }])
    setBusy(true)
    try {
      if (mode === 'ask') {
        const r = await S.aiAsk(text)
        setMsgs((m) => {
          const c = [...m]
          c[c.length - 1] = { who: 'bot', text: r.answer, llm: r.llm_used, links: deriveLinks(text, r.answer) }
          return c
        })
      } else {
        const r = await S.aiChange(text)
        if (r.ok) {
          setMsgs((m) => {
            const c = [...m]
            c[c.length - 1] = {
              who: 'bot',
              text: `${r.summary || 'Change parsed.'} Change request #${r.change_id} recorded; the solver is computing the least-moves repair. An admin approves it under Reports & Analytics.`,
              links: [{ to: '/reports', label: `Track change #${r.change_id}` }],
            }
            return c
          })
          toast(`Change request #${r.change_id} recorded.`)
        } else {
          setMsgs((m) => {
            const c = [...m]
            c[c.length - 1] = { who: 'bot', text: r.follow_up || 'I could not map that to a schedule change.', links: [{ to: '/bookings', label: 'Try the booking composer instead' }] }
            return c
          })
        }
      }
    } catch (e) {
      setMsgs((m) => {
        const c = [...m]
        c[c.length - 1] = { who: 'bot', text: `I hit an error: ${e.message}`, links: [{ to: '/', label: 'Back to overview' }] }
        return c
      })
    } finally { setBusy(false) }
  }

  return (
    <div className="intel-panel">
      <div className="intel-hd">
        <span className="ih-t"><span className="live" /> TESSERA Intelligence</span>
        <span className="spacer" />
        <div className="seg" style={{ padding: 2 }}>
          <button className={mode === 'ask' ? 'active' : ''} onClick={() => setMode('ask')} style={{ padding: '5px 10px', fontSize: 11 }}>Ask</button>
          <button className={mode === 'change' ? 'active' : ''} onClick={() => setMode('change')} style={{ padding: '5px 10px', fontSize: 11 }}>Request change</button>
        </div>
      </div>
      <div className="chat">
        {msgs.length === 0 && (
          <div className="msg bot">
            <span className="av">T</span>
            <div className="bubble">
              <b>I'm the TESSERA assistant.</b> I answer from the live schedule (validated by code),
              and I can file real change requests. Every answer links to the exact element — I never
              touch the schedule directly.
              <div className="act-row">
                {EXAMPLES.map((ex) => (
                  <button key={ex} className="chip" onClick={() => { setQ(ex); setMode('ask') }}>{ex}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            <span className="av">{m.who === 'user' ? (user?.name?.[0] || 'U').toUpperCase() : 'T'}</span>
            <div className="bubble">
              {m.busy ? <span className="row" style={{ gap: 8 }}><span className="spin" /> thinking…</span>
                : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}
              {!m.busy && m.links && (
                <div className="act-row">
                  {m.links.map((l, j) => (
                    <Link key={j} to={l.to} className="chip" style={{ textDecoration: 'none' }}>
                      <I.ArrowRight size={11} /> {l.label}
                    </Link>
                  ))}
                </div>
              )}
              {m.llm && <div className="sim-note">LLM-assisted · decisions remain code-validated</div>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="intel-input">
        <input className="input" value={q}
          placeholder={mode === 'ask' ? 'Ask about the schedule, bookings, exams…' : 'e.g. "Dr. Rao is on leave Monday morning" or "LAB-CS under maintenance Friday"'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn ai" disabled={busy || !q.trim()} onClick={send}>
          {busy ? <span className="spin" /> : <I.ArrowUpRight size={15} />}
        </button>
      </div>
    </div>
  )
}

export default function Intelligence({ user }) {
  const data = useData()
  const toast = useToast()
  const dash = data?.dashboard
  const [aiStatus, setAiStatus] = useState(null)
  useEffect(() => { S.getAiStatus().then(setAiStatus).catch(() => setAiStatus({ llm_configured: false })) }, [])

  const pendingB = dash?.pending?.bookings || 0
  const pendingC = dash?.pending?.changes || 0
  const hard = dash?.conflicts?.hard ?? 0
  const soft = dash?.soft_penalty ?? 0

  // local insights — computed client-side from real data (labelled)
  const insights = useMemo(() => {
    const out = []
    const placements = data?.placements || []
    // busiest faculty
    const byFac = {}
    for (const p of placements) {
      const f = (S.sessMetaOf(p.session_id) || {}).faculty
      if (f) byFac[f] = (byFac[f] || 0) + (p.end - p.start + 1)
    }
    const topFac = Object.entries(byFac).sort((a, b) => b[1] - a[1])[0]
    if (topFac) out.push({
      icon: I.Users, t: `Highest teaching load: ${FACULTY.find((f) => f.id === topFac[0])?.name || topFac[0]}`,
      s: `${topFac[1]} periods this week`, to: `/people?id=${topFac[0]}`,
    })
    // lowest utilisation rooms
    const per = dash?.room_utilisation?.per_room || []
    if (per.length) {
      const lowest = [...per].sort((a, b) => a.pct - b.pct)[0]
      out.push({
        icon: I.Matrix, t: `Lightest room: ${ROOMS.find((r) => r.id === lowest.room)?.name || lowest.room}`,
        s: `${lowest.pct}% of the teaching week used`, to: '/availability',
      })
    }
    // busiest day
    const byDay = {}
    for (const p of placements) byDay[p.day] = (byDay[p.day] || 0) + (p.end - p.start + 1)
    const topDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0]
    if (topDay) out.push({
      icon: I.Calendar, t: `Peak day: ${S.dayFull(topDay[0])}`,
      s: `${topDay[1]} teaching periods`, to: `/board?day=${topDay[0]}`,
    })
    return out
  }, [data, dash])

  if (data?.loading) return <TesseraEmpty title="Warming up the intelligence layer…" />

  return (
    <div>
      <div className="hero compact">
        <div className="eyebrow"><span className="row" style={{ gap: 8 }}><I.Sparkle size={12} /> TESSERA INTELLIGENCE</span>
          {aiStatus?.llm_configured ? <span className="live"><i /> LLM connected</span> : <span style={{ color: 'var(--violet-deep)' }}>deterministic mode</span>}
        </div>
        <h1 className="h1">Ask the campus <em>what-if.</em></h1>
        <div className="sub">
          Language understanding by the assistant, decisions by code. Answers always link to the
          exact element in the app — and change requests go through the real solver + approval flow.
        </div>
      </div>

      <div className="intel-wrap">
        <div className="stack">
          {/* live context */}
          <div className="card">
            <div className="hd">
              <h3>Live context</h3>
              <span className="anno hd-anno">backend-validated</span>
            </div>
            <div className="grid cols-4" style={{ gap: 10 }}>
              <div className="stat violet" style={{ padding: 12 }}>
                <div className="bignum" style={{ fontSize: 26 }}>{pendingB}</div>
                <div className="statlabel">Bookings pending</div>
              </div>
              <div className="stat lime" style={{ padding: 12 }}>
                <div className="bignum" style={{ fontSize: 26 }}>{pendingC}</div>
                <div className="statlabel">Changes pending</div>
              </div>
              <div className="stat sage" style={{ padding: 12 }}>
                <div className="bignum" style={{ fontSize: 26 }}>{hard}</div>
                <div className="statlabel">Hard conflicts</div>
              </div>
              <div className="stat sky" style={{ padding: 12 }}>
                <div className="bignum" style={{ fontSize: 26 }}>{soft}</div>
                <div className="statlabel">Soft points</div>
              </div>
            </div>
          </div>

          {/* contextual recommendations */}
          <div className="card">
            <div className="hd">
              <h3>Contextual recommendations</h3>
              <span className="anno hd-anno">derived from live state · each links to the element</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {pendingB > 0 && (
                <div className="reco-card">
                  <span className="ri"><I.Bookmark size={15} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="rt">{pendingB} venue request{pendingB > 1 ? 's' : ''} need a decision</div>
                    <div className="rs">Higher-priority requests should be decided first to protect the fest week.</div>
                    <div className="ra"><Link className="chip" to="/bookings">Open decisions <I.ArrowRight size={11} /></Link></div>
                  </div>
                </div>
              )}
              {pendingC > 0 && (
                <div className="reco-card">
                  <span className="ri"><I.Shuffle size={15} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="rt">{pendingC} change proposal{pendingC > 1 ? 's' : ''} computed by the solver</div>
                    <div className="rs">Each carries a least-moves repair; approve or reject in the queue.</div>
                    <div className="ra"><Link className="chip" to="/reports">Review queue <I.ArrowRight size={11} /></Link></div>
                  </div>
                </div>
              )}
              {hard > 0 && (
                <div className="reco-card">
                  <span className="ri" style={{ background: '#f8ddd6', color: 'var(--coral-deep)' }}><I.Alert size={15} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="rt">{hard} hard violation{hard > 1 ? 's' : ''} in the current solution</div>
                    <div className="rs">Inspect the affected sessions on the board before approving anything else.</div>
                    <div className="ra"><Link className="chip" to="/board">Open the mosaic <I.ArrowRight size={11} /></Link></div>
                  </div>
                </div>
              )}
              {soft > 0 && (
                <div className="reco-card">
                  <span className="ri" style={{ background: '#dcedf7', color: '#2c6d8f' }}><I.Info size={15} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="rt">{soft} soft-penalty points remain</div>
                    <div className="rs">Preference-level only — see the breakdown to decide if a re-solve is worth it.</div>
                    <div className="ra"><Link className="chip" to="/reports">Soft-penalty breakdown <I.ArrowRight size={11} /></Link></div>
                  </div>
                </div>
              )}
              {pendingB === 0 && pendingC === 0 && hard === 0 && (
                <div className="reco-card">
                  <span className="ri" style={{ background: 'var(--sage)', color: '#2c5c46' }}><I.Check size={15} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="rt">Nothing urgent — the mosaic holds</div>
                    <div className="rs">Use this time for what-if planning: file a change request and watch the ripple.</div>
                    <div className="ra"><Link className="chip" to="/availability">Scan free time <I.ArrowRight size={11} /></Link></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* local insights */}
          <div className="card">
            <div className="hd">
              <h3>Local insights</h3>
              <span className="anno hd-anno">computed in your browser from live data · not an optimiser result</span>
            </div>
            <div className="grid cols-3" style={{ gap: 8 }}>
              {insights.map((it, i) => (
                <Link key={i} to={it.to} className="reco-card" style={{ textDecoration: 'none' }}>
                  <span className="ri"><it.icon size={15} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="rt">{it.t}</div>
                    <div className="rs">{it.s}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <ChatPanel user={user} toast={toast} />
      </div>
    </div>
  )
}
