import React, { useState, useEffect } from 'react'
import { editTrack, trackCoverUrl, trackArtists } from '../api'
import CollaboratorPicker from './CollaboratorPicker'

// Lets an artist (or admin) edit a PUBLISHED track: title, cover and credited
// collaborators. Opened as a modal from a track's manage actions.
export default function EditTrack({ track, onClose, onSaved }) {
  const [title, setTitle] = useState(track.title || '')
  const [collabs, setCollabs] = useState(
    (track.artists || []).filter(a => !a.is_owner).map(a => ({
      user_id: a.user_id, username: a.username, display_name: a.display_name,
      avatar: a.avatar, percent: a.percent, role: a.role || 'Artista invitado',
    }))
  )
  const [coverFile, setCoverFile]       = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const ownerName = (track.artists || []).find(a => a.is_owner)?.display_name || ''

  // Load the full credit list (including collaborators who haven't accepted yet)
  // so the owner edits the real set and no pending invite is dropped on save.
  useEffect(() => {
    let cancel = false
    trackArtists(track.id).then(list => {
      if (cancel || !Array.isArray(list)) return
      setCollabs(list.filter(a => !a.is_owner).map(a => ({
        user_id: a.user_id, username: a.username, display_name: a.display_name,
        avatar: a.avatar, percent: a.percent, role: a.role || 'Artista invitado',
      })))
    }).catch(() => {})
    return () => { cancel = true }
  }, [track.id])

  function handleCover(e) {
    const f = e.target.files[0]; if (!f) return
    setCoverFile(f); setCoverPreview(URL.createObjectURL(f))
  }

  async function save(e) {
    e.preventDefault()
    if (!title.trim()) { setError('El título no puede estar vacío'); return }
    const bad = collabs.find(c => !(Number(c.percent) >= 1 && Number(c.percent) <= 99))
    if (bad) { setError(`Pon un porcentaje entre 1 y 99 para ${bad.display_name || bad.username}`); return }
    if (collabs.reduce((n, c) => n + Number(c.percent), 0) >= 100) {
      setError('Los porcentajes de los colaboradores deben sumar menos de 100%'); return
    }
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('collaborators', JSON.stringify(
        collabs.map(c => ({ user_id: c.user_id, percent: Number(c.percent), role: c.role || '' }))
      ))
      if (coverFile) fd.append('cover', coverFile)
      const updated = await editTrack(track.id, fd)
      onSaved?.(updated)
      onClose?.()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="eg-backdrop" style={s.backdrop} onClick={onClose}>
      <div className="eg-modal" style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <span style={{ fontWeight:800, fontSize:16 }}>Editar canción</span>
          <button onClick={onClose} style={s.x} aria-label="Cerrar">✕</button>
        </div>
        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={save} style={s.form}>
          <div style={s.row}>
            <label style={s.coverLabel} title="Cambiar portada">
              <img src={coverPreview || `${trackCoverUrl(track.id)}?v=edit`} alt="Portada actual"
                style={s.cover} onError={e => { e.target.style.visibility = 'hidden' }} />
              <span style={s.coverHint}>Cambiar portada</span>
              <input type="file" accept="image/*" onChange={handleCover} style={{ display:'none' }} />
            </label>
            <div style={{ flex:1, minWidth:0 }}>
              <label style={s.fieldLabel}>Título</label>
              <input className="input" placeholder="Título de la canción" value={title}
                onChange={e => setTitle(e.target.value)} maxLength={120} />
            </div>
          </div>

          <CollaboratorPicker value={collabs} onChange={setCollabs} ownerName={ownerName} />
          <p style={s.note}>Si añades o cambias colaboradores, tendrán que aceptar antes de aparecer en la canción.</p>

          <div style={s.actions}>
            <button type="button" onClick={onClose} className="btn-outline">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const s = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:300,
    display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal: { width:'100%', maxWidth:460, maxHeight:'88vh', overflowY:'auto',
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16,
    boxShadow:'0 24px 60px -16px rgba(0,0,0,.7)', padding:18 },
  head: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  x: { background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:16, display:'flex' },
  error: { background:'rgba(var(--danger-rgb),.15)', color:'var(--danger)', padding:'10px 14px', borderRadius:8, marginBottom:12, fontSize:13 },
  form: { display:'flex', flexDirection:'column', gap:14 },
  row: { display:'flex', gap:14, alignItems:'flex-start' },
  fieldLabel: { display:'block', fontSize:12, fontWeight:600, color:'var(--text3)', marginBottom:6 },
  coverLabel: { width:104, height:104, flexShrink:0, borderRadius:12, overflow:'hidden', cursor:'pointer',
    position:'relative', display:'block', border:'1px solid var(--border)', background:'var(--bg3)' },
  cover: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  coverHint: { position:'absolute', left:0, right:0, bottom:0, textAlign:'center', fontSize:10.5, fontWeight:700,
    color:'#fff', background:'rgba(0,0,0,.55)', padding:'4px 0' },
  note: { fontSize:12, color:'var(--text3)', lineHeight:1.5, margin:'-2px 0 0' },
  actions: { display:'flex', justifyContent:'flex-end', gap:10, marginTop:2 },
}
