import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { trackCoverUrl, likeTrack } from '../api'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { isNative, isDownloaded, downloadMedia, deleteDownload } from '../offline'

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}

export default function Player() {
  const { currentTrack, isPlaying, currentTime, duration, volume,
          togglePlay, playNext, playPrev, seek, setVolume } = usePlayer()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [liked, setLiked] = React.useState(false)
  const [dl, setDl] = React.useState('none') // 'none' | 'busy' | 'done'
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  // Free plan can only play/pause — no skipping forward/back.
  const canSkip = user ? !!user.can_skip : true
  const skip = fn => canSkip ? fn() : navigate('/subscribe')

  React.useEffect(() => {
    if (currentTrack) setLiked(!!currentTrack.liked_by_me)
    if (currentTrack && isNative()) isDownloaded(currentTrack.id).then(d => setDl(d ? 'done' : 'none'))
    else setDl('none')
  }, [currentTrack?.id])

  async function handleLike() {
    if (!user || !currentTrack) return
    try { const r = await likeTrack(currentTrack.id); setLiked(r.liked) } catch {}
  }

  async function handleDownload() {
    if (!currentTrack) return
    if (!user) { navigate('/login'); return }
    if (dl === 'busy') return
    if (dl === 'done') {
      if (!confirm('¿Quitar de descargas?')) return
      await deleteDownload(currentTrack.id); setDl('none'); return
    }
    setDl('busy')
    try { await downloadMedia(currentTrack); setDl('done') }
    catch (err) { setDl('none'); alert(err.message) }
  }

  function onSeekClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    seek(((e.clientX - rect.left) / rect.width) * duration)
  }

  if (!currentTrack) return (
    <div style={s.empty}>
      <span style={{color:'var(--text3)', fontSize:13}}>Sin reproducción</span>
    </div>
  )

  const dlBtn = isNative() && (
    <button onClick={handleDownload} style={s.iconBtn}
      title={dl === 'done' ? 'Descargado' : 'Descargar'}>
      {dl === 'busy'
        ? <span style={{fontSize:14}}>⏳</span>
        : <IcoDownload done={dl === 'done'} />}
    </button>
  )
  const likeBtn = user && (
    <button onClick={handleLike} style={{...s.iconBtn, color: liked ? 'var(--danger)' : 'var(--text3)', fontSize:18}}>
      {liked ? '♥' : '♡'}
    </button>
  )

  // ── Phone: progress line across the top, one tidy row of controls ──
  if (isMobile) {
    return (
      <div style={s.rootMobile}>
        <div style={s.topProgress} onClick={onSeekClick}>
          <div style={{...s.trackFill, width:`${pct}%`}} />
        </div>
        <div style={s.mobileRow}>
          <TrackCover track={currentTrack} size={42} />
          <div style={{minWidth:0, flex:1}}>
            <div style={s.title}>{currentTrack.title}</div>
            <Link to={`/user/${currentTrack.user_id}`} style={s.artist}>
              {currentTrack.display_name || currentTrack.username}
            </Link>
          </div>
          {dlBtn}
          {likeBtn}
          <button onClick={() => skip(playPrev)} style={{...s.skipBtn, opacity: canSkip ? 1 : .35}}
            title={canSkip ? 'Anterior' : 'Mejora tu plan para saltar'}><IcoPrev /></button>
          <button onClick={togglePlay} style={s.playBtn}>
            {isPlaying ? <IcoPause /> : <IcoPlay />}
          </button>
          <button onClick={() => skip(playNext)} style={{...s.skipBtn, opacity: canSkip ? 1 : .35}}
            title={canSkip ? 'Siguiente' : 'Mejora tu plan para saltar'}><IcoNext /></button>
        </div>
      </div>
    )
  }

  // ── Desktop: three columns ──
  return (
    <div style={s.root}>
      <div style={s.left}>
        <TrackCover track={currentTrack} size={48} />
        <div style={{minWidth:0}}>
          <div style={s.title}>{currentTrack.title}</div>
          <Link to={`/user/${currentTrack.user_id}`} style={s.artist}>
            {currentTrack.display_name || currentTrack.username}
          </Link>
        </div>
        {dlBtn}
        {likeBtn}
      </div>

      <div style={s.center}>
        <div style={s.controls}>
          <button onClick={() => skip(playPrev)} style={{...s.skipBtn, opacity: canSkip ? 1 : .35}}
            title={canSkip ? 'Anterior' : 'Mejora tu plan para saltar'}><IcoPrev /></button>
          <button onClick={togglePlay} style={s.playBtn}>
            {isPlaying ? <IcoPause /> : <IcoPlay />}
          </button>
          <button onClick={() => skip(playNext)} style={{...s.skipBtn, opacity: canSkip ? 1 : .35}}
            title={canSkip ? 'Siguiente' : 'Mejora tu plan para saltar'}><IcoNext /></button>
        </div>
        <div style={s.progressRow}>
          <span style={s.time}>{fmt(currentTime)}</span>
          <div style={s.trackBg} onClick={onSeekClick}>
            <div style={{...s.trackFill, width:`${pct}%`}} />
          </div>
          <span style={s.time}>{fmt(duration)}</span>
        </div>
      </div>

      <div style={s.right}>
        <IcoVol />
        <input type="range" min={0} max={1} step={0.02} value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          style={{width:64, accentColor:'var(--accent)', cursor:'pointer'}} />
      </div>
    </div>
  )
}

