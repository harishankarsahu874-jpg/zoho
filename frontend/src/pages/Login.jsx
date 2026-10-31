import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setSession } from '../api.js'

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
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const doLogin = async (em, pw) => {
    setBusy(true)
    setErr('')
    try {
      const r = await login(em, pw)
      onLogin(r.token, r.user)
      navigate('/')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="hero2">
          <div className="mark">CIT</div>
          <div className="t">CrunchWeek</div>
          <div className="s">CIT campus scheduling &amp; venue management</div>
        </div>
        <label className="fld">Email</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="fld">Password</label>
        <input className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doLogin(email, password)} />
        {err && <div className="badge bad" style={{ marginTop: 10 }}>{err}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 14 }}
          disabled={busy} onClick={() => doLogin(email, password)}>
          {busy ? <span className="spin" /> : 'Sign in'}
        </button>
        <div className="demo-accounts">
          <div className="dtitle">Demo accounts (one-click)</div>
          {DEMO.map((d) => (
            <button key={d.email} disabled={busy} onClick={() => { setEmail(d.email); setPassword(d.password); doLogin(d.email, d.password) }}>
              <span>{d.name}</span>
              <span className="role">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
