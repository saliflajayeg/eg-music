import React from 'react'
import { Link } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { trackCoverUrl, likeTrack } from '../api'
import { useAuth } from '../context/AuthContext'

function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}

export default function Player() {
  const { currentTrack, isPlaying, currentTime, duration, volume,
          togglePlay, playNext, playPrev, seek, setVolume } = usePlayer()
  const { user } = useAuth()
  const [liked, setLiked] = React.useState(false)
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  React.useEffect(() => {
    if (currentTrack) setLiked(!!currentTrack.liked_by_me)
  }, [currentTrack?.id])

  async function handleLike() {
    if (!user || !currentTrack) return
    try {
      const r = await likeTrack(currentTrack.id)
      setLiked(r.liked)
    } catch {}
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

  return (
    <div style={s.root}>
      {/* Left: track info */}
      <div style={s.left}>
        <TrackCover track={currentTrack} size={48} />
        <div style={{minWidth:0}}>
          <div style={s.title}>{currentTrack.title}</div>
          <Link to={`/user/${currentTrack.user_id}`} style={s.artist}>
            {currentTrack.display_name || currentTrack.username}
          </Link>
        </div>
        {user && (
          <button onClick={handleLike} style={{...s.heartBtn, color: liked ? 'var(--danger)' : 'var(--text3)'}}>
            {liked ? '♥' : '♡'}
          </button>
        )}
      </div>

      {/* Center: controls */}
      <div style={s.center}>
        <div style={s.controls}>
          <Btn onClick={playPrev}><IcoPrev /></Btn>
          <button onClick={togglePlay} style={s.playBtn}>
            {isPlaying ? <IcoPause /> : <IcoPlay />}
          </button>
          <Btn onClick={playNext}><IcoNext /></Btn>
        </div>
        <div style={s.progressRow}>
          <span style={s.time}>{fmt(currentTime)}</span>
          <div style={s.trackBg} onClick={onSeekClick}>
            <div style={{...s.trackFill, width:`${pct}%`}} />
          </div>
          <span style={s.time}>{fmt(duration)}</span>
        </div>
      </div>

      {/* Right: volume */}
      <div style={s.right}>
        <IcoVol />
        <input type="range" min={0} max={1} step={0.02} value={volume}
          onChange={e => setVolume(Number(e.target.value))}
          style={{width:88, accentColor:'var(--accent)', cursor:'pointer'}} />
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

function Btn({onClick,children}) {
  return <button onClick={onClick} style={{color:'var(--text2)',display:'flex',alignItems:'center',padding:6,borderRadius:'50%'}}>{children}</button>
}

const IcoPlay  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
const IcoPause = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
const IcoNext  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
const IcoPrev  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
const IcoVol   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text3)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>

const s = {
  root: {
    display:'grid', gridTemplateColumns:'1fr 2fr 1fr',
    alignItems:'center', padding:'0 20px',
    height:'var(--player-h)', background:'var(--bg2)',
    borderTop:'1px solid var(--border)',
  },
  empty: {
    height:'var(--player-h)', display:'flex', alignItems:'center',
    justifyContent:'center', background:'var(--bg2)',
    borderTop:'1px solid var(--border)',
  },
  left:   {display:'flex',alignItems:'center',gap:10,minWidth:0},
  title:  {fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  artist: {fontSize:12,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},
  heartBtn: {fontSize:18, padding:'0 4px', flexShrink:0, transition:'color .15s'},

  center: {display:'flex',flexDirection:'column',alignItems:'center',gap:6,padding:'0 16px'},
  controls: {display:'flex',alignItems:'center',gap:6},
  playBtn: {
    width:36,height:36,borderRadius:'50%',
    background:'var(--text)',color:'var(--bg)',
    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
  },
  progressRow: {display:'flex',alignItems:'center',gap:8,width:'100%'},
  time: {fontSize:11,color:'var(--text3)',minWidth:34,textAlign:'center'},
  trackBg: {flex:1,height:4,background:'var(--bg4)',borderRadius:2,cursor:'pointer',position:'relative'},
  trackFill: {position:'absolute',left:0,top:0,height:'100%',background:'var(--accent)',borderRadius:2,pointerEvents:'none'},

  right: {display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'},
}
