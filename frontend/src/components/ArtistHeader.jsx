import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUser, toggleFollow, avatarUrl } from '../api'
import ArtistLine from './ArtistLine'

// The "channel" chip in the watch header: artist avatar + name + follower
// count, with a Seguir / Siguiendo button. Fetches the uploader's profile.
export default function ArtistHeader({ track }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = track.user_id
  const [artist, setArtist]       = useState(null)
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    let cancel = false
    setArtist(null)
    getUser(uid).then(a => { if (!cancel) { setArtist(a); setFollowing(!!a.is_following) } }).catch(() => {})
    return () => { cancel = true }
  }, [uid])

  async function onFollow(e) {
    e.stopPropagation()
    if (!user) { navigate('/login'); return }
    const prev = following
    setFollowing(!prev)                       // optimistic
    try { const r = await toggleFollow(uid); setFollowing(!!r.following) }
    catch { setFollowing(prev) }
  }

  const isSelf = user && user.id === uid
  const av = artist && avatarUrl(artist.avatar)
  const initial = (track.display_name || track.username || '?').trim().charAt(0).toUpperCase()
  const fc = artist ? artist.follower_count : null

  return (
    <div style={s.row}>
      <Link to={`/user/${uid}`} onClick={e => e.stopPropagation()} style={s.avatarLink}>
        {av
          ? <img src={av} alt="" style={s.avatar} onError={e => { e.target.style.display = 'none' }} />
          : <div style={s.avatarPh}>{initial}</div>}
      </Link>
      <div style={s.names}>
        <ArtistLine track={track} style={s.artistName} />
        <div style={s.followers}>{fc != null ? `${fc} ${fc === 1 ? 'seguidor' : 'seguidores'}` : ' '}</div>
      </div>
      {!isSelf && (
        <button onClick={onFollow} style={following ? s.followingBtn : s.followBtn}>
          {following ? 'Siguiendo' : 'Seguir'}
        </button>
      )}
    </div>
  )
}

const s = {
  row: { display:'flex', alignItems:'center', gap:11 },
  avatarLink: { flexShrink:0, display:'block' },
  avatar: { width:42, height:42, borderRadius:'50%', objectFit:'cover', display:'block', background:'var(--bg3)' },
  avatarPh: { width:42, height:42, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18, color:'#fff', background:'linear-gradient(135deg, var(--accent), var(--blue))' },
  names: { minWidth:0, lineHeight:1.25 },
  artistName: { fontSize:14, fontWeight:700, color:'var(--text)', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  followers: { fontSize:12, color:'var(--text3)' },
  followBtn: { flexShrink:0, background:'var(--text)', color:'var(--bg)', fontWeight:700, fontSize:13, border:'none', borderRadius:20, padding:'8px 16px', cursor:'pointer' },
  followingBtn: { flexShrink:0, background:'var(--bg3)', color:'var(--text)', fontWeight:700, fontSize:13, border:'1px solid var(--border)', borderRadius:20, padding:'8px 16px', cursor:'pointer' },
}
