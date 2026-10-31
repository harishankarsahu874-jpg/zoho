// Tiny API client: JSON in/out, error unwrapping.
// The session (JWT + user) is deliberately kept IN MEMORY only, so the
// login page is always the first screen on a fresh page load — no
// auto-restore of a previous session.
let _token = null
let _user = null

export function getToken() {
  return _token
}
export function getUser() {
  return _user
}
export function setSession(token, user) {
  _token = token
  _user = user
}
export function clearSession() {
  _token = null
  _user = null
}

// The live-preview reverse proxy strips the Authorization header, so the JWT
// also travels as a `token` query param. The backend (app/api/deps.py) checks
// the header first, then falls back to the param.
function withToken(path) {
  const tok = getToken()
  return tok
    ? `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}`
    : path
}

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {}
  const tok = getToken()
  if (tok) headers['Authorization'] = `Bearer ${tok}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`/api${withToken(path)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) {
      // Stale/missing token: drop the session so the shell returns to login.
      clearSession()
      window.dispatchEvent(new Event('cw:auth-expired'))
    }
    let detail = null
    try {
      const j = await res.json()
      detail = j.detail ?? j
    } catch {
      /* ignore */
    }
    const err = new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}`)
    err.status = res.status
    err.detail = detail
    throw err
  }
  if (raw) return res
  return res.json()
}

export const login = (email, password) =>
  api('/auth/login', { method: 'POST', body: { email, password } })
