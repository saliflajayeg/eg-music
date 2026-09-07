import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'

// Phone bottom tab bar: Inicio · Explorar · Biblioteca · Perfil. Sits below the
// player bar. Hidden on desktop and while the full player page (/watch) is open.
export default function BottomNav() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  if (!isMobile) return null
  if (pathname.startsWith('/watch/')) return null   // full player covers the screen

  const items = [
    { to:'/',        label:'Inicio',     icon:IcoHome, exact:true },
    { to:'/explore', label:'Explorar',   icon:IcoCompass },
    { to: user ? '/playlists' : '/login', label:'Biblioteca', icon:IcoLibrary },
    { to: user ? `/user/${user.id}` : '/login', label:'Perfil', icon:IcoUser },
  ]

  return (
    <nav style={s.bar}>
      {items.map(it => {
        const Icon = it.icon
        const active = it.exact ? pathname === it.to : pathname.startsWith(it.to) && it.to !== '/'
        return (
          <NavLink key={it.label} to={it.to} style={{ ...s.item, color: active ? 'var(--accent)' : 'var(--text3)' }}>
            <Icon active={active} />
            <span style={s.label}>{it.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

const IcoHome = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>
  </svg>
)
const IcoCompass = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>
  </svg>
)
const IcoLibrary = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 4v16M9 4v16M14 5l4 15"/>
  </svg>
)
const IcoUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
  </svg>
)

const s = {
  bar: {
    position:'fixed', left:0, right:0, bottom:0, height:'var(--bottomnav-h)', zIndex:140,
    background:'var(--bg2)', borderTop:'1px solid var(--border)',
    display:'flex', alignItems:'stretch',
    paddingBottom:'env(safe-area-inset-bottom, 0px)',
  },
  item: {
    flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
    fontSize:10.5, fontWeight:600,
  },
  label: { lineHeight:1 },
}
