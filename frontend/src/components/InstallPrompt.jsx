import React, { useEffect, useState } from 'react'

// "Instalar la app" banner. On Android/Chrome it uses the native install prompt
// (beforeinstallprompt). On iOS Safari there is no such event, so we show the
// "Compartir → Añadir a inicio" hint instead. Dismissals are remembered for a
// while so it never nags.
const SNOOZE_KEY = 'eg_install_snooze'
const SNOOZE_DAYS = 21

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch { return false }
}
function snoozed() {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return t && Date.now() - t < SNOOZE_DAYS * 864e5
  } catch { return false }
}
function snooze() { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())) } catch {} }

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
const isNative = () => location.protocol.startsWith('capacitor') // inside the APK

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)   // beforeinstallprompt event
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (isNative() || isStandalone() || snoozed()) return

    const onPrompt = e => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => { setShow(false); snooze() })

    // iOS Safari: no beforeinstallprompt — show the manual hint after a moment.
    let t
    if (isIOS()) t = setTimeout(() => { setIos(true); setShow(true) }, 2500)

    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); clearTimeout(t) }
  }, [])

  if (!show) return null

  async function install() {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null); setShow(false); snooze()
  }
  function dismiss() { setShow(false); snooze() }

  return (
    <div style={s.wrap} role="dialog" aria-label="Instalar EG Music">
      <img src="/icons/icon-192.png" alt="" style={s.icon} />
      <div style={s.text}>
        <div style={s.title}>Instala EG Music</div>
        <div style={s.sub}>
          {ios
            ? <>Toca <b>Compartir</b> <span style={s.share}>􀈂</span> y luego <b>“Añadir a inicio”</b>.</>
            : 'Añádela a tu pantalla de inicio — se abre como una app y se actualiza sola.'}
        </div>
      </div>
      {!ios && <button onClick={install} style={s.install}>Instalar</button>}
      <button onClick={dismiss} style={s.close} aria-label="Cerrar">✕</button>
    </div>
  )
}

const s = {
  wrap: {
    position:'fixed', left:12, right:12, bottom:'calc(var(--player-h, 0px) + 12px)', zIndex:200,
    maxWidth:460, margin:'0 auto', display:'flex', alignItems:'center', gap:12,
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14,
    padding:'12px 14px', boxShadow:'0 12px 34px rgba(0,0,0,.4)',
  },
  icon: { width:44, height:44, borderRadius:10, flexShrink:0 },
  text: { flex:1, minWidth:0 },
  title: { fontSize:14, fontWeight:700 },
  sub: { fontSize:12, color:'var(--text2)', marginTop:2, lineHeight:1.4 },
  share: { fontFamily:'-apple-system', margin:'0 2px' },
  install: { flexShrink:0, background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:13, border:'none', borderRadius:20, padding:'9px 16px', cursor:'pointer' },
  close: { flexShrink:0, background:'none', border:'none', color:'var(--text3)', fontSize:16, cursor:'pointer', padding:4 },
}
