// TESSERA — sign in. Editorial split layout; demo accounts pre-filled.
import React, { useState } from 'react'
import { login } from '../services.jsx'
import { Tessera } from '../tessera.jsx'
import { INSTITUTE } from '../data/campus.js'

const DEMO = [
  { email: 'admin@cit.edu.in', password: 'Admin@123', name: 'Admin (Dean’s office)' },
  { email: 'coordinator@cit.edu.in', password: 'Coord@123', name: 'Dept. Coordinator (CSE)' },
  { email: 'faculty@cit.edu.in', password: 'Faculty@123', name: 'Faculty member' },
  { email: 'club@cit.edu.in', password: 'Club@123', name: 'Club member (Dramatics)' },
]

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@cit.edu.in')
  const [password, setPassword] = useState('Admin@123')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const doLogin = async (em, pw) => {
    setBusy(true); setErr(null)
    try {
      const res = await login(em, pw)
      onLogin(res.token, res.user)
    } catch (e) {
      setErr(e.message || 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-side">
        <div className="row" style={{ gap: 12 }}>
          <Tessera size={30} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', color: '#8b887e' }}>
            TESSERA · INTELLIGENT CAMPUS SCHEDULING
          </span>
        </div>
        <div className="ls-hero">
          <div className="ls-kicker">{INSTITUTE}</div>
          <h1>
            Spaces, people and time — <em>in sync.</em>
          </h1>
          <p className="ls-sub">
            One mosaic for the whole academic week: teaching, labs, bookings,
            exams and the people who make it run. Composed by the solver,
            reviewed by you.
          </p>
        </div>
        <div className="ls-foot">Spectra ’27 · Fest Week Operations</div>
      </div>

      <div className="login-form">
        <div className="login-card">
          <div className="lc-t">Sign in</div>
          <div className="lc-s">Use a campus account to enter the mosaic.</div>

          <label className="fld">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin(email, password)} />

          <label className="fld">Password</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin(email, password)} />

          {err && <div className="vres bad mt"><span className="vi">!</span><div>{err}</div></div>}

          <button className="btn primary mt" style={{ width: '100%', marginTop: 18 }}
            disabled={busy} onClick={() => doLogin(email, password)}>
            {busy ? <span className="spin on-dark" /> : 'Enter TESSERA'}
          </button>

          <div className="anno mt" style={{ marginTop: 22 }}>Demo accounts</div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {DEMO.map((d) => (
              <button key={d.email} disabled={busy}
                onClick={() => { setEmail(d.email); setPassword(d.password); doLogin(d.email, d.password) }}
                className="demo-acct">
                <span className="da-n">{d.name}</span>
                <span className="da-e">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
