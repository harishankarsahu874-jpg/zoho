import React, { useEffect, useRef, useState } from 'react'
import { api, getUser } from '../api.js'
import { Hero, useToast } from '../App.jsx'

export default function Assistant() {
  const toast = useToast()
  const user = getUser()
  const [msgs, setMsgs] = useState([
    { who: 'bot', text: 'Hi! Ask me about the timetable, fest-week bookings, exams or room usage — or describe a schedule change and I will prepare a proposal for approval.' },
  ])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { api('/ai/status').then(setAiStatus).catch(() => {}) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const ask = async (text) => {
    if (!text.trim() || busy) return
    setMsgs((m) => [...m, { who: 'user', text }])
    setQ('')
    setBusy(true)
    try {
      const r = await api('/ai/ask', { method: 'POST', body: { question: text } })
      setMsgs((m) => [...m, { who: 'bot', text: r.answer, llm: r.llm_used }])
    } catch (e) {
      setMsgs((m) => [...m, { who: 'bot', text: `Sorry — ${e.message}` }])
    } finally { setBusy(false) }
  }

  const change = async (text) => {
    if (!text.trim() || busy) return
    setMsgs((m) => [...m, { who: 'user', text, isChange: true }])
    setQ('')
    setBusy(true)
    try {
      const r = await api('/ai/change', { method: 'POST', body: { question: text } })
      if (!r.ok) {
        setMsgs((m) => [...m, { who: 'bot', text: r.follow_up || 'I could not map that to a schedule change.' }])
      } else {
        setMsgs((m) => [...m, {
          who: 'bot',
          text: `Parsed as: ${r.summary}\n\nChange request #${r.change_id} recorded — the least-moves proposal is being computed. Track and approve it on the Changes page.`,
        }])
      }
    } catch (e) {
      setMsgs((m) => [...m, { who: 'bot', text: `Sorry — ${e.message}` }])
    } finally { setBusy(false) }
  }

  return (
    <div>
      <Hero compact eyebrow="Assistant" title="AI Assistant"
        sub="Ask about the timetable, bookings, exams or room usage — or describe a change and I will prepare a proposal for approval." />
      <div className="row mb">
        <span className="badge info">✦ AI Assistant</span>
        {aiStatus && (
          <span className={`badge ${aiStatus.llm_configured ? 'violet' : 'muted'}`}>
            {aiStatus.llm_configured ? 'LLM configured' : 'deterministic mode (no LLM key)'}
          </span>
        )}
        <span className="spacer" />
        <span className="small muted">The LLM only understands language and explains — every decision is made and validated by code.</span>
      </div>
      <div className="card">
        <div className="chat">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.who === 'user' ? 'user' : 'bot'}`}>
              <div className="av">{m.who === 'user' ? user?.name?.[0] || 'U' : '✦'}</div>
              <div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>
                {m.text}
                {m.llm && <span className="badge violet" style={{ marginLeft: 8 }}>LLM</span>}
                {m.isChange && <span className="badge warn" style={{ marginLeft: 8 }}>change</span>}
              </div>
            </div>
          ))}
          {busy && (
            <div className="msg bot"><div className="av">✦</div><div className="bubble"><span className="spin dark" /> thinking…</div></div>
          )}
          <div ref={endRef} />
        </div>
        <div className="row mt">
          <input className="input" placeholder="e.g. “why was BR-17 not approved?”, “which room is most used?”, or a change: “F19 is on leave Wednesday morning”"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask(q)} />
          <button className="btn primary" disabled={busy} onClick={() => ask(q)}>Ask</button>
          <button className="btn" disabled={busy} onClick={() => change(q)}>✦ As change request</button>
        </div>
        <div className="row wrap mt">
          {['How many bookings are approved?', 'Which rooms are most used?', 'Any conflicts in the current schedule?', 'How many exams are placed?'].map((s) => (
            <button key={s} className="btn ghost sm" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
