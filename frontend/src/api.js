// Tiny API client: JWT in localStorage, JSON in/out, error unwrapping.
const TOKEN_KEY = 'cw_token'
const USER_KEY = 'cw_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null
}
export function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
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