function TrackCover({ track, size }) {
  const [err, setErr] = React.useState(false)
  if (!track.cover || err) {
    return (
      <div style={{width:size,height:size,flexShrink:0,borderRadius:6,
        background:'var(--bg3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width={size*.5} height={size*.5} viewBox="0 0 24 24" fill="var(--text3)">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
    )
  }
  return <img src={trackCoverUrl(track.id)} onError={()=>setErr(true)}
    style={{width:size,height:size,flexShrink:0,borderRadius:6,objectFit:'cover'}} alt="" />
}

const IcoPlay  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7L8.53 4.65A1 1 0 0 0 7 5.5z"/></svg>
const IcoPause = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></svg>
const IcoNext  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 5.6v12.8a1 1 0 0 0 1.54.84l8-6.4a1 1 0 0 0 0-1.68l-8-6.4A1 1 0 0 0 6.5 5.6z"/><rect x="17.4" y="5" width="2.4" height="14" rx="1.2"/></svg>
const IcoPrev  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 5.6v12.8a1 1 0 0 1-1.54.84l-8-6.4a1 1 0 0 1 0-1.68l8-6.4A1 1 0 0 1 17.5 5.6z"/><rect x="4.2" y="5" width="2.4" height="14" rx="1.2"/></svg>
const IcoVol   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text3)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
const IcoDownload = ({ done }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke={done ? 'var(--accent2)' : 'currentColor'} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    {done
      ? <><path d="M20 6 9 17l-5-5"/></>
      : <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>}
  </svg>
)

const s = {
  root: {
    display:'grid', gridTemplateColumns:'1fr 2fr 1fr',
    alignItems:'center', padding:'0 20px',
    height:'var(--player-h)', background:'var(--bg2)',
    borderTop:'1px solid var(--border)',
  },
  rootMobile: {
    position:'relative',
    height:'64px', background:'var(--bg2)',
    borderTop:'1px solid var(--border)',
  },
  topProgress: {
    position:'absolute', top:0, left:0, right:0, height:5,
    background:'var(--bg4)', cursor:'pointer',
  },
  mobileRow: {
    display:'flex', alignItems:'center', gap:6,
    height:'100%', padding:'0 8px 0 10px',
  },
  empty: {
    height:'var(--player-h)', display:'flex', alignItems:'center',
    justifyContent:'center', background:'var(--bg2)',
    borderTop:'1px solid var(--border)',
  },
  left:   {display:'flex',alignItems:'center',gap:10,minWidth:0},
  title:  {fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  artist: {fontSize:12,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block'},

  iconBtn: {color:'var(--text2)',display:'flex',alignItems:'center',justifyContent:'center',padding:5,flexShrink:0},
  skipBtn: {color:'var(--accent2)',display:'flex',alignItems:'center',justifyContent:'center',padding:4,flexShrink:0,transition:'opacity .15s'},

  center: {display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'0 16px'},
  controls: {display:'flex',alignItems:'center',gap:10},
  playBtn: {
    width:40,height:40,borderRadius:'50%',
    background:'var(--accent)',color:'#fff',
    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
    boxShadow:'0 2px 8px rgba(var(--accent-rgb),.45)',
  },
  progressRow: {display:'flex',alignItems:'center',gap:8,width:'100%'},
  time: {fontSize:11,color:'var(--text3)',minWidth:34,textAlign:'center'},
  trackBg: {flex:1,height:4,background:'var(--bg4)',borderRadius:2,cursor:'pointer',position:'relative'},
  trackFill: {position:'absolute',left:0,top:0,height:'100%',background:'var(--accent)',borderRadius:2,pointerEvents:'none'},

  right: {display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'},
}
