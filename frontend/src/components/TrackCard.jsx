import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { useAuth } from '../context/AuthContext'
import { trackCoverUrl, likeTrack, deleteTrack } from '../api'
import { isNative, isDownloaded, downloadMedia, deleteDownload } from '../offline'
import { shareTrack } from '../share'

export default function TrackCard({ track, queue, onDelete }) {
  const { playTrack, currentTrack, isPlaying } = usePlayer()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isVideo = track.media_type === 'video'
  const [liked,     setLiked]     = useState(!!track.liked_by_me)
  const [likeCount, setLikeCount] = useState(track.like_count || 0)
  const [err,       setErr]       = useState(false)
  const [dl,        setDl]        = useState('none') // 'none' | 'busy' | 'done'

  useEffect(() => {
    if (isNative()) isDownloaded(track.id).then(d => setDl(d ? 'done' : 'none'))
  }, [track.id])

  async function handleDownload(e) {
    e.stopPropagation()
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

  const isActive = !isVideo && currentTrack?.id === track.id

  function handlePlay() {
    if (isVideo) { navigate(`/watch/${track.id}`); return }
    if (isActive) return
    playTrack(track, queue)
  }

  async function handleLike(e) {
    e.stopPropagation()
    if (!user) return
    try {
      const r = await likeTrack(track.id)
      setLiked(r.liked)
      setLikeCount(r.like_count)
    } catch {}
  }

  async function handleShare(e) {
    e.stopPropagation()
    const r = await shareTrack(track)
    if (r === 'copied') alert('Enlace copiado. Pégalo donde quieras compartirlo.')
  }

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta canción?')) return
    try {
      await deleteTrack(track.id)
      onDelete?.(track.id)
    } catch (err) {
      alert(err.message)
    }
  }

  function fmt(s) {
    if (!s) return ''
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
  }

  return (
    <div style={{...s.card, background: isActive ? 'rgba(var(--accent-rgb),.12)' : 'var(--bg2)',
      border: isActive ? '1px solid rgba(var(--accent-rgb),.4)' : '1px solid var(--border)'}}>
      {/* Cover */}
      <div style={s.coverWrap} onClick={handlePlay}>
        {track.cover && !err ? (
          <img src={trackCoverUrl(track.id)} onError={() => setErr(true)} style={s.cover} alt="" />
        ) : (
          <div style={{...s.cover, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center'}}>
            {isVideo ? (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--text3)">
                <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--text3)">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            )}
          </div>
        )}
        <div style={{...s.playOverlay, opacity: isActive ? 1 : undefined}}>
          {isActive && isPlaying && !isVideo
            ? <IcoPause />
            : <IcoPlay />}
        </div>
      </div>

      {/* Info */}
      <div style={s.info}>
        <div style={s.title} title={track.title}>{track.title}</div>
        <Link to={`/user/${track.user_id}`} style={s.artist} onClick={e => e.stopPropagation()}>
          {track.display_name || track.username}
        </Link>
        {track.genre && <span style={s.genre}>{track.genre}</span>}
        <div style={s.meta}>
          <span>{fmt(track.duration)}</span>
          <span>{isVideo ? '👁' : '▶'} {track.play_count}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <button onClick={handleLike}
          style={{...s.likeBtn, color: liked ? 'var(--danger)' : 'var(--text3)'}}>
          {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : ''}
        </button>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <button onClick={handleShare} style={s.dlBtn} title="Compartir">
            <IcoShare />
          </button>
          {isNative() && (
            <button onClick={handleDownload} style={s.dlBtn}
              title={dl === 'done' ? 'Descargado' : 'Descargar para escuchar sin conexión'}>
              {dl === 'busy' ? '⏳' : dl === 'done' ? <span style={{color:'var(--accent2)'}}>✓⬇</span> : '⬇'}
            </button>
          )}
          {user && (user.id === track.user_id || user.is_admin) && (
            <button onClick={handleDelete} style={s.deleteBtn} title="Eliminar">✕</button>
          )}
        </div>
      </div>
    </div>
  )
}

const IcoShare = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
  </svg>
)
const IcoPlay  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
const IcoPause = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>

const s = {
  card: {
    borderRadius:10, overflow:'hidden',
    display:'flex', flexDirection:'column',
    transition:'box-shadow .15s',
  },
  coverWrap: {
    position:'relative', cursor:'pointer',
    aspectRatio:'1', overflow:'hidden',
  },
  cover: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  playOverlay: {
    position:'absolute', inset:0,
    background:'rgba(0,0,0,.45)',
    display:'flex', alignItems:'center', justifyContent:'center',
    opacity:0, transition:'opacity .15s',
    '.card:hover &': {opacity:1},
  },
  info: { padding:'8px 10px 2px', flex:1 },
  title: {
    fontSize:13, fontWeight:600, marginBottom:2,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
    color:'var(--text)',
  },
  artist: {
    fontSize:11, color:'var(--accent2)', display:'block', marginBottom:3,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
  },
  genre: {
    display:'inline-block', fontSize:9, fontWeight:600,
    background:'var(--bg3)', color:'var(--text3)',
    padding:'1px 6px', borderRadius:10, letterSpacing:.5,
  },
  meta: { display:'flex', gap:8, fontSize:10, color:'var(--text3)', marginTop:4 },
  actions: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 10px 8px' },
  likeBtn: { fontSize:14, transition:'color .15s', fontWeight:600 },
  dlBtn: { fontSize:13, color:'var(--text3)', padding:3, lineHeight:1 },
  deleteBtn: { color:'var(--text3)', fontSize:13, padding:3 },
}
