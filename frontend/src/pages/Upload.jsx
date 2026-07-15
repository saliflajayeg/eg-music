import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadTrack } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Upload() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title:'', artist: user?.display_name || '', album:'', genre:'', description:'' })
  const [mediaFile, setMediaFile] = useState(null)
  const isVideo = mediaFile && /\.(mp4|webm|mov)$/i.test(mediaFile.name)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!user) return <div style={s.center}><p>Inicia sesión primero.</p></div>
  if (!user.can_upload) {
    return (
      <div style={s.center}>
        <div style={s.gate}>
          <div style={{fontSize:40,marginBottom:12}}>🎵</div>
          <h2 style={{marginBottom:8}}>Plan Pro o Premium requerido</h2>
          <p style={{color:'var(--text2)',marginBottom:20,textAlign:'center',maxWidth:320}}>
            Para subir y compartir tu música necesitas un plan de artista: Pro o Premium.
          </p>
          <button className="btn-primary" onClick={() => navigate('/subscribe')}>
            Ver planes de artista
          </button>
        </div>
      </div>
    )
  }
  const limitReached = !user.is_admin && user.upload_limit != null && user.upload_count >= user.upload_limit
  if (limitReached) {
    return (
      <div style={s.center}>
        <div style={s.gate}>
          <div style={{fontSize:40,marginBottom:12}}>🏆</div>
          <h2 style={{marginBottom:8}}>Límite mensual alcanzado</h2>
          <p style={{color:'var(--text2)',marginBottom:20,textAlign:'center',maxWidth:340}}>
            Tu plan {user.plan === 'pro' ? 'Pro' : 'Premium'} permite {user.upload_limit} subidas al mes.
            {user.plan === 'pro' ? ' Mejora a Premium para subir más.' : ' El límite se reinicia el mes que viene.'}
          </p>
          {user.plan === 'pro' && (
            <button className="btn-primary" onClick={() => navigate('/subscribe')}>Mejorar a Premium</button>
          )}
        </div>
      </div>
    )
  }

  function handleCover(e) {
    const f = e.target.files[0]
    if (!f) return
    setCoverFile(f)
    const url = URL.createObjectURL(f)
    setCoverPreview(url)
  }

  async function submit(e) {
    e.preventDefault()
    if (!mediaFile) { setError('Selecciona un archivo de audio o video'); return }
    if (!form.title.trim()) { setError('El título es obligatorio'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('title',       form.title.trim())
      fd.append('artist',      form.artist.trim() || user.display_name || user.username)
      fd.append('album',       form.album)
      fd.append('genre',       form.genre)
      fd.append('description', form.description)
      fd.append('audio',       mediaFile)
      if (coverFile) fd.append('cover', coverFile)
      const track = await uploadTrack(fd)
      await refreshUser()
      navigate(`/user/${user.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const f = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div style={{padding:'32px 28px',maxWidth:680,margin:'0 auto'}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:user.upload_limit!=null?4:24}}>Subir canción o video</h1>
      {user.upload_limit != null && (
        <p style={{color:'var(--text3)',fontSize:12,marginBottom:20}}>
          {user.upload_count}/{user.upload_limit} subidas usadas este mes
        </p>
      )}
      {error && <div style={s.error}>{error}</div>}

      <form onSubmit={submit} style={s.form}>
        <div style={s.row}>
          {/* Cover picker */}
          <label style={s.coverLabel}>
            {coverPreview ? (
              <img src={coverPreview} style={s.coverPreview} alt="portada" />
            ) : (
              <div style={s.coverPlaceholder}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--text3)">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <span style={{fontSize:12,color:'var(--text3)',marginTop:6}}>Portada</span>
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleCover} style={{display:'none'}} />
          </label>

          {/* Fields */}
          <div style={s.fields}>
            <input className="input" placeholder="Título de la canción *" required
              value={form.title} onChange={e => f('title', e.target.value)} />
            <input className="input" placeholder="Artista"
              value={form.artist} onChange={e => f('artist', e.target.value)} />
            <input className="input" placeholder="Álbum (opcional)"
              value={form.album} onChange={e => f('album', e.target.value)} />
            <input className="input" placeholder="Género (ej. Afrobeat, Gospel, Salsa...)"
              value={form.genre} onChange={e => f('genre', e.target.value)} />
          </div>
        </div>

        <textarea className="input" placeholder="Descripción (opcional)" rows={3}
          value={form.description} onChange={e => f('description', e.target.value)}
          style={{resize:'vertical'}} />

        {/* Audio or video file */}
        <div style={s.fileBox}>
          <label style={s.fileLabel}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
            </svg>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>
                {mediaFile ? mediaFile.name : 'Seleccionar archivo de audio o video'}
              </div>
              <div style={{fontSize:12,color:'var(--text3)'}}>MP3, FLAC, WAV, OGG, M4A · MP4, WEBM, MOV</div>
            </div>
            <input type="file" accept=".mp3,.flac,.wav,.ogg,.m4a,.aac,.mp4,.webm,.mov"
              onChange={e => setMediaFile(e.target.files[0])} style={{display:'none'}} required />
          </label>
        </div>

        <button className="btn-primary" type="submit" disabled={loading} style={{alignSelf:'flex-start',padding:'11px 28px'}}>
          {loading ? 'Subiendo...' : isVideo ? 'Publicar video' : 'Publicar canción'}
        </button>
      </form>
    </div>
  )
}

const s = {
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'},
  gate:   {display:'flex',flexDirection:'column',alignItems:'center',padding:32,background:'var(--bg2)',borderRadius:12,border:'1px solid var(--border)'},
  error:  {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13},
  form:   {display:'flex',flexDirection:'column',gap:14},
  row:    {display:'flex',gap:16,alignItems:'flex-start'},
  fields: {flex:1,display:'flex',flexDirection:'column',gap:12},
  coverLabel: {
    width:140,height:140,flexShrink:0,borderRadius:8,overflow:'hidden',
    cursor:'pointer',display:'block',border:'2px dashed var(--border)',
    transition:'border-color .15s',
  },
  coverPreview:    {width:'100%',height:'100%',objectFit:'cover',display:'block'},
  coverPlaceholder:{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'},
  fileBox: {background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'},
  fileLabel:{display:'flex',alignItems:'center',gap:14,padding:'16px 20px',cursor:'pointer'},
}
