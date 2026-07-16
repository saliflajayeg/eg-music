// Where the backend lives.
//
// Website: same origin as the page -> BASE stays '' and everything is relative.
// Android app: there is no same-origin backend, and the PC's tunnel address
//   rotates on every restart. So instead of baking an address into the APK we
//   ask a tiny, permanent Cloudflare Worker for the current one at startup
//   (VITE_DISCOVERY_URL) and cache the answer for offline use.
let BASE = ''
let ready = Promise.resolve()

const DISCOVERY = import.meta.env.VITE_DISCOVERY_URL || ''
const FALLBACK  = import.meta.env.VITE_API_URL || ''

if (FALLBACK) BASE = FALLBACK
try {
  const cached = localStorage.getItem('backend_url')   // last known good
  if (cached) BASE = cached
} catch {}

// Resolve the backend address. Call once at boot, before rendering.
export function initBackend() {
  if (!DISCOVERY) return Promise.resolve()   // website: nothing to discover
  ready = fetch(DISCOVERY, { cache: 'no-store' })
    .then(r => r.json())
    .then(cfg => {
      if (cfg && cfg.backend) {
        BASE = cfg.backend
        try { localStorage.setItem('backend_url', cfg.backend) } catch {}
      }
    })
    .catch(() => {})   // offline / worker unreachable -> keep cached address
  return ready
}

export const backendBase = () => BASE
const api = path => BASE + '/api' + path

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function req(method, path, body, isForm = false) {
  await ready   // never fire a request at a stale/unknown address
  const opts = { method, headers: { ...authHeaders() } }
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  } else if (body && isForm) {
    opts.body = body
  }
  const r = await fetch(api(path), opts)
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }))
    const e = new Error(err.detail || 'Error del servidor')
    e.status = r.status   // lets callers distinguish e.g. 401 from a network drop
    throw e
  }
  if (r.status === 204) return null
  return r.json()
}

const get    = path          => req('GET',    path)
const post   = (path, body)  => req('POST',   path, body)
const patch  = (path, body)  => req('PATCH',  path, body)
const del    = path          => req('DELETE', path)
const postForm = (path, fd)  => req('POST',   path, fd, true)

// Auth
export const register       = body => post('/auth/register', body)
export const login          = body => post('/auth/login',    body)
export const getMe          = ()   => get('/auth/me')
export const changePassword = body => post('/auth/change-password', body)

// Users
export const getUser        = id  => get(`/users/${id}`)
export const updateProfile  = b   => patch('/users/me', b)
export const uploadAvatar   = fd  => postForm('/users/me/avatar', fd)
export const getUserTracks  = id  => get(`/users/${id}/tracks`)
export const toggleFollow   = id  => post(`/users/${id}/follow`)

// Tracks
export const getFeed          = (offset=0, limit=100) => get(`/tracks?offset=${offset}&limit=${limit}`)
export const getFollowingFeed = ()         => get('/tracks/following')
export const getLikedTracks   = ()         => get('/tracks/liked')
export const getTrack         = id         => get(`/tracks/${id}`)
export const uploadTrack      = fd         => postForm('/tracks', fd)
export const deleteTrack      = id         => del(`/tracks/${id}`)
export const likeTrack        = id         => post(`/tracks/${id}/like`)
export const search           = q          => get(`/search?q=${encodeURIComponent(q)}`)

// Offline sync
export const postPlayEvents   = body       => post('/sync/plays', body)
// Downloads (plan-limited; call before saving a track offline)
export const registerDownload = id         => post(`/downloads/${id}`)

// Subscription
export const getSubInfo       = ()  => get('/subscription/info')
export const getMySubRequest  = ()  => get('/subscription/my-request')
export const requestSub       = fd  => postForm('/subscription/request', fd)

// Admin
export const adminStats        = ()           => get('/admin/stats')
export const adminUsers        = ()           => get('/admin/users')
export const adminUpdateUser   = (id, body)   => patch(`/admin/users/${id}`, body)
export const adminSubs         = (status='')  => get(`/admin/subscriptions?status=${status}`)
export const adminReviewSub    = (id, body)   => post(`/admin/subscriptions/${id}/review`, body)
export const adminReceiptUrl   = async id => {
  // Receipt images require the admin token, so fetch as blob instead of <img src>
  await ready
  const r = await fetch(api(`/admin/subscriptions/${id}/receipt`), { headers: authHeaders() })
  if (!r.ok) throw new Error('No se pudo cargar el recibo')
  return URL.createObjectURL(await r.blob())
}
export const adminGetSettings  = ()           => get('/admin/settings')
export const adminSaveSettings = body         => patch('/admin/settings', body)

// URLs (resolved against whatever backend we discovered)
export const trackCoverUrl  = id    => api(`/tracks/${id}/cover`)
export const trackStreamUrl = id    => api(`/tracks/${id}/stream`)
export const avatarUrl      = fname => fname ? api(`/avatars/${fname}`) : null
