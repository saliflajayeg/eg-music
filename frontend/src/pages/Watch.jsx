import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getTrack, trackStreamUrl, likeTrack, deleteTrack } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Watch() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [track, setTrack] = useState(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getTrack(Number(id))
      .then(t => {
        setTrack(t)
        setLiked(!!t.liked_by_me)
        setLikeCount(t.like_count || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  async function handleLike() {
    if (!user) return
    try {
      const r = await likeTrack(Number(id))
      setLiked(r.liked)
      setLikeCount(r.like_count)
    } catch {}
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este video?')) return
    try {
      await deleteTrack(Number(id))
      navigate(-1)
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>
  if (!track) return <div style={s.center}><p>Video no encontrado.</p></div>

  return (
    <div style={{padding:'20px 28px 32px',maxWidth:900,margin:'0 auto'}}>
      <video
        key={track.id}
        src={trackStreamUrl(track.id)}
        controls
        autoPlay
        style={s.video}
      />

      <div style={s.info}>
        <h1 style={s.title}>{track.title}</h1>
        <div style={s.row}>
          <Link to={`/user/${track.user_id}`} style={s.artist}>
            {track.display_name || track.username}
          </Link>
          {track.genre && <span style={s.genre}>{track.genre}</span>}
          <span style={s.views}>👁 {track.play_count} vistas</span>
        </div>

        <div style={s.actions}>
          <button onClick={handleLike}
            style={{...s.likeBtn, color: liked ? 'var(--danger)' : 'var(--text2)'}}>
            {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : ''}
          </button>
          {user && (user.id === track.user_id || user.is_admin) && (
            <button onClick={handleDelete} style={s.deleteBtn}>Eliminar</button>
          )}
        </div>

        {track.description && <p style={s.description}>{track.description}</p>}
      </div>
    </div>
  )
}

const s = {
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'},
  video: {
    width:'100%', maxHeight:'70vh', borderRadius:12,
    background:'#000', display:'block',
  },
  info: {marginTop:18},
  title: {fontSize:20,fontWeight:700,marginBottom:10},
  row: {display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:16},
  artist: {fontSize:14,color:'var(--accent2)',fontWeight:600},
  genre: {
    fontSize:10,fontWeight:600,background:'var(--bg3)',color:'var(--text3)',
    padding:'2px 8px',borderRadius:10,letterSpacing:.5,
  },
  views: {fontSize:13,color:'var(--text3)',marginLeft:'auto'},
  actions: {display:'flex',alignItems:'center',gap:16,paddingTop:12,borderTop:'1px solid var(--border)'},
  likeBtn: {fontSize:16,fontWeight:600},
  deleteBtn: {color:'var(--danger)',fontSize:13,fontWeight:600},
  description: {marginTop:16,color:'var(--text2)',fontSize:14,lineHeight:1.6,whiteSpace:'pre-wrap'},
}
