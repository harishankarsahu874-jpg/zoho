// TESSERA Settings (admin).
// Account + data source are LIVE (real endpoints). Demo reset is a real
// admin action. Preferences persist locally in the browser only.
import React, { useEffect, useState } from 'react'
import { Hero, useData, useToast } from '../App.jsx'
import * as S from '../services.jsx'
import { TesseraEmpty } from '../tessera.jsx'
import * as I from '../icons.jsx'
import { Tessera } from '../tessera.jsx'
import { DATASET_ID, FEST_WEEK, INSTITUTE, ROOMS, FACULTY, GROUPS } from '../data/campus.js'

export default function Settings({ user }) {
  const toast = useToast()
  const data = useData()
  const dash = data?.dashboard
  const [me, setMe] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cw_side') === '1')

  useEffect(() => { S.me().then(setMe).catch(() => {}) }, [])

  const setSide = (v) => {
    setCollapsed(v)
    localStorage.setItem('cw_side', v ? '1' : '0')
  }

  const doReset = async () => {
    if (!confirm('Reset the demo to the pristine dataset? Current solution, bookings and change requests are cleared.')) return
    setResetting(true)
    try {
      await S.adminReset()
      toast('Demo data reset. Reloading…')
      data?.reload?.()
    } catch (e) { toast(e.message, 'err') } finally { setResetting(false) }
  }

  return (
    <div>
      <Hero compact
        eyebrow="Settings"
        title={<>Keep the mosaic <em>tuned.</em></>}
        sub="Account, data source and the admin reset lever. Most scheduling controls live in Reports & Analytics."
      />

      <div className="grid cols-2">
        <div className="stack">
          <div className="card">
            <div className="hd"><h3>Account</h3></div>
            <div className="row" style={{ gap: 12 }}>
              <span className="avatar" style={{ width: 44, height: 44, flexBasis: 44, fontSize: 16 }}>{S.initials(me?.name || user?.name)}</span>
              <div>
                <div style={{ fontWeight: 600, fontFamily: 'var(--sans)' }}>{me?.name || user?.name}</div>
                <div className="small muted">{me?.email || user?.email}</div>
                <span className="badge violet" style={{ marginTop: 5 }}>{String(me?.role || user?.role || '').replace(/_/g, ' ')}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="hd"><h3>Preferences</h3><span className="anno hd-anno">stored in this browser only</span></div>
            <label className="row" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
              <input type="checkbox" checked={collapsed} onChange={(e) => setSide(e.target.checked)} />
              <span style={{ flex: 1 }}>Collapse sidebar to icons by default</span>
            </label>
            <div className="row" style={{ gap: 10, padding: '9px 0' }}>
              <span style={{ flex: 1 }}>Display language</span>
              <select className="input" style={{ maxWidth: 160 }} defaultValue="en">
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="hd"><h3>Data source</h3><span className="anno hd-anno">live from the backend</span></div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div className="stat sky" style={{ padding: 11 }}><div className="statlabel">Dataset</div><div className="mono" style={{ fontSize: 12, marginTop: 3 }}>{dash?.dataset_id || DATASET_ID}</div></div>
              <div className="stat lime" style={{ padding: 11 }}><div className="statlabel">Period</div><div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, fontFamily: 'var(--sans)' }}>{FEST_WEEK}</div></div>
              <div className="stat" style={{ padding: 11 }}><div className="statlabel">Institute</div><div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, fontFamily: 'var(--sans)' }}>{INSTITUTE}</div></div>
              <div className="stat" style={{ padding: 11 }}><div className="statlabel">Timetable</div><div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, fontFamily: 'var(--sans)' }}>{dash?.timetable_generated ? 'generated ✓' : 'not generated'}</div></div>
            </div>
            <div className="row wrap mt" style={{ marginTop: 12, gap: 6 }}>
              <span className="chip">{ROOMS.length} rooms</span>
              <span className="chip">{FACULTY.length} faculty</span>
              <span className="chip">{GROUPS.length} groups</span>
              <span className="chip">{dash?.counts?.sessions ?? '—'} sessions</span>
              <span className="chip">{dash?.counts?.exams ?? '—'} exams</span>
            </div>
            <div className="vres info mt">
              <span className="vi"><I.Info size={14} /></span>
              <div style={{ fontSize: 12 }}>
                Names, buildings and expertise come from the isolated directory snapshot
                (<span className="mono">src/data/campus.js</span>); every schedule value is backend-validated.
              </div>
            </div>
          </div>

          <div className="card" style={{ borderColor: '#e3b8aa' }}>
            <div className="hd"><h3>Danger zone</h3><span className="anno c hd-anno">admin</span></div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <Tessera size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontFamily: 'var(--sans)', fontSize: 13.5 }}>Reset demo dataset</div>
                <div className="small muted" style={{ margin: '3px 0 10px' }}>
                  Restores the pristine cit-public-v1 dataset: clears the current solution,
                  manual bookings and change requests.
                </div>
                <button className="btn danger sm" onClick={doReset} disabled={resetting}>
                  {resetting ? <span className="spin" /> : <I.Shuffle size={14} />} Reset demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
