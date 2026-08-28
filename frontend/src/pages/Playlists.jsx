import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPlaylists, createPlaylist, trackCoverUrl } from '../api'

export default function Playlists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState(null)
  const [name, setName]   = useState('')
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    if (!user) return
    getPlaylists().then(setLists).catch(() => setLists([]))
  }, [user])

  async function create() {
    const n = name.trim(); if (!n) return
    setBusy(true)
    try { const pl = await createPlaylist(n); setName(''); navigate('/playlist/' + pl.id) }
    catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  if (!user) return (
    <div style={s.center}>
      <div style={{ fontSize:40, marginBottom:12 }}>🎵</div>
      <h2 style={{ marginBottom:8 }}>Mis listas</h2>
      <p style={{ color:'var(--text2)', textAlign:'center', maxWidth:340 }}>
        Inicia sesión para crear listas de reproducción y guardar tus canciones favoritas.
      </p>
      <Link to="/login" style={s.loginBtn}>Iniciar sesión</Link>
    </div>
  )

  return (
    <div style={{ padding:'16px 14px', maxWidth:1100, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>Mis listas</h1>

      <div style={s.newRow}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la nueva lista…"
          onKeyDown={e => e.key === 'Enter' && create()} style={s.input} maxLength={80} />
        <button onClick={create} disabled={busy || !name.trim()} style={s.createBtn}>＋ Crear lista</button>
      </div>

      {lists === null ? (
        <p style={{ color:'var(--text3)' }}>Cargando…</p>
      ) : lists.length === 0 ? (
        <p style={{ color:'var(--text2)', maxWidth:420, marginTop:20 }}>
          Aún no tienes listas. Crea una arriba, o toca <b>Guardar</b> en cualquier canción para añadirla a una lista.
        </p>
      ) : (
        <div style={s.grid}>
          {lists.map(pl => (
            <Link key={pl.id} to={'/playlist/' + pl.id} style={s.card}>
              <div style={s.cover}>
                {pl.cover_track_id
                  ? <img src={trackCoverUrl(pl.cover_track_id)} alt="" style={s.coverImg} onError={e => { e.target.style.display = 'none' }} />
                  : <div style={s.coverPh}>🎵</div>}
                <span style={s.count}>{pl.track_count} {pl.track_count === 1 ? 'canción' : 'canciones'}</span>
              </div>
              <div style={s.name} title={pl.name}>{pl.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  center: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'50vh', padding:16 },
  loginBtn: { marginTop:16, background:'var(--accent)', color:'#fff', fontWeight:700, padding:'10px 22px', borderRadius:10, textDecoration:'none' },
  newRow: { display:'flex', gap:8, marginBottom:22, maxWidth:520, flexWrap:'wrap' },
  input: { flex:1, minWidth:180, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 14px', color:'var(--text)', fontSize:14 },
  createBtn: { background:'var(--accent)', color:'#fff', fontWeight:700, border:'none', borderRadius:9, padding:'0 16px', cursor:'pointer', fontSize:14, whiteSpace:'nowrap' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:16 },
  card: { textDecoration:'none', color:'var(--text)', display:'block' },
  cover: { position:'relative', aspectRatio:'1', borderRadius:12, overflow:'hidden', background:'linear-gradient(135deg, var(--bg3), var(--bg4))' },
  coverImg: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  coverPh: { width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, opacity:.5 },
  count: { position:'absolute', right:6, bottom:6, background:'rgba(0,0,0,.8)', color:'#fff', fontSize:11, fontWeight:600, padding:'2px 7px', borderRadius:5 },
  name: { fontSize:14, fontWeight:600, marginTop:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
}
