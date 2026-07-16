import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getTrack, trackCoverUrl, likeTrack } from '../api'
import { usePlayer } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import { shareTrack } from '../share'
import { isNative, isDownloaded, downloadMedia, deleteDownload } from '../offline'

// Landing page for a shared song. Someone taps a link in WhatsApp and lands
// here: big artwork, play, and a share button to pass it on.
export default function Track() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer()
  const [track, setTrack]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked]   = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [dl, setDl]         = useState('none')
  const [imgErr, setImgErr] = useState(false)
  const [toast, setToast]   = useState('')

  useEffect(() => {
    setLoading(true)
    getTrack(Number(id))
      .then(async t => {
        // A shared video link belongs on the watch page.
        if (t.media_type === 'video') { navigate(`/watch/${t.id}`, { replace: true }); return }
        setTrack(t); setLiked(!!t.liked_by_me); setLikeCount(t.like_count || 0)
        if (isNative()) setDl(await isDownloaded(t.id) ? 'done' : 'none')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const isCurrent = currentTrack?.id === Number(id)

  async function handleShare() {
    const r = await shareTrack(track)
    if (r === 'copied') { setToast('Enlace copiado'); setTimeout(() => setToast(''), 2000) }
  }

  async function handleLike() {
    if (!user) { navigate('/login'); return }
    try { const r = await likeTrack(track.id); setLiked(r.liked); setLikeCount(r.like_count) } catch {}
  }

  async function handleDownload() {
    if (!user) { navigate('/login'); return }
    if (dl === 'busy') return
    if (dl === 'done') {
      if (!confirm('¿Quitar de descargas?')) return
      await deleteDownload(track.id); setDl('none'); return
    }
    setDl('busy')
    try { await downloadMedia(track); setDl('done') }
    catch (err) { setDl('none'); alert(err.message) }
  }

  if (loading) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>
  if (!track)  return <div style={s.center}><p>Canción no encontrada.</p></div>

  return (
    <div style={s.root}>
      <div style={s.cover}>
        {track.cover && !imgErr
          ? <img src={trackCoverUrl(track.id)} onError={() => setImgErr(true)} style={s.coverImg} alt="" />
          : <div style={s.coverPh}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--text3)">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>}
      </div>

      <h1 style={s.title}>{track.title}</h1>
      <Link to={`/user/${track.user_id}`} style={s.artist}>
        {track.display_name || track.username}
      </Link>
      <div style={s.meta}>
        {track.genre && <span style={s.genre}>{track.genre}</span>}
        <span>▶ {track.play_count} reproducciones</span>
      </div>

      <button
        onClick={() => isCurrent ? togglePlay() : playTrack(track, [track])}
        style={s.playBtn}>
        {isCurrent && isPlaying ? '⏸  Pausar' : '▶  Reproducir'}
      </button>

      <div style={s.actions}>
        <button onClick={handleShare} style={s.actionBtn}>
          <IcoShare /> Compartir
        </button>
        <button onClick={handleLike} style={{...s.actionBtn, color: liked ? 'var(--danger)' : 'var(--text2)'}}>
          {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : 'Me gusta'}
        </button>
        {isNative() && (
          <button onClick={handleDownload} style={s.actionBtn}>
            {dl === 'busy' ? '⏳ ...' : dl === 'done' ? '✓ Descargado' : '⬇ Descargar'}
          </button>
        )}
      </div>

      {track.description && <p style={s.desc}>{track.description}</p>}
      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}

const IcoShare = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'-3px'}}>
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
  </svg>
)

const s = {
  root: {padding:'24px 16px 40px', maxWidth:520, margin:'0 auto', textAlign:'center'},
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'},
  cover: {width:'100%', maxWidth:300, aspectRatio:'1', margin:'0 auto 20px', borderRadius:14, overflow:'hidden', background:'var(--bg3)'},
  coverImg: {width:'100%', height:'100%', objectFit:'cover', display:'block'},
  coverPh: {width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center'},
  title: {fontSize:22, fontWeight:800, marginBottom:4},
  artist: {fontSize:14, color:'var(--accent2)', fontWeight:600},
  meta: {display:'flex', gap:10, justifyContent:'center', alignItems:'center', margin:'10px 0 20px', fontSize:12, color:'var(--text3)', flexWrap:'wrap'},
  genre: {fontSize:10, fontWeight:600, background:'var(--bg3)', color:'var(--text3)', padding:'2px 8px', borderRadius:10, letterSpacing:.5},
  playBtn: {
    width:'100%', maxWidth:300, background:'var(--accent)', color:'#fff', fontWeight:700,
    padding:'13px 0', borderRadius:30, fontSize:15, border:'none', cursor:'pointer',
    boxShadow:'0 2px 12px rgba(var(--accent-rgb),.4)',
  },
  actions: {display:'flex', gap:8, justifyContent:'center', marginTop:18, flexWrap:'wrap'},
  actionBtn: {
    display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', color:'var(--text2)',
    border:'1px solid var(--border)', borderRadius:20, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer',
  },
  desc: {marginTop:22, color:'var(--text2)', fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap', textAlign:'left'},
  toast: {
    position:'fixed', bottom:'calc(var(--player-h) + 16px)', left:'50%', transform:'translateX(-50%)',
    background:'var(--bg4)', color:'var(--text)', padding:'10px 18px', borderRadius:20,
    fontSize:13, fontWeight:600, zIndex:300,
  },
}
