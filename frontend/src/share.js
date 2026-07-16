// Sharing a song to WhatsApp status, chats, Facebook, etc.
//
// Share links point at the permanent Worker (not the rotating tunnel address),
// so a song someone posted to their status still opens weeks later. The Worker
// redirects to the backend, which serves the page with Open Graph tags so the
// link previews with artwork + title.
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

const SHARE_BASE = import.meta.env.VITE_SHARE_BASE || 'https://eg-music.xalif-lajay-eg.workers.dev'

export const shareLink = id => `${SHARE_BASE}/s/${id}`

function messageFor(track) {
  const who  = track.display_name || track.username || track.artist || ''
  const kind = track.media_type === 'video' ? 'este video' : 'esta canción'
  return {
    title: `${track.title} — ${who}`,
    text: `🎵 Escucha ${kind}: "${track.title}"${who ? ' de ' + who : ''} en EG Music`,
    url: shareLink(track.id),
  }
}

/**
 * Opens the phone's share sheet (WhatsApp, status, Facebook…), or the browser's
 * share dialog, or copies the link as a last resort.
 * @returns 'shared' | 'copied' | 'cancelled'
 */
export async function shareTrack(track) {
  const { title, text, url } = messageFor(track)

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, url, dialogTitle: 'Compartir' })
      return 'shared'
    } catch {
      return 'cancelled'   // user dismissed the sheet
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }

  // Desktop browsers without the Web Share API
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'cancelled'
  }
}
