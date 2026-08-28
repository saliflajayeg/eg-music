import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMedia } from '../context/MediaContext'
import { useAuth } from '../context/AuthContext'
import { trackCoverUrl, likeTrack, deleteTrack, scheduleTrack } from '../api'
import { isNative, isDownloaded, downloadMedia, deleteDownload } from '../offline'
import { shareTrack } from '../share'
import ArtistLine from './ArtistLine'
import AddToPlaylist from './AddToPlaylist'

// YouTube-style card: a big 16:9 thumbnail leads, title + artist below.
// onRemove(id): when given (e.g. inside a playlist), shows a "Quitar" action.
export default function TrackCard({ track, queue, onDelete, onRemove }) {
  const { play, current, isPlaying } = useMedia()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isVideo = track.media_type === 'video'
  const [liked,     setLiked]     = useState(!!track.liked_by_me)
  const [likeCount, setLikeCount] = useState(track.like_count || 0)
  const [err,       setErr]       = useState(false)
  const [dl,        setDl]        = useState('none')
  const [hover,     setHover]     = useState(false)
  const [pub,       setPub]       = useState(track.publish_at || '')

  // publish_at llega como 'YYYY-MM-DD HH:MM:SS' en UTC
  const schedAt = pub ? new Date(pub.replace(' ', 'T') + 'Z') : null
  const isScheduled = schedAt && schedAt.getTime() > Date.now()
  const canManage = user && (user.id === track.user_id || user.is_admin)

  useEffect(() => {
    if (isNative()) isDownloaded(track.id).then(d => setDl(d ? 'done' : 'none'))
  }, [track.id])

  const isActive = current?.id === track.id

  function handlePlay() { play(track, queue) }

  async function handleLike(e) {
    e.stopPropagation()
    if (!user) return
    try { const r = await likeTrack(track.id); setLiked(r.liked); setLikeCount(r.like_count) } catch {}
  }
  async function handleShare(e) {
    e.stopPropagation()
    const r = await shareTrack(track)
    if (r === 'copied') alert('Enlace copiado. Pégalo donde quieras compartirlo.')
  }
  async function handleDownload(e) {
    e.stopPropagation()
    if (!user) { navigate('/login'); return }
    if (dl === 'busy') return
    if (dl === 'done') { if (!confirm('¿Quitar de descargas?')) return; await deleteDownload(track.id); setDl('none'); return }
    setDl('busy')
    try { await downloadMedia(track); setDl('done') } catch (err) { setDl('none'); alert(err.message) }
  }
  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirm('¿Eliminar esto?')) return
    try { await deleteTrack(track.id); onDelete?.(track.id) } catch (err) { alert(err.message) }
  }
  async function handlePublishNow(e) {
    e.stopPropagation()
    if (!confirm('¿Publicar esta canción ahora?')) return
    try { await scheduleTrack(track.id, ''); setPub('') } catch (err) { alert(err.message) }
  }

  const fmt = sec => sec ? `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}` : ''
  const badge = fmt(track.duration) || (isVideo ? 'video' : '')

  return (
    <div style={s.card} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* Thumbnail */}
      <div style={s.thumb} onClick={handlePlay}>
        {track.cover && !err ? (
          <img src={trackCoverUrl(track.id)} onError={() => setErr(true)} style={s.thumbImg} alt="" />
        ) : (
          <div style={s.thumbPh}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="var(--text3)">
              {isVideo
                ? <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                : <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>}
            </svg>
          </div>
        )}
        <div style={{ ...s.overlay, opacity: hover || isActive ? 1 : 0 }}>
          <div style={s.playCircle}>{isActive && isPlaying ? <IcoPause /> : <IcoPlay />}</div>
        </div>
        {badge && <span style={s.badge}>{badge}</span>}
        {isScheduled && <span style={s.schedBadge}>⏳ Programada</span>}
      </div>

      {/* Info */}
      <div style={s.info}>
        <div style={{ ...s.title, color: isActive ? 'var(--accent2)' : 'var(--text)' }} title={track.title}>{track.title}</div>
        <ArtistLine track={track} style={s.artist} />
        {isScheduled && canManage && (
          <div style={s.schedRow}>
            <span title={schedAt.toLocaleString()}>
              ⏳ Se publica el {schedAt.toLocaleDateString()} a las {schedAt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </span>
            <button onClick={handlePublishNow} style={s.pubNowBtn}>Publicar ahora</button>
          </div>
        )}
        <div style={s.meta}>
          <span>{isVideo ? '👁' : '▶'} {track.play_count}</span>
          {track.genre && <><span style={s.dot}>·</span><span>{track.genre}</span></>}
        </div>
        <div style={s.actions}>
          <button onClick={handleLike} style={{ ...s.actBtn, color: liked ? 'var(--danger)' : 'var(--text3)' }} title="Me gusta">
            {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : ''}
          </button>
          <button onClick={handleShare} style={s.actBtn} title="Compartir"><IcoShare /></button>
          <AddToPlaylist trackId={track.id} compact />
          {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(track.id) }} style={s.actBtn} title="Quitar de la lista">Quitar</button>
          )}
          {isNative() && (
            <button onClick={handleDownload} style={s.actBtn} title={dl === 'done' ? 'Descargado' : 'Descargar'}>
              {dl === 'busy' ? '⏳' : dl === 'done' ? <span style={{ color:'var(--accent2)' }}>✓</span> : '⬇'}
            </button>
          )}
          {user && (user.id === track.user_id || user.is_admin) && (
            <button onClick={handleDelete} style={{ ...s.actBtn, marginLeft:'auto' }} title="Eliminar">✕</button>
          )}
        </div>
      </div>
    </div>
  )
}

const IcoShare = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>
  </svg>
)
const IcoPlay  = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
const IcoPause = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>

const s = {
  card: { display:'flex', flexDirection:'column' },
  thumb: {
    position:'relative', cursor:'pointer', aspectRatio:'16 / 9',
    overflow:'hidden', borderRadius:12, background:'var(--bg3)',
  },
  thumbImg: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  thumbPh: { width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' },
  overlay: {
    position:'absolute', inset:0, background:'rgba(0,0,0,.35)',
    display:'flex', alignItems:'center', justifyContent:'center', transition:'opacity .15s',
  },
  playCircle: {
    width:52, height:52, borderRadius:'50%', background:'rgba(0,0,0,.55)',
    display:'flex', alignItems:'center', justifyContent:'center',
  },
  badge: {
    position:'absolute', right:6, bottom:6, background:'rgba(0,0,0,.8)', color:'#fff',
    fontSize:11, fontWeight:600, padding:'1px 6px', borderRadius:4, letterSpacing:.3,
  },
  schedBadge: {
    position:'absolute', left:6, top:6, background:'rgba(242,183,5,.92)', color:'#1a1200',
    fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:4, letterSpacing:.2,
  },
  schedRow: {
    display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
    fontSize:12, color:'var(--gold, #f2b705)', margin:'4px 0 2px',
  },
  pubNowBtn: {
    fontSize:11, fontWeight:700, color:'#fff', background:'var(--accent)',
    border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer',
  },
  info: { padding:'10px 2px 4px' },
  title: {
    fontSize:14, fontWeight:600, lineHeight:1.3, marginBottom:3,
    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
  },
  artist: {
    fontSize:12, color:'var(--text2)', display:'block',
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
  },
  meta: { display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text3)', marginTop:2 },
  dot: { color:'var(--text3)' },
  actions: { display:'flex', alignItems:'center', gap:14, marginTop:8 },
  actBtn: { fontSize:13, fontWeight:600, color:'var(--text3)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:4, padding:0 },
}
