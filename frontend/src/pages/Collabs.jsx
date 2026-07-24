import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pendingCollabs, respondCollab, trackCoverUrl } from '../api'
import { useAuth } from '../context/AuthContext'

// Invitations to be credited on someone else's track. Nothing shows publicly
// until the artist accepts here.
export default function Collabs() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!user) { setItems([]); return }
    pendingCollabs().then(setItems).catch(() => setItems([]))
  }, [user])

  async function respond(trackId, accept) {
    setBusy(trackId)
    try {
      await respondCollab(trackId, accept)
      setItems(list => list.filter(i => i.track_id !== trackId))
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!user) return (
    <div style={s.center}>
      <p style={{marginBottom:12}}>Inicia sesión para ver tus colaboraciones.</p>
      <button className="btn-primary" onClick={() => navigate('/login')}>Iniciar sesión</button>
    </div>
  )

  if (items === null) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>

  return (
    <div style={{padding:'20px 14px 40px', maxWidth:620, margin:'0 auto'}}>
      <h1 style={{fontSize:22, fontWeight:700, marginBottom:4}}>Colaboraciones</h1>
      <p style={{color:'var(--text3)', fontSize:13, marginBottom:20}}>
        Invitaciones para aparecer como artista en canciones de otros.
      </p>

      {items.length === 0 ? (
        <div style={s.center}>
          <div style={{fontSize:38, marginBottom:10}}>🤝</div>
          <p style={{color:'var(--text2)', textAlign:'center', maxWidth:320}}>
            No tienes invitaciones pendientes. Cuando otro artista te etiquete en
            una canción, aparecerá aquí para que la aceptes.
          </p>
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          {items.map(i => (
            <div key={i.track_id} style={s.card}>
              <Cover t={i} />
              <div style={{flex:1, minWidth:0}}>
                <div style={s.title}>{i.title}</div>
                <div style={s.sub}>
                  {i.owner_display_name || i.owner_username} te etiquetó
                  {i.media_type === 'video' ? ' en este video' : ' en esta canción'}
                </div>
                <div style={s.pct}>Tu parte: <strong>{Math.round(i.percent)}%</strong></div>
              </div>
              <div style={s.btns}>
                <button disabled={busy === i.track_id} onClick={() => respond(i.track_id, true)}
                  style={s.accept}>{busy === i.track_id ? '...' : '✓ Aceptar'}</button>
                <button disabled={busy === i.track_id} onClick={() => respond(i.track_id, false)}
                  style={s.decline}>✕ Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Cover({ t }) {
  const [err, setErr] = useState(false)
  if (!t.cover || err) return <div style={s.ph}>🎵</div>
  return <img src={trackCoverUrl(t.track_id)} onError={() => setErr(true)} style={s.cover} alt="" />
}

const s = {
  center: {display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', padding:16},
  card: {display:'flex', alignItems:'center', gap:12, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:12, flexWrap:'wrap'},
  cover: {width:56, height:56, borderRadius:8, objectFit:'cover', flexShrink:0},
  ph: {width:56, height:56, borderRadius:8, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:22},
  title: {fontSize:15, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'},
  sub: {fontSize:12, color:'var(--text2)', marginTop:2},
  pct: {fontSize:12, color:'var(--accent2)', marginTop:4},
  btns: {display:'flex', gap:8, flexShrink:0},
  accept: {background:'var(--accent)', color:'#fff', fontWeight:700, borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', border:'none'},
  decline: {background:'transparent', color:'var(--text3)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer'},
}
