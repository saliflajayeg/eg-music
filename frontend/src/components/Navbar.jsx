import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { avatarUrl } from '../api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <nav style={s.nav}>
      {/* Logo */}
      <Link to="/" style={s.logo}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
        <span style={s.logoText}>EG Music</span>
      </Link>

      {/* Search bar */}
      <SearchBar />

      {/* Right side */}
      <div style={s.right}>
        {user ? (
          <>
            {user.plan !== 'free' && (
              <Link to="/upload" style={s.uploadBtn}>+ Subir</Link>
            )}
            <div style={s.avatarWrap} onClick={() => setMenuOpen(m => !m)}>
              <Avatar user={user} size={34} />
              {menuOpen && (
                <div style={s.dropdown}>
                  <Link to={`/user/${user.id}`} style={s.dropItem} onClick={() => setMenuOpen(false)}>
                    Mi perfil
                  </Link>
                  {user.plan !== 'legend' && (
                    <Link to="/subscribe" style={s.dropItem} onClick={() => setMenuOpen(false)}>
                      ✦ {user.plan === 'free' ? 'Suscribirse' : 'Mejorar plan'}
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
            <Link to="/login"    style={s.loginBtn}>Iniciar sesión</Link>
            <Link to="/register" style={s.registerBtn}>Registrarse</Link>
          </>
        )}
      </div>
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
  logo: { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  logoText: { fontSize:18, fontWeight:800, color:'var(--text)' },
  searchForm: {
    flex:1, maxWidth:380,
    display:'flex', alignItems:'center', gap:8,
    background:'var(--bg3)', borderRadius:8,
    padding:'7px 12px', border:'1px solid var(--border)',
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
  loginBtn: {
    color:'var(--text2)', fontWeight:500, padding:'7px 12px',
    borderRadius:7, fontSize:13, border:'1px solid var(--border)',
    transition:'all .15s',
  },
  registerBtn: {
    background:'var(--accent)', color:'#fff', fontWeight:600,
    padding:'7px 14px', borderRadius:7, fontSize:13,
  },
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
}
