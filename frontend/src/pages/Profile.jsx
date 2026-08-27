import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getUser, getUserTracks, toggleFollow, updateProfile, uploadAvatar, avatarUrl } from '../api'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/Navbar'
import { PLAN_BADGE } from '../plans'
import TrackCard from '../components/TrackCard'

export default function Profile() {
  const { id }          = useParams()
  const { user: me, refreshUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [tracks,  setTracks]  = useState([])
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

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
            {PLAN_BADGE[profile.plan] && <span className={PLAN_BADGE[profile.plan].cls}>{PLAN_BADGE[profile.plan].text}</span>}
            {profile.is_admin          && <span className="badge-admin">ADMIN</span>}
          </div>
          <p style={{color:'var(--text3)',fontSize:13}}>@{profile.username}</p>
          {profile.bio && <p style={{color:'var(--text2)',marginTop:6,fontSize:14,whiteSpace:'pre-wrap'}}>{profile.bio}</p>}

          <div style={s.stats}>
            <Stat n={profile.track_count}    label="canciones" />
            <Stat n={profile.follower_count}  label="seguidores" />
            <Stat n={profile.following_count} label="siguiendo" />
          </div>

          {isMe && (
            <button onClick={() => setEditing(true)} style={s.editBtn}>
              ✎ Editar perfil
            </button>
          )}

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

      {editing && (
        <EditProfile
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await refreshUser(); await load() }}
        />
      )}

      {/* Tracks */}
      <div style={{padding:'0 28px 32px'}}>
        <h2 style={{fontSize:16,fontWeight:700,marginBottom:16}}>
          Canciones y videos <span style={{color:'var(--text3)',fontWeight:400}}>({tracks.length})</span>
        </h2>
        {tracks.length === 0 ? (
          <p style={{color:'var(--text3)'}}>
            {isMe ? 'Aún no has subido música ni videos.' : 'Este artista aún no ha publicado contenido.'}
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

function EditProfile({ profile, onClose, onSaved }) {
  const fileRef = useRef(null)
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio]         = useState(profile.bio || '')
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(avatarUrl(profile.avatar))
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  function pickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('Elige un archivo de imagen.'); return }
    if (f.size > 5 * 1024 * 1024)     { setError('La imagen no debe superar 5 MB.'); return }
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        await uploadAvatar(fd)
      }
      await updateProfile({ display_name: displayName.trim(), bio: bio.trim() })
      await onSaved()
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{fontSize:18,fontWeight:700,marginBottom:18}}>Editar perfil</h2>

        <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:18}}>
          {preview
            ? <img src={preview} alt="" style={s.avatarPreview} />
            : <div style={s.avatarFallback}>{(displayName || profile.username)[0].toUpperCase()}</div>}
          <div>
            <button onClick={() => fileRef.current?.click()} style={s.photoBtn}>Cambiar foto</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{display:'none'}} />
            <p style={{fontSize:11,color:'var(--text3)',marginTop:6}}>JPG o PNG, máx. 5 MB</p>
          </div>
        </div>

        <label style={s.label}>Nombre para mostrar</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
               maxLength={40} style={s.input} placeholder="Tu nombre de artista" />

        <label style={s.label}>Biografía</label>
        <textarea value={bio} onChange={e => setBio(e.target.value)}
                  maxLength={500} rows={4} style={{...s.input, resize:'vertical'}}
                  placeholder="Cuéntale a tus oyentes quién eres..." />
        <div style={{fontSize:11,color:'var(--text3)',textAlign:'right',marginTop:2}}>{bio.length}/500</div>

        {error && <p style={{color:'var(--danger)',fontSize:13,marginTop:8}}>{error}</p>}

        <div style={{display:'flex',gap:10,marginTop:20,justifyContent:'flex-end'}}>
          <button onClick={onClose} disabled={saving} style={s.cancelBtn}>Cancelar</button>
          <button onClick={save} disabled={saving} style={s.saveBtn}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
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
    gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',
    gap:'20px 16px',
  },
  editBtn: {
    marginTop:14, padding:'9px 22px', borderRadius:8, fontWeight:600, fontSize:13,
    background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer',
  },
  overlay: {
    position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:300,
    display:'flex', alignItems:'center', justifyContent:'center', padding:16,
  },
  modal: {
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14,
    padding:'24px', width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
  },
  avatarPreview: {width:72, height:72, borderRadius:'50%', objectFit:'cover'},
  avatarFallback: {
    width:72, height:72, borderRadius:'50%', background:'var(--accent)', color:'#fff',
    display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:700,
  },
  photoBtn: {
    padding:'7px 14px', borderRadius:7, fontSize:13, fontWeight:600,
    background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', cursor:'pointer',
  },
  label: {display:'block', fontSize:12, fontWeight:600, color:'var(--text3)', margin:'12px 0 6px'},
  input: {
    width:'100%', padding:'10px 12px', borderRadius:8, fontSize:14,
    background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', outline:'none',
  },
  cancelBtn: {
    padding:'9px 18px', borderRadius:8, fontSize:13, fontWeight:600,
    background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer',
  },
  saveBtn: {
    padding:'9px 22px', borderRadius:8, fontSize:13, fontWeight:700,
    background:'var(--accent)', border:'none', color:'#fff', cursor:'pointer',
  },
}
