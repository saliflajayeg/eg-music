import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { playlistsForTrack, addToPlaylist, removeFromPlaylist, createPlaylist } from '../api'

// A self-contained "save to playlist" control: a small trigger button that
// opens a modal listing the user's playlists (tick to add/remove) plus a box
// to make a new one. Drop it anywhere with a trackId.
export default function AddToPlaylist({ trackId, compact }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen]     = useState(false)
  const [lists, setLists]   = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy]     = useState(false)

  async function openMenu(e) {
    e?.stopPropagation()
    if (!user) { navigate('/login'); return }
    setOpen(true); setLists(null)
    try { setLists(await playlistsForTrack(trackId)) } catch { setLists([]) }
  }
  async function toggle(pl) {
    try {
      if (pl.has_track) { await removeFromPlaylist(pl.id, trackId); pl.has_track = 0 }
      else              { await addToPlaylist(pl.id, trackId);      pl.has_track = 1 }
      setLists([...lists])
    } catch (e) { alert(e.message) }
  }
  async function create() {
    const name = newName.trim(); if (!name) return
    setBusy(true)
    try {
      const pl = await createPlaylist(name)
      await addToPlaylist(pl.id, trackId)
      setNewName('')
      setLists([{ id: pl.id, name: pl.name, has_track: 1 }, ...(lists || [])])
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <button onClick={openMenu} style={compact ? s.iconBtn : s.textBtn} title="Guardar en una lista" aria-label="Guardar en una lista">
        <IcoSave /> {compact ? null : 'Guardar'}
      </button>
      {open && (
        <div style={s.backdrop} onClick={(e) => { e.stopPropagation(); setOpen(false) }}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.head}>
              <span>Guardar en…</span>
              <button onClick={() => setOpen(false)} style={s.x} aria-label="Cerrar">✕</button>
            </div>
            {lists === null
              ? <p style={s.muted}>Cargando…</p>
              : <div style={s.listWrap}>
                  {lists.map(pl => (
                    <button key={pl.id} onClick={() => toggle(pl)} style={s.row}>
                      <span style={{ ...s.check, ...(pl.has_track ? s.checkOn : {}) }}>{pl.has_track ? '✓' : ''}</span>
                      <span style={s.rowName}>{pl.name}</span>
                    </button>
                  ))}
                  {lists.length === 0 && <p style={s.muted}>Aún no tienes listas. Crea una abajo.</p>}
                </div>}
            <div style={s.newRow}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nueva lista…"
                onKeyDown={e => e.key === 'Enter' && create()} style={s.input} maxLength={80} />
              <button onClick={create} disabled={busy || !newName.trim()} style={s.createBtn}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const IcoSave = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h11M4 12h11M4 18h7" /><path d="M18 15v6M15 18h6" />
  </svg>
)

const s = {
  iconBtn: { color:'var(--text3)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:0 },
  textBtn: { display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' },
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal: { width:'100%', maxWidth:360, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, boxShadow:'0 20px 50px -12px rgba(0,0,0,.6)', overflow:'hidden' },
  head: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:15 },
  x: { background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:16 },
  listWrap: { maxHeight:'40vh', overflowY:'auto', padding:'6px 8px' },
  row: { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 8px', background:'none', border:'none', cursor:'pointer', color:'var(--text)', textAlign:'left', borderRadius:8 },
  check: { width:22, height:22, flexShrink:0, borderRadius:6, border:'2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#fff' },
  checkOn: { background:'var(--accent)', borderColor:'var(--accent)' },
  rowName: { fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  muted: { color:'var(--text3)', fontSize:13, padding:'14px 16px', margin:0 },
  newRow: { display:'flex', gap:8, padding:'12px 14px', borderTop:'1px solid var(--border)' },
  input: { flex:1, minWidth:0, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:14 },
  createBtn: { background:'var(--accent)', color:'#fff', fontWeight:700, border:'none', borderRadius:8, padding:'0 16px', cursor:'pointer', fontSize:14 },
}
