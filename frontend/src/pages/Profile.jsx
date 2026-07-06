import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getUser, getUserTracks, toggleFollow } from '../api'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/Navbar'
import TrackCard from '../components/TrackCard'

export default function Profile() {
  const { id }          = useParams()
  const { user: me, refreshUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [tracks,  setTracks]  = useState([])
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [p, t] = await Promise.all([getUser(Number(id)), getUserTracks(Number(id))])
      setProfile(p)
      setTracks(t)
      setFollowing(!!p.is_following)
    } catch {}
    setLoading(false)
  }

  async function handleFollow() {
    if (!me) return
    const r = await toggleFollow(Number(id))
    setFollowing(r.following)
    setProfile(p => ({
      ...p,
      follower_count: p.follower_count + (r.following ? 1 : -1),
      is_following: r.following,
    }))
  }

  function onDelete(tid) { setTracks(t => t.filter(x => x.id !== tid)) }

  if (loading) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>
  if (!profile) return <div style={s.center}><p>Usuario no encontrado.</p></div>

  const isMe = me?.id === profile.id

  return (
    <div>
      {/* Header */}
      <div style={s.header}>
        <Avatar user={profile} size={90} />
        <div style={s.headerInfo}>
          <div style={s.nameRow}>
            <h1 style={{fontSize:24,fontWeight:700}}>{profile.display_name || profile.username}</h1>
            {profile.plan === 'pro'    && <span className="badge-plan-pro">PRO</span>}
            {profile.plan === 'legend' && <span className="badge-plan-legend">LEGEND</span>}
            {profile.is_admin          && <span className="badge-admin">ADMIN</span>}
          </div>
          <p style={{color:'var(--text3)',fontSize:13}}>@{profile.username}</p>
          {profile.bio && <p style={{color:'var(--text2)',marginTop:6,fontSize:14}}>{profile.bio}</p>}

          <div style={s.stats}>
            <Stat n={profile.track_count}    label="canciones" />
            <Stat n={profile.follower_count}  label="seguidores" />
            <Stat n={profile.following_count} label="siguiendo" />
          </div>

          {!isMe && me && (
            <button
              onClick={handleFollow}
              style={{
                marginTop:14, padding:'9px 22px', borderRadius:8, fontWeight:600, fontSize:13,
                background: following ? 'transparent' : 'var(--accent)',
                border: following ? '1px solid var(--border)' : 'none',
                color: following ? 'var(--text2)' : '#fff',
                cursor:'pointer',
              }}
            >
              {following ? 'Siguiendo' : 'Seguir'}
            </button>
          )}
        </div>
      </div>

      {/* Tracks */}
      <div style={{padding:'0 28px 32px'}}>
        <h2 style={{fontSize:16,fontWeight:700,marginBottom:16}}>
          Canciones <span style={{color:'var(--text3)',fontWeight:400}}>({tracks.length})</span>
        </h2>
        {tracks.length === 0 ? (
          <p style={{color:'var(--text3)'}}>
            {isMe ? 'Aún no has subido música.' : 'Este artista aún no ha publicado música.'}
          </p>
        ) : (
          <div style={s.grid}>
            {tracks.map(t => <TrackCard key={t.id} track={t} queue={tracks} onDelete={onDelete} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{textAlign:'center'}}>
      <div style={{fontWeight:700,fontSize:18}}>{n}</div>
      <div style={{color:'var(--text3)',fontSize:12}}>{label}</div>
    </div>
  )
}

const s = {
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'},
  header: {
    display:'flex',gap:24,alignItems:'flex-end',
    padding:'36px 28px 28px',
    background:'linear-gradient(180deg,rgba(var(--accent-rgb),.22) 0%,transparent 100%)',
    marginBottom:8,
  },
  headerInfo: {flex:1,minWidth:0},
  nameRow: {display:'flex',alignItems:'center',gap:10,marginBottom:4,flexWrap:'wrap'},
  stats: {display:'flex',gap:24,marginTop:14},
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',
    gap:12,
  },
}
