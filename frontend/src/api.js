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
export const changeEmail    = body => post('/auth/change-email', body)

// Users
export const getUser        = id  => get(`/users/${id}`)
export const updateProfile  = b   => patch('/users/me', b)
export const uploadAvatar   = fd  => postForm('/users/me/avatar', fd)
export const getUserTracks  = id  => get(`/users/${id}/tracks`)
export const toggleFollow   = id  => post(`/users/${id}/follow`)

// Tracks
export const getFeed          = (offset=0, limit=100, sort='recent', genre='') =>
  get(`/tracks?offset=${offset}&limit=${limit}&sort=${sort}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`)
export const getTopTracks     = (limit=10) => get(`/tracks/top?limit=${limit}`)
export const getGenres        = ()         => get('/genres')
export const getArtists       = ()         => get('/artists')
export const getFollowingFeed = ()         => get('/tracks/following')
export const getLikedTracks   = ()         => get('/tracks/liked')
export const getTrack         = id         => get(`/tracks/${id}`)
export const uploadTrack      = fd         => postForm('/tracks', fd)
export const deleteTrack      = id         => del(`/tracks/${id}`)
export const scheduleTrack    = (id, publish_at) => patch(`/tracks/${id}/schedule`, { publish_at })
export const likeTrack        = id         => post(`/tracks/${id}/like`)
export const search           = q          => get(`/search?q=${encodeURIComponent(q)}`)

// Comments
export const getComments      = id                    => get(`/tracks/${id}/comments`)
export const addComment       = (id, text, parentId)  => post(`/tracks/${id}/comments`, { text, parent_id: parentId || null })
export const deleteComment    = id                    => del(`/comments/${id}`)
export const likeComment      = id                    => post(`/comments/${id}/like`)

// Notifications
export const getNotifications      = () => get('/notifications')
export const markNotificationsRead = () => post('/notifications/read')

// Playlists
export const getPlaylists        = ()            => get('/playlists')
export const createPlaylist      = name          => post('/playlists', { name })
export const getPlaylist         = id            => get(`/playlists/${id}`)
export const renamePlaylist      = (id, name)    => patch(`/playlists/${id}`, { name })
export const deletePlaylist      = id            => del(`/playlists/${id}`)
export const addToPlaylist       = (id, trackId) => post(`/playlists/${id}/tracks`, { track_id: trackId })
export const removeFromPlaylist  = (id, trackId) => del(`/playlists/${id}/tracks/${trackId}`)
export const playlistsForTrack   = trackId       => get(`/playlists/for-track/${trackId}`)

// Collaborations
export const searchArtists    = q          => get(`/artists/search?q=${encodeURIComponent(q)}`)
export const pendingCollabs   = ()         => get('/collabs/pending')
export const respondCollab    = (id, ok)   => post(`/collabs/${id}/respond`, { accept: ok })
export const trackArtists     = id         => get(`/tracks/${id}/artists`)

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
export const adminEarnings     = ()           => get('/admin/earnings')
export const adminGetSettings  = ()           => get('/admin/settings')
export const adminSaveSettings = body         => patch('/admin/settings', body)

// URLs (resolved against whatever backend we discovered)
export const trackCoverUrl  = id    => api(`/tracks/${id}/cover`)
// opts: { q:'sd', count:0 }. Bare call stays identical (original quality, counts a play)
// so offline downloads and existing callers are unaffected.
export const trackStreamUrl = (id, opts = {}) => {
  const p = []
  if (opts.q)          p.push(`q=${opts.q}`)
  if (opts.count === 0) p.push('count=0')
  const qs = p.length ? `?${p.join('&')}` : ''
  return api(`/tracks/${id}/stream${qs}`)
}
export const avatarUrl      = fname => fname ? api(`/avatars/${fname}`) : null
// The Android app download, served by the backend (not under /api).
export const apkUrl         = ()    => backendBase() + '/download/eg-music.apk'
