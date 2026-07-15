// Native-only offline layer: download media to app-private storage, play it
// back offline, and queue play/view events to sync when back online.
// Every export is a safe no-op on the web (where Capacitor isn't native), so
// the same UI code runs in the browser and the Android app.
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Network } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { trackStreamUrl, postPlayEvents } from './api'

export const isNative = () => Capacitor.isNativePlatform()

const INDEX_KEY = 'eg_downloads_index'  // JSON: array of downloaded track metadata
const QUEUE_KEY = 'eg_play_queue'       // JSON: array of pending play/view events
const DL_DIR    = 'downloads'

// ── small JSON-in-Preferences helpers ──────────────────────────────────────
async function readJson(key, fallback) {
  try {
    const { value } = await Preferences.get({ key })
    return value ? JSON.parse(value) : fallback
  } catch { return fallback }
}
const writeJson = (key, val) => Preferences.set({ key, value: JSON.stringify(val) })

// ── downloads index ─────────────────────────────────────────────────────────
export const getDownloads = () => readJson(INDEX_KEY, [])

export async function isDownloaded(id) {
  const idx = await readJson(INDEX_KEY, [])
  return idx.some(t => t.id === id)
}

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '')
  return m ? m[1].toLowerCase() : 'bin'
}

// Download a track/video to app-private storage. `onProgress` optional.
export async function downloadMedia(track) {
  if (!isNative()) throw new Error('Solo disponible en la app de Android')
  if (await isDownloaded(track.id)) return
  const path = `${DL_DIR}/track_${track.id}.${extOf(track.filename)}`
  // `?dl=1` tells the backend not to count a play for the download itself.
  await Filesystem.downloadFile({
    url: trackStreamUrl(track.id) + '?dl=1',
    path,
    directory: Directory.Data,
    recursive: true,
  })
  const idx = await readJson(INDEX_KEY, [])
  if (!idx.some(t => t.id === track.id)) {
    idx.unshift({
      id: track.id, title: track.title, artist: track.artist,
      display_name: track.display_name, username: track.username,
      user_id: track.user_id, genre: track.genre, media_type: track.media_type,
      duration: track.duration, cover: track.cover, filename: track.filename,
      path, downloaded_at: Date.now(),
    })
    await writeJson(INDEX_KEY, idx)
  }
}

export async function deleteDownload(id) {
  const idx = await readJson(INDEX_KEY, [])
  const t = idx.find(x => x.id === id)
  if (t) {
    try { await Filesystem.deleteFile({ path: t.path, directory: Directory.Data }) } catch {}
    await writeJson(INDEX_KEY, idx.filter(x => x.id !== id))
  }
}

// Returns a WebView-playable URL for a downloaded file, or null if not local.
export async function localSrc(id) {
  if (!isNative()) return null
  const idx = await readJson(INDEX_KEY, [])
  const t = idx.find(x => x.id === id)
  if (!t) return null
  try {
    const { uri } = await Filesystem.getUri({ path: t.path, directory: Directory.Data })
    return Capacitor.convertFileSrc(uri)
  } catch { return null }
}

// ── offline play/view event queue ────────────────────────────────────────────
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

// Record one play/view of a locally-played track. The server never saw this
// playback (it came off disk), so it must be counted via sync.
export async function queuePlay(trackId) {
  if (!isNative()) return
  const q = await readJson(QUEUE_KEY, [])
  q.push({ track_id: trackId, client_event_id: uuid(), played_at: new Date().toISOString() })
  await writeJson(QUEUE_KEY, q)
}

export async function pendingPlayCount() {
  return (await readJson(QUEUE_KEY, [])).length
}

// Push queued events to the server. Safe to call anytime; idempotent server-side
// (dedupes on client_event_id), and only clears events it actually sent.
export async function flushPlayQueue() {
  if (!isNative()) return
  try {
    const status = await Network.getStatus()
    if (!status.connected) return
  } catch {}
  const q = await readJson(QUEUE_KEY, [])
  if (!q.length) return
  try {
    await postPlayEvents({ events: q })
    const sent = new Set(q.map(e => e.client_event_id))
    const remaining = (await readJson(QUEUE_KEY, [])).filter(e => !sent.has(e.client_event_id))
    await writeJson(QUEUE_KEY, remaining)
  } catch {
    // stay queued; will retry on next online event / app start
  }
}

// Wire up automatic sync: once now, and whenever connectivity is regained.
export function initOfflineSync() {
  if (!isNative()) return
  flushPlayQueue()
  Network.addListener('networkStatusChange', s => { if (s.connected) flushPlayQueue() })
}
