import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { isNative } from '../offline'
import { avatarUrl, pendingCollabs, getNotifications, markNotificationsRead, apkUrl } from '../api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collabCount, setCollabCount] = useState(0)
  const isMobile = useIsMobile()

  // Badge for pending collaboration invitations.
  useEffect(() => {
    if (!user) { setCollabCount(0); return }
    pendingCollabs().then(l => setCollabCount(l.length)).catch(() => {})
  }, [user?.id])

  function handleLogout() {
    logout()
    setMenuOpen(false)
    navigate('/')
  }

  const logo = (
    <div style={{display:'flex', alignItems:'center', gap:isMobile ? 10 : 16, flexShrink:0}}>
      <Link to="/" style={s.logo}>
        <img src="/logo.png" alt="EG Music"
          style={{...s.logoImg, height: isMobile ? 24 : 28}} />
      </Link>
      <Link to="/explore" style={s.exploreLink}>Explorar</Link>
    </div>
  )

  const right = (
    <div style={s.right}>
      {!isNative() && (
        <a href={apkUrl()} download style={s.appBtn} title="Descargar la app de Android">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>
          </svg>
          {!isMobile && <span>Descargar app</span>}
        </a>
      )}
      {user ? (
        <>
          {user.can_upload && (
            <Link to="/upload" style={s.uploadBtn}>+ Subir</Link>
          )}
          <NotifBell />
          <div style={s.avatarWrap} onClick={() => setMenuOpen(m => !m)}>
            <Avatar user={user} size={34} />
            {menuOpen && (
              <div style={s.dropdown}>
                <Link to={`/user/${user.id}`} style={s.dropItem} onClick={() => setMenuOpen(false)}>
                  Mi perfil
                </Link>
                <Link to="/playlists" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                  🎵 Mis listas
                </Link>
                {isNative() && (
                  <Link to="/downloads" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                    📥 Mis descargas
                  </Link>
                )}
                <Link to="/colaboraciones" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                  🤝 Colaboraciones
                  {collabCount > 0 && <span style={s.badge}>{collabCount}</span>}
                </Link>
                <Link to="/password" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                  Mi cuenta
                </Link>
                {user.plan !== 'premium' && (
                  <Link to="/subscribe" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                    ✦ {user.plan === 'free' ? 'Ver planes' : 'Mejorar plan'}
                  </Link>
                )}
                {user.is_admin && (
                  <Link to="/admin" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                    ⚙ Panel admin
                  </Link>
                )}
                <div style={s.dropDivider} />
                <button style={s.dropItem} onClick={handleLogout}>Cerrar sesión</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Link to="/login"    style={s.loginBtn}>{isMobile ? 'Entrar' : 'Iniciar sesión'}</Link>
          <Link to="/register" style={s.registerBtn}>Registrarse</Link>
        </>
      )}
    </div>
  )

  // Phone: two rows — [logo | actions] on top, full-width search below.
  if (isMobile) {
    return (
      <nav style={s.navMobile}>
        <div style={s.navTopRow}>
          {logo}
          {right}
        </div>
        <SearchBar />
      </nav>
    )
  }

  // Desktop: single row.
  return (
    <nav style={s.nav}>
      {logo}
      <SearchBar />
      {right}
    </nav>
  )
}

function SearchBar() {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  function submit(e) {
    e.preventDefault()
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  return (
    <form onSubmit={submit} style={s.searchForm}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text3)" style={{flexShrink:0}}>
        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
      <input
        style={s.searchInput}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar música, artistas..."
      />
    </form>
  )
}

function NotifBell() {
  const [open, setOpen]     = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems]   = useState([])
  const navigate = useNavigate()

  async function refresh() {
    try { const r = await getNotifications(); setItems(r.items || []); setUnread(r.unread || 0) } catch {}
  }
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 45000)
    return () => clearInterval(t)
  }, [])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      await refresh()
      if (unread > 0) { try { await markNotificationsRead() } catch {} ; setUnread(0) }
    }
  }

  function openNotif(n) {
    setOpen(false)
    if (n.track_id) navigate(n.track_media_type === 'video' ? `/watch/${n.track_id}` : `/track/${n.track_id}`)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={toggle} style={s.bellBtn} title="Notificaciones" aria-label="Notificaciones">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span style={s.bellBadge}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={s.notifPanel}>
          <div style={s.notifTitle}>Notificaciones</div>
          {items.length === 0 ? (
            <div style={s.notifEmpty}>Nada por aquí todavía.</div>
          ) : items.map(n => (
            <button key={n.id} onClick={() => openNotif(n)}
              style={{ ...s.notifItem, background: n.is_read ? 'transparent' : 'rgba(var(--accent-rgb),.10)' }}>
              <Avatar user={{ avatar: n.actor_avatar, display_name: n.actor_display_name, username: n.actor_username }} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={s.notifText}>{notifText(n)}</div>
                <div style={s.notifTime}>{notifTimeAgo(n.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function notifText(n) {
  const who = n.actor_display_name || n.actor_username
  const title = n.track_title ? `"${n.track_title}"` : 'tu contenido'
  switch (n.type) {
    case 'comment':      return `${who} comentó en ${title}`
    case 'reply':        return `${who} respondió a tu comentario`
    case 'like_track':   return `A ${who} le gustó ${title}`
    case 'like_comment': return `A ${who} le gustó tu comentario`
    default:             return `${who} interactuó con ${title}`
  }
}

function notifTimeAgo(iso) {
  if (!iso) return ''
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'ahora'
  const m = s / 60; if (m < 60) return `hace ${Math.floor(m)} min`
  const h = m / 60; if (h < 24) return `hace ${Math.floor(h)} h`
  return `hace ${Math.floor(h / 24)} d`
}

export function Avatar({ user, size = 36 }) {
  const url = avatarUrl(user?.avatar)
  if (url) {
    return <img src={url} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', cursor:'pointer' }} alt="" />
  }
  const initials = (user?.display_name || user?.username || '?')[0].toUpperCase()
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', background:'var(--accent)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize: size * 0.4, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0,
    }}>
      {initials}
    </div>
  )
}

const s = {
  nav: {
    display:'flex', alignItems:'center', gap:12,
    padding:'0 20px', height:58,
    background:'var(--bg2)', borderBottom:'1px solid var(--border)',
    position:'sticky', top:0, zIndex:100,
  },
  navMobile: {
    display:'flex', flexDirection:'column', gap:8,
    padding:'8px 12px',
    background:'var(--bg2)', borderBottom:'1px solid var(--border)',
    position:'sticky', top:0, zIndex:100,
  },
  navTopRow: {
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
  },
  logo: { display:'flex', alignItems:'center', flexShrink:0 },
  logoImg: { width:'auto', display:'block' },
  exploreLink: {
    color:'var(--text2)', fontWeight:600, fontSize:13,
    padding:'6px 10px', borderRadius:7, transition:'all .15s', whiteSpace:'nowrap',
  },
  searchForm: {
    flex:1, maxWidth:380,
    display:'flex', alignItems:'center', gap:8,
    background:'var(--bg3)', borderRadius:8,
    padding:'7px 12px', border:'1px solid var(--border)',
    minWidth:0,
  },
  searchInput: {
    flex:1, background:'transparent', border:'none', outline:'none',
    color:'var(--text)', fontSize:14,
  },
  right: { display:'flex', alignItems:'center', gap:10, marginLeft:'auto', flexShrink:0 },
  uploadBtn: {
    background:'var(--accent)', color:'#fff', fontWeight:700,
    borderRadius:7, padding:'7px 14px', fontSize:13,
  },
  appBtn: {
    display:'flex', alignItems:'center', gap:6, flexShrink:0,
    color:'var(--accent2)', fontWeight:600, fontSize:13,
    border:'1px solid var(--border)', borderRadius:7, padding:'6px 12px',
    background:'var(--bg3)', whiteSpace:'nowrap',
  },
  loginBtn: {
    color:'var(--text2)', fontWeight:500, padding:'7px 12px',
    borderRadius:7, fontSize:13, border:'1px solid var(--border)',
    transition:'all .15s',
  },
  registerBtn: {
    background:'var(--accent)', color:'#fff', fontWeight:600,
    padding:'7px 14px', borderRadius:7, fontSize:13,
  },
  bellBtn: { position:'relative', display:'flex', alignItems:'center', justifyContent:'center', padding:6, cursor:'pointer', background:'none', border:'none' },
  bellBadge: {
    position:'absolute', top:-1, right:-1, background:'var(--danger)', color:'#fff',
    borderRadius:20, minWidth:16, height:16, padding:'0 4px', fontSize:10, fontWeight:700,
    display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
  },
  notifPanel: {
    position:'absolute', top:'calc(100% + 8px)', right:0,
    background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10,
    padding:6, width:320, maxWidth:'90vw', maxHeight:420, overflowY:'auto', zIndex:200,
    boxShadow:'0 8px 24px rgba(0,0,0,.5)',
  },
  notifTitle: { fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:.5, padding:'6px 10px 8px' },
  notifEmpty: { color:'var(--text3)', fontSize:13, padding:'14px 10px', textAlign:'center' },
  notifItem: { display:'flex', gap:10, alignItems:'center', width:'100%', textAlign:'left', padding:'9px 10px', borderRadius:8, border:'none', cursor:'pointer' },
  notifText: { fontSize:13, color:'var(--text)', lineHeight:1.35, whiteSpace:'normal', overflow:'hidden' },
  notifTime: { fontSize:11, color:'var(--text3)', marginTop:2 },
  avatarWrap: { position:'relative', cursor:'pointer' },
  dropdown: {
    position:'absolute', top:'calc(100% + 8px)', right:0,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:10, padding:'6px', minWidth:180, zIndex:200,
    boxShadow:'0 8px 24px rgba(0,0,0,.5)',
  },
  dropItem: {
    display:'block', padding:'9px 12px', borderRadius:7,
    color:'var(--text)', fontSize:13, width:'100%', textAlign:'left',
    transition:'background .1s',
  },
  dropDivider: { height:1, background:'var(--border)', margin:'4px 0' },
  badge: {
    background:'var(--danger)', color:'#fff', borderRadius:20,
    padding:'1px 6px', fontSize:10, marginLeft:6, fontWeight:700,
  },
}
