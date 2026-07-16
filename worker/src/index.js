/**
 * EG Music — backend discovery.
 *
 * The app's backend runs from a PC behind a Cloudflare quick tunnel, whose
 * *.trycloudflare.com address changes on every restart. Baking that address
 * into the APK meant every rotation broke every installed app.
 *
 * This Worker is a tiny, permanent address book instead: the app asks it
 * "where is the backend right now?" on startup and then talks to that address
 * directly. Media never passes through the Worker — it stays a single small
 * JSON request per app launch.
 *
 * start-online.bat publishes the current tunnel URL into the CONFIG KV store,
 * so a rotation needs no rebuild and no reinstall.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const { pathname } = new URL(request.url)

    if (pathname === '/config' || pathname === '/') {
      const backend = await env.CONFIG.get('backend_url')
      const updated = await env.CONFIG.get('updated_at')
      return json({ backend: backend || null, updated_at: updated || null })
    }

    // Convenience: send a browser straight to the app.
    if (pathname === '/go') {
      const backend = await env.CONFIG.get('backend_url')
      return backend
        ? Response.redirect(backend, 302)
        : json({ error: 'EG Music no está en línea ahora mismo.' }, 503)
    }

    // Permanent share links. Users post these to WhatsApp/Facebook, so they
    // must outlive tunnel rotations — hence the redirect through here rather
    // than sharing a raw *.trycloudflare.com address.
    //   /s/:id    -> the song's page (social crawlers follow the redirect and
    //                read the Open Graph tags the backend injects there)
    //   /img/:id  -> the song's artwork, for the link preview
    const share = pathname.match(/^\/s\/(\d+)$/)
    const img   = pathname.match(/^\/img\/(\d+)$/)
    if (share || img) {
      const backend = await env.CONFIG.get('backend_url')
      if (!backend) return json({ error: 'EG Music no está en línea ahora mismo.' }, 503)
      const target = share
        ? `${backend}/track/${share[1]}`
        : `${backend}/api/tracks/${img[1]}/share-image`
      return Response.redirect(target, 302)
    }

    return json({ error: 'Not found' }, 404)
  },
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  })
}
