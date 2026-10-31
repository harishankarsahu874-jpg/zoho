// TESSERA service layer — the ONLY place pages talk to the API.
// Wraps the existing backend contracts unchanged (api.js) and merges the
// static campus directory snapshot (data/campus.js) for display metadata.
//
// Honesty contract used across the UI:
//   · everything from /api/* is backend-validated (real).
//   · anything computed by validateMove()/findOptions() is a FRONT-END
//     PREVIEW (client-side check) — never shown as a confirmed booking or
//     a validated schedule until a backend endpoint confirms it.
import { api, login as rawLogin } from './api'
import { ROOMS, FACULTY, GROUPS, COURSES, PERIOD_TIMES, INSTITUTE, DATASET_ID } from './data/campus'

// ---------------------------------------------------------------- lookups
export const roomById = Object.fromEntries(ROOMS.map(r => [r.id, r]))
export const facById = Object.fromEntries(FACULTY.map(f => [f.id, f]))
export const groupById = Object.fromEntries(GROUPS.map(g => [g.id, g]))
export { COURSES, INSTITUTE, DATASET_ID }

export const periodTime = (p) => (PERIOD_TIMES[p] || PERIOD_TIMES[String(p)] || [`${p}:00`, `${p + 1}:00`])
export const periodLabel = (p) => {
  const [a] = periodTime(p)
  return `P${p} · ${a}`
}
export const rangeLabel = (s, e) => {
  const [sa] = periodTime(s)
  const [, eb] = periodTime(e)
  return `P${s}–P${e} · ${sa}–${eb}`
}
const DAY_FULL = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' }
export const dayFull = (d) => DAY_FULL[d] || d
export const dayShort = (d) => d

// ---------------------------------------------------------------- API
export const login = (email, password) => rawLogin(email, password)
export const me = () => api('/auth/me')

export const getDashboard = () => api('/dashboard')
export const getReference = () => api('/reference')
export const getTimetableWeek = (day) =>
  api('/timetable?view=week' + (day ? `&day=${day}` : ''))
export const getExams = () => api('/exams').catch(() => ({ exams: [] }))
export const getBookings = () => api('/bookings')
export const postBooking = (payload) => api('/bookings', { method: 'POST', body: payload })
export const postAIDraft = (text) => api('/bookings/ai-draft', { method: 'POST', body: { text } })
export const decideBooking = (id, body) =>
  api(`/bookings/${encodeURIComponent(id)}/decide`, { method: 'POST', body })
export const getChanges = () => api('/changes')
export const postChange = (changes) => api('/changes', { method: 'POST', body: { changes } })
export const approveChange = (cid) => api(`/changes/${cid}/approve`, { method: 'POST' })
export const rejectChange = (cid) => api(`/changes/${cid}/reject`, { method: 'POST' })
export const getAiStatus = () => api('/ai/status')
export const aiAsk = (question) => api('/ai/ask', { method: 'POST', body: { question } })
export const aiExplain = (kind, id) => api('/ai/explain', { method: 'POST', body: { kind, id } })
export const aiChange = (text) => api('/ai/change', { method: 'POST', body: { question: text } })

export const adminStatus = () => api('/admin/solution')
export const adminGenerate = (timeLimit = 120) =>
  api(`/admin/generate?time_limit=${timeLimit}`, { method: 'POST' })
export const adminJobs = () => api('/admin/jobs')
export const adminJob = (id) => api(`/admin/jobs/${id}`)
export const adminReset = () => api('/admin/reset-demo', { method: 'POST' })
export const adminExport = () => api('/admin/export', { method: 'POST' }).then(r => r)
export const adminAudit = (limit = 60) => api(`/admin/audit?limit=${limit}`)
export const adminPriority = (order) => api('/admin/priority-order', { method: 'PUT', body: { priority_order: order } })

// ---------------------------------------------------------------- session meta
// Builds a session index from /reference: id -> {course, kind, groups, faculty, size, duration}
export function sessionIndex(ref) {
  return Object.fromEntries((ref.sessions || []).map(s => [s.id, s]))
}
export function courseName(id) {
  if (!id) return '—'
  const c = COURSES[id]
  return c && c !== id ? c : id
}

// ---------------------------------------------------------------- week grid
// /timetable?view=week -> {days, periods, sessions, bookings}
//   sessions: {"MON|P1": [{sid, room, dur, kind}, ...]} — a session appears in
//             EVERY period it occupies; first appearance = start period.
//   bookings: {"AUD|MON": [{start, end, request_id, manual}, ...]}
// Normalised into flat placements: [{session_id, day, start, end, room}]
export function placementsFromWeekGrid(grid) {
  const out = []
  const seen = new Set()
  const sess = grid.sessions || {}
  for (const key of Object.keys(sess)) {
    const m = key.match(/^([A-Z]{3})\|P(\d+)$/)
    if (!m) continue
    const day = m[1]
    const p = parseInt(m[2], 10)
    for (const e of sess[key] || []) {
      // a session is placed once per day; its first cell holds the start period
      const key2 = `${e.sid}|${day}`
      if (seen.has(key2)) continue
      seen.add(key2)
      out.push({ session_id: e.sid, day, start: p,
                 end: p + (e.dur || 1) - 1, room: e.room, kind: e.kind })
    }
  }
  return out.filter(p => p.session_id && p.day && p.start != null && p.room)
}
export function bookingsFromWeekGrid(grid) {
  const out = []
  const b = grid.bookings || {}
  for (const key of Object.keys(b)) {
    const [rid, day] = key.split('|')
    for (const cell of b[key] || []) {
      out.push({ room: rid, day, start: cell.start, end: cell.end,
                 request_id: cell.request_id, manual: cell.manual })
    }
  }
  return out
}

