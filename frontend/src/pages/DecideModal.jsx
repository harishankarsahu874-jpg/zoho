import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { useToast } from '../App.jsx'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

/** Shared approve/reject/alternative modal (used by Spectra Week + Dashboard). */
export default function DecideModal({ booking, refdata, user, onClose, onDone }) {
  const toast = useToast()
  const [status, setStatus] = useState(booking.decision.status === 'pending' ? 'approved' : booking.decision.status)
  const [day, setDay] = useState(booking.decision.day || booking.request.windows?.[0]?.day || 'FRI')
  const [fromP, setFromP] = useState(booking.decision.start_period || booking.request.windows?.[0]?.from_period || 11)
  const [toP, setToP] = useState(booking.decision.end_period || booking.request.windows?.[0]?.to_period || 12)
  const [room, setRoom] = useState(booking.decision.room_id || booking.request.requested_room || '')
  const [reason, setReason] = useState(booking.decision.reason || '')
  const [busy, setBusy] = useState(false)
  const needsPlaced = status === 'approved' || status === 'alternative_offered'

  const decide = async () => {
    setBusy(true)
    try {
      const body = { status, reason: reason || undefined }
      if (needsPlaced) Object.assign(body, { day, start_period: fromP, end_period: toP, room_id: room })
      await api(`/bookings/${booking.decision.request_id}/decide`, { method: 'POST', body })
      toast(`Decision recorded: ${status}`)
      onDone()
    } catch (e) {
      toast(e.detail?.blocker ? `Blocked: ${e.detail.blocker}` : e.detail?.problems?.join?.('; ') || e.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-host" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="hd">
          <b>Decide {booking.decision.request_id}</b>
          <span className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="bd">
          <div className="small muted mb">
            {booking.request.title} · {booking.request.attendance} people · {(booking.request.windows || []).map((w) => `${w.day} P${w.from_period}–P${w.to_period}`).join(', ')}
          </div>
          <label className="fld">Decision</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="approved">approved</option>
            <option value="alternative_offered">alternative_offered</option>
            <option value="rejected">rejected</option>
          </select>
          {needsPlaced && (
            <>
              <div className="row mt">
                <div style={{ flex: 1 }}>
                  <label className="fld">Room</label>
                  <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>
                    <option value="">choose…</option>
                    {(refdata?.rooms || []).map((r) => <option key={r.id} value={r.id}>{r.id} — cap {r.capacity}, {r.type}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fld">Day</label>
                  <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
                    {DAYS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fld">P from</label>
                  <select className="input" value={fromP} onChange={(e) => setFromP(+e.target.value)}>
                    {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fld">P to</label>
                  <select className="input" value={toP} onChange={(e) => setToP(+e.target.value)}>
                    {Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
              </div>
              <div className="small muted mt">
                Placement is validated against hard constraints (capacity, type, features, room/group availability, windows for approvals). If it conflicts, the server tells you why.
              </div>
            </>
          )}
          <label className="fld">Reason (shown to the requester)</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="explainable decision — what and why" />
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (needsPlaced && !room)} onClick={decide}>
            {busy ? <span className="spin" /> : 'Record decision'}
          </button>
        </div>
      </div>
    </div>
  )
}
