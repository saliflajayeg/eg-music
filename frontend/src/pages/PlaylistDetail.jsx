import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TrackCard from '../components/TrackCard'
import { useMedia } from '../context/MediaContext'
import { getPlaylist, renamePlaylist, deletePlaylist, removeFromPlaylist } from '../api'

export default function PlaylistDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { play, shuffle, toggleShuffle } = useMedia()
  const [pl, setPl]       = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false); setPl(null)
    getPlaylist(id).then(setPl).catch(() => setError(true))
  }, [id])

  const tracks = pl?.tracks || []

  function playAll()  { if (tracks.length) play(tracks[0], tracks) }
  function playShuffle() {
    if (!tracks.length) return
    if (!shuffle) toggleShuffle()
    play(tracks[Math.floor(Math.random() * tracks.length)], tracks)
  }
  async function rename() {
    const n = prompt('Nuevo nombre de la lista:', pl.name)
    if (n == null) return
    const name = n.trim(); if (!name) return
    try { const upd = await renamePlaylist(id, name); setPl(p => ({ ...p, name: upd.name })) }
    catch (e) { alert(e.message) }
  }
  async function removeList() {
    if (!confirm(`¿Eliminar la lista "${pl.name}"? Las canciones no se borran, solo la lista.`)) return
    try { await deletePlaylist(id); navigate('/playlists') } catch (e) { alert(e.message) }
  }
  async function removeTrack(trackId) {
    try { await removeFromPlaylist(id, trackId); setPl(p => ({ ...p, tracks: p.tracks.filter(t => t.id !== trackId) })) }
    catch (e) { alert(e.message) }
  }

  if (error) return <div style={s.center}><p style={{ color:'var(--text3)' }}>No se pudo abrir esta lista.</p></div>
  if (!pl)   return <div style={s.center}><p style={{ color:'var(--text3)' }}>Cargando…</p></div>

  return (
    <div style={{ padding:'16px 14px', maxWidth:1100, margin:'0 auto' }}>
      <button onClick={() => navigate('/playlists')} style={s.back}>‹ Mis listas</button>

      <div style={s.header}>
        <div style={{ minWidth:0 }}>
          <h1 style={s.title}>{pl.name}</h1>
          <p style={s.sub}>{tracks.length} {tracks.length === 1 ? 'canción' : 'canciones'}</p>
        </div>
        <div style={s.headActions}>
          <button onClick={playAll} disabled={!tracks.length} style={s.playBtn}>▶ Reproducir</button>
          <button onClick={playShuffle} disabled={!tracks.length} style={s.ghost}>🔀 Aleatorio</button>
          <button onClick={rename} style={s.ghost}>✏ Renombrar</button>
          <button onClick={removeList} style={{ ...s.ghost, color:'var(--danger)' }}>🗑 Eliminar</button>
        </div>
      </div>

      {tracks.length === 0 ? (
        <p style={{ color:'var(--text2)', maxWidth:420, marginTop:8 }}>
          Esta lista está vacía. Toca <b>Guardar</b> en cualquier canción para añadirla aquí.
        </p>
      ) : (
        <div style={s.grid}>
          {tracks.map(t => (
            <TrackCard key={t.id} track={t} queue={tracks} onRemove={removeTrack} />
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  center: { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh' },
  back: { background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:14, fontWeight:600, padding:'4px 0', marginBottom:8 },
  header: { display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:22 },
  title: { fontSize:26, fontWeight:800, letterSpacing:'-.01em', overflow:'hidden', textOverflow:'ellipsis' },
  sub: { color:'var(--text3)', fontSize:13, marginTop:4 },
  headActions: { display:'flex', gap:8, flexWrap:'wrap' },
  playBtn: { background:'var(--accent)', color:'#fff', fontWeight:700, border:'none', borderRadius:22, padding:'9px 20px', cursor:'pointer', fontSize:14 },
  ghost: { background:'var(--bg3)', color:'var(--text)', fontWeight:600, border:'1px solid var(--border)', borderRadius:22, padding:'9px 16px', cursor:'pointer', fontSize:13 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16 },
}