// occupancy maps used by the client-side validator
export function buildOccupancy(placements, bookings) {
  const room = {}   // `${room}|${day}|${period}` -> {sid, title-ish}
  const fac = {}
  for (const p of placements) {
    for (let per = p.start; per <= p.end; per++) {
      room[`${p.room}|${p.day}|${per}`] = { kind: 'session', id: p.session_id }
      const f = facOfSession(p.session_id)
      if (f) fac[`${f}|${p.day}|${per}`] = { kind: 'session', id: p.session_id }
    }
  }
  for (const b of bookings) {
    for (let per = b.start; per <= b.end; per++) {
      room[`${b.room}|${b.day}|${per}`] = { kind: 'booking', id: b.request_id }
    }
  }
  return { room, fac }
}

// reference-backed session->faculty (populated after /reference loads)
let _sessMeta = {}
export function setSessionMeta(ref) {
  _sessMeta = Object.fromEntries((ref?.sessions || []).map(s => [s.id, s]))
}
export const facOfSession = (sid) => _sessMeta[sid]?.faculty || null
export const sessMetaOf = (sid) => _sessMeta[sid] || null
export const courseOf = (sid) => courseName(_sessMeta[sid]?.course)

// ---------------------------------------------------------------- room images
const IMG = {
  auditorium: 'img/auditorium.jpg',
  lab_cs: 'img/lab-cs.jpg',
  seminar_hall: 'img/seminar.jpg',
  lab_elec: 'img/lab-elec.jpg',
  innovation: 'img/innovation.jpg',
  workshop: 'img/workshop.jpg',
}
export function roomImage(type) {
  if (IMG[type]) return IMG[type]
  if (type === 'lecture_hall') return 'img/seminar.jpg'
  if (type === 'classroom') return 'img/lab-cs.jpg'
  if (type === 'outdoor') return 'img/auditorium.jpg'
  if (type === 'lab_civil' || type === 'lab_phy') return 'img/workshop.jpg'
  return 'img/innovation.jpg'
}
export const roomTypeLabel = (t) => ({
  auditorium: 'Auditorium', classroom: 'Classroom', lecture_hall: 'Lecture Hall',
  lab_cs: 'CS Lab', lab_elec: 'EE/ECE Lab', lab_civil: 'Civil Lab', lab_phy: 'Physics Lab',
  seminar_hall: 'Seminar Hall', workshop: 'Workshop', outdoor: 'Outdoor',
}[t] || t)

