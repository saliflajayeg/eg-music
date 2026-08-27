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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const { pathname } = new URL(request.url)

    // The server publishes its current tunnel URL here on every startup.
    // Replaces the old wrangler-CLI path so the host only needs curl:
    //   curl -X POST .../publish -H "Authorization: Bearer $TOKEN" \
    //        -H "Content-Type: application/json" -d '{"backend":"https://..."}'
    // Token lives in the PUBLISH_TOKEN Worker secret.
    if (pathname === '/publish' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || ''
      if (!env.PUBLISH_TOKEN || auth !== `Bearer ${env.PUBLISH_TOKEN}`) {
        return json({ error: 'No autorizado' }, 401)
      }
      let body
      try { body = await request.json() } catch { return json({ error: 'JSON inválido' }, 400) }
      const backend = (body.backend || '').trim().replace(/\/+$/, '')
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(backend)) {
        return json({ error: 'backend debe ser una URL https://*.trycloudflare.com' }, 400)
      }
      const updated_at = new Date().toISOString()
      // "target" elige qué app publica su URL; por defecto EG Music.
      if (body.target === 'reyfrio') {
        await env.CONFIG.put('reyfrio_url', backend)
        await env.CONFIG.put('reyfrio_updated_at', updated_at)
      } else {
        await env.CONFIG.put('backend_url', backend)
        await env.CONFIG.put('updated_at', updated_at)
      }
      return json({ ok: true, backend, updated_at })
    }

    // Dirección permanente de Rey Frío: redirige al túnel actual.
    if (pathname === '/reyfrio') {
      const target = await env.CONFIG.get('reyfrio_url')
      return target
        ? Response.redirect(target, 302)
        : json({ error: 'Rey Frío no está en línea ahora mismo.' }, 503)
    }

    if (pathname === '/config' || pathname === '/') {
      const pinned = await env.CONFIG.get('pinned_backend')
      const backend = pinned || await env.CONFIG.get('backend_url')
      const updated = pinned
        ? (await env.CONFIG.get('pinned_at')) || null
        : (await env.CONFIG.get('updated_at')) || null
      return json({ backend: backend || null, updated_at: updated })
    }

    // Convenience: send a browser straight to the app.
    if (pathname === '/go') {
      const backend = await currentBackend(env)
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
      const backend = await currentBackend(env)
      if (!backend) return json({ error: 'EG Music no está en línea ahora mismo.' }, 503)
      const target = share
        ? `${backend}/track/${share[1]}`
        : `${backend}/api/tracks/${img[1]}/share-image`
      return Response.redirect(target, 302)
    }

    return json({ error: 'Not found' }, 404)
  },
}

// The backend the app should talk to right now. `pinned_backend` (set by hand
// when we move to a permanent host like Render) wins over `backend_url` (the
// rotating tunnel address the PC/egbox publishes). Clear the pin to fall back
// to the tunnel again.
async function currentBackend(env) {
  return (await env.CONFIG.get('pinned_backend')) || (await env.CONFIG.get('backend_url'))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  })
}