// ---------------------------------------------------------------- move validation
// CLIENT-SIDE PREVIEW only. A move is:
//   {session_id, day, start, duration, room}  (target)
// The engine returns {verdict: 'valid'|'warning'|'invalid', conflicts[], warnings[], affected}
// so the UI can render the distinct pre-commit states. It mirrors the
// hard-constraint semantics of the dataset validator as faithfully as the
// public data allows — but it is NOT the solver and must be labelled as a
// front-end check everywhere.
const TEACH_LAST = 9
export function validateMove(target, { placements, occupancy, sessions, labStarts = [2, 6], days = ['MON', 'TUE', 'WED', 'THU', 'FRI'], lunchAfter = 5 } = {}) {
  const conflicts = []
  const warnings = []
  const affected = new Set()
  const s = sessions?.[target.session_id] || sessMetaOf(target.session_id) || {}
  const dur = target.duration || s.duration || 1
  const periods = Array.from({ length: dur }, (_, i) => target.start + i)
  const day = target.day
  const fac = target.faculty || s.faculty
  const size = target.size || s.size
  const roomTypes = target.room_types || s.room_types
  const rid = target.room
  const rm = roomById[rid] || {}

  // 0. must not be the current placement (no-op)
  const cur = (placements || []).find(p => p.session_id === target.session_id)
  const isNoop = cur && cur.day === day && cur.start === target.start && cur.room === rid

  if (!days.includes(day)) conflicts.push('Unknown day of week.')
  if (!rm.id) { conflicts.push(`Unknown room ${rid}.`); return { verdict: 'invalid', conflicts, warnings, affected, noop: !!isNoop } }

  // H1/H8: room free (sessions, bookings, maintenance)
  for (const per of periods) {
    const occ = occupancy?.room?.[`${rid}|${day}|${per}`]
    if (occ) {
      const who = occ.kind === 'session'
        ? `${courseOf(occ.id) || occ.id} (${occ.id})`
        : `booking ${occ.id}`
      conflicts.push(`Room ${rid} is occupied P${per} by ${who}.`)
      affected.add(`room:${rid}`)
    }
  }
  // room_unavailability (maintenance) is dataset-level; approximated via bookings? — not public. Skip; label in UI.

  // H5/H6: capacity + type + accessibility
  if (size != null && rm.capacity != null && size > rm.capacity)
    conflicts.push(`Room ${rid} seats ${rm.capacity}; session needs ${size}.`)
  if (roomTypes?.length && rm.type && !roomTypes.includes(rm.type))
    conflicts.push(`Room ${rid} is a ${roomTypeLabel(rm.type)}; session requires ${roomTypes.join(', ')}.`)
  if (s.needs_accessible && rm.accessible === false)
    conflicts.push(`Session needs an accessible room; ${rid} is not accessible.`)

  // H7: faculty free
  if (fac) {
    for (const per of periods) {
      const occ = occupancy?.fac?.[`${fac}|${day}|${per}`]
      if (occ && occ.id !== target.session_id) {
        conflicts.push(`${facById[fac]?.name || fac} teaches ${courseOf(occ.id) || occ.id} in that slot.`)
        affected.add(`fac:${fac}`)
      }
    }
  }

  // H1-ish: group double-booking (any group of this session also taught that slot)
  for (const g of s.groups || []) {
    for (const p of placements || []) {
      if (p.session_id === target.session_id) continue
      if (!(p.groups || []).includes(g)) continue
      // p.groups not in grid cells; approximate via meta
      const pm = sessMetaOf(p.session_id)
      if (!(pm?.groups || []).includes(g)) continue
      for (const per of periods) {
        if (p.day === day && per >= p.start && per <= (p.end || p.start)) {
          conflicts.push(`Group ${g} already has ${courseOf(p.session_id) || p.session_id} P${per} that day.`)
          affected.add(`grp:${g}`)
        }
      }
    }
  }

  // lab-slot rule (H9 partial): labs must start in lab_start_periods, fit in teaching day
  const isLab = roomTypes?.some(t => String(t).startsWith('lab')) || String(rm.type || '').startsWith('lab')
  if (isLab && !labStarts.includes(target.start))
    conflicts.push(`Lab sessions start only at ${labStarts.map(p => `P${p}`).join(' or ')} (lab-slot rule).`)
  for (const per of periods) {
    if (per < 1 || per > 13) { conflicts.push(`Period P${per} is outside the campus day.`); break }
  }
  if (isLab && periods.some(p => p > TEACH_LAST))
    warnings.push('Lab extends past the teaching day (P9) into event-only periods.')

  // lunch-adjacency soft (S-ish): session split across lunch
  if (periods.includes(lunchAfter) && periods.includes(lunchAfter + 1))
    warnings.push('This placement straddles the 13:00–14:00 lunch break.')

  // soft: building distance (group home floor vs room) — advisory only
  if (s.groups?.length) {
    const g = groupById[s.groups[0]]
    if (g?.department && rm.building && !/no lift/.test(rm.building || '') === false) {
      // no reliable group-building mapping in public data; skip
    }
  }

  const verdict = conflicts.length ? 'invalid' : warnings.length ? 'warning' : 'valid'
  return { verdict, conflicts, warnings, affected, noop: !!isNoop, isLab, duration: dur, periods }
}

// Candidate room+slot options for a session (used by Bookings "compatible spaces"
// and Intelligence "alternative slot" — client-side preview, clearly labelled).
export function findOptions(sessionId, { placements, occupancy, ref, days, maxResults = 12 } = {}) {
  const s = sessMetaOf(sessionId) || {}
  const opts = []
  for (const day of days || ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
    for (let start = 1; start + (s.duration || 1) - 1 <= 9; start++) {
      for (const rid of Object.keys(roomById)) {
        const res = validateMove({ session_id: sessionId, day, start, duration: s.duration || 1, room: rid },
          { placements, occupancy, sessions: ref })
        if (res.verdict === 'valid' && !res.noop) {
          opts.push({ day, start, room: rid, ...res })
        }
      }
    }
  }
  opts.sort((a, b) => (a.day + a.start + a.room).localeCompare(b.day + b.start + b.room))
  return opts.slice(0, maxResults)
}

// ---------------------------------------------------------------- misc helpers
export const initials = (name = '') =>
  name.split(/\s+/).filter(w => /[A-Z]/.test(w[0] || '')).map(w => w[0]).slice(0, 2).join('').toUpperCase() || name.slice(0, 2).toUpperCase()

export const fmtPct = (n) => (n == null ? '—' : `${Math.round(n)}%`)

export const statusBadge = (st) => ({
  approved: <span className="badge ok">approved</span>,
  rejected: <span className="badge bad">rejected</span>,
  alternative_offered: <span className="badge warn">alternative</span>,
  pending: <span className="badge violet">pending</span>,
}[st] || <span className="badge muted">{st || '—'}</span>)
