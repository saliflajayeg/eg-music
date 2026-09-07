import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getFeed, getFollowingFeed, getTopTracks, trackCoverUrl } from '../api'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { useMedia } from '../context/MediaContext'
import TrackCard from '../components/TrackCard'

export default function Home() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [tab,    setTab]    = useState('all')
  const [tracks, setTracks] = useState([])
  const [top,    setTop]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    try {
      if (tab === 'following' && user) {
        setTracks(await getFollowingFeed()); setTop([])
      } else {
        const [feed, tops] = await Promise.all([getFeed(0, 100, 'random'), getTopTracks(10)])
        setTracks(feed); setTop(tops)
      }
    } catch {}
    setLoading(false)
  }

  const onDelete = id => { setTracks(t => t.filter(x => x.id !== id)); setTop(t => t.filter(x => x.id !== id)) }

  return (
    <div style={{ padding: isMobile ? '10px 14px 20px' : '18px 28px 28px' }}>
      <CategoryTabs />

      <Hero />

      {/* Discover categories */}
      <SectionHead title="Descubre música" to="/explore" />
      <div style={s.catGrid}>
        <CatCard to="/explore" icon="🇬🇶" label="Top 50 Ecuatoguineana" tint="linear-gradient(135deg,#149954,#1c6dd0)" />
        <CatCard to="/explore" icon="🔥" label="Nuevos Lanzamientos" tint="linear-gradient(135deg,#ec1c2b,#7a0f16)" />
        <CatCard to="/explore" icon="📈" label="Tendencias" tint="linear-gradient(135deg,#ff3a46,#3a0a0e)" />
        <CatCard to={user ? '/playlists' : '/login'} icon="❤️" label="Para ti" tint="linear-gradient(135deg,#e8202a,#2a0709)" />
      </div>

      {loading ? (
        <p style={{ color:'var(--text3)', marginTop:40, textAlign:'center' }}>Cargando…</p>
      ) : tracks.length === 0 && top.length === 0 ? (
        <div style={s.empty}>
          <p style={{ fontSize:16, marginBottom:8 }}>
            {tab === 'following' ? 'Sigue a artistas para ver su música aquí.' : 'Aún no hay música. ¡Sé el primero en subir!'}
          </p>
        </div>
      ) : (
        <>
          {top.length > 0 && (
            <section style={{ marginTop:26 }}>
              <SectionHead title="🔥 Top 10 más escuchadas" to="/explore" />
              <div style={s.topList}>
                {top.map((t, i) => <TopRow key={t.id} track={t} rank={i + 1} queue={top} />)}
              </div>
            </section>
          )}

          {tracks.length > 0 && (
            <section style={{ marginTop:28 }}>
              <SectionHead title={tab === 'following' ? 'De quienes sigues' : 'Explora canciones'} />
              <div style={s.grid}>
                {tracks.map(t => <TrackCard key={t.id} track={t} queue={tracks} onDelete={onDelete} />)}
              </div>
            </section>
          )}

          {user && (
            <div style={{ textAlign:'center', marginTop:22 }}>
              <FollowingToggle tab={tab} setTab={setTab} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Category tabs (Todo / Música / Artistas / Álbumes / Playlists) ── */
function CategoryTabs() {
  const { user } = useAuth()
  const cats = [
    { label:'Todo',     icon:<IcoHome/>,   to:'/',          active:true },
    { label:'Música',   icon:<IcoNote/>,   to:'/explore' },
    { label:'Artistas', icon:<IcoUser/>,   to:'/explore' },
    { label:'Álbumes',  icon:<IcoDisc/>,   to:'/explore' },
    { label:'Playlists',icon:<IcoList/>,   to: user ? '/playlists' : '/login' },
  ]
  return (
    <div style={s.tabsRow}>
      {cats.map(c => (
        <Link key={c.label} to={c.to} style={{ ...s.tab, ...(c.active ? s.tabActive : {}) }}>
          {c.icon}<span>{c.label}</span>
        </Link>
      ))}
    </div>
  )
}

function Hero() {
  const navigate = useNavigate()
  return (
    <div style={s.hero} onClick={() => navigate('/explore')}>
      <div style={s.heroGlow} />
      <div style={s.heroContent}>
        <div style={s.heroEyebrow}>NUEVOS SONIDOS</div>
        <h2 style={s.heroTitle}>MÚSICA<br/><span style={{ color:'var(--accent)' }}>SIN LÍMITES</span></h2>
        <div style={s.heroSub}>Descubre. Escucha. Comparte.</div>
        <button style={s.heroBtn} onClick={e => { e.stopPropagation(); navigate('/explore') }}>
          Explorar ahora →
        </button>
      </div>
      <div style={s.heroScript}>Good&nbsp;Music<br/>Better&nbsp;People</div>
      <div style={s.dots}>{[0,1,2,3].map(i => <span key={i} style={{ ...s.dot, ...(i===0 ? s.dotOn : {}) }} />)}</div>
    </div>
  )
}

function SectionHead({ title, to }) {
  return (
    <div style={s.secHead}>
      <h2 style={s.secTitle}>{title}</h2>
      {to && <Link to={to} style={s.verTodo}>Ver todo ›</Link>}
    </div>
  )
}

function CatCard({ to, icon, label, tint }) {
  return (
    <Link to={to} style={s.catCard}>
      <div style={{ ...s.catIcon, background:tint }}>{icon}</div>
      <div style={s.catLabel}>{label}</div>
    </Link>
  )
}

function TopRow({ track, rank, queue }) {
  const { play, current, isPlaying } = useMedia()
  const isCurrent = current?.id === track.id
  const artist = track.artists?.length
    ? track.artists.map(a => a.display_name || a.username).join(', ')
    : (track.artist || track.display_name || track.username)
  return (
    <div style={s.topRow}>
      <span style={{ ...s.rank, color: rank <= 3 ? 'var(--accent)' : 'var(--text3)' }}>{rank}</span>
      <img src={trackCoverUrl(track.id)} alt="" style={s.topCover} onError={e => { e.target.style.visibility='hidden' }} />
      <div style={{ minWidth:0, flex:1 }}>
        <div style={s.topTitle}>{track.title}</div>
        <div style={s.topArtist}>{artist}</div>
      </div>
      <span style={s.plays}>{track.play_count} <IcoBars/></span>
      <button style={s.topPlay} onClick={() => play(track, queue)} aria-label="Reproducir">
        {isCurrent && isPlaying ? <IcoPause/> : <IcoPlay/>}
      </button>
    </div>
  )
}

function FollowingToggle({ tab, setTab }) {
  return (
    <button onClick={() => setTab(tab === 'following' ? 'all' : 'following')} style={s.followingBtn}>
      {tab === 'following' ? '← Ver todo' : 'Ver solo de quienes sigues'}
    </button>
  )
}

/* icons */
const IcoHome = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>
const IcoNote = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>
const IcoUser = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
const IcoDisc = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
const IcoList = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
const IcoPlay = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
const IcoPause = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
const IcoBars = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{verticalAlign:'-1px'}}><rect x="3" y="10" width="3" height="11" rx="1"/><rect x="9" y="6" width="3" height="15" rx="1"/><rect x="15" y="13" width="3" height="8" rx="1"/><rect x="20" y="3" width="3" height="18" rx="1" opacity=".5"/></svg>

const s = {
  tabsRow: { display:'flex', gap:8, overflowX:'auto', paddingBottom:6, marginBottom:14, scrollbarWidth:'none' },
  tab: {
    display:'flex', alignItems:'center', gap:7, flexShrink:0,
    padding:'8px 15px', borderRadius:22, fontSize:13, fontWeight:600,
    background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)',
  },
  tabActive: { background:'var(--accent)', color:'#fff', border:'1px solid var(--accent)' },

  hero: {
    position:'relative', overflow:'hidden', cursor:'pointer',
    borderRadius:18, padding:'26px 22px', marginBottom:26, minHeight:170,
    background:'radial-gradient(120% 140% at 85% 20%, rgba(236,28,43,.55), transparent 55%), linear-gradient(120deg,#1a0a0d 0%,#0d0608 60%)',
    border:'1px solid rgba(236,28,43,.35)',
  },
  heroGlow: { position:'absolute', right:-40, top:-40, width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle, rgba(236,28,43,.35), transparent 70%)', pointerEvents:'none' },
  heroContent: { position:'relative', zIndex:1, maxWidth:'70%' },
  heroEyebrow: { color:'var(--accent)', fontSize:11, fontWeight:800, letterSpacing:'.18em' },
  heroTitle: { fontSize:'clamp(26px,7vw,40px)', fontWeight:900, lineHeight:1.02, letterSpacing:'-.01em', margin:'8px 0 6px' },
  heroSub: { color:'var(--text2)', fontSize:14, marginBottom:16 },
  heroBtn: { background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:14, border:'none', borderRadius:24, padding:'11px 20px', cursor:'pointer' },
  heroScript: { position:'absolute', right:18, top:20, textAlign:'right', fontFamily:'Georgia, serif', fontStyle:'italic', fontSize:15, color:'#fff', opacity:.9, lineHeight:1.3, zIndex:1 },
  dots: { position:'absolute', left:22, bottom:14, display:'flex', gap:6, zIndex:1 },
  dot: { width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.3)' },
  dotOn: { width:18, background:'var(--accent)' },

  secHead: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, marginTop:6 },
  secTitle: { fontSize:19, fontWeight:800, letterSpacing:'-.01em' },
  verTodo: { fontSize:13, fontWeight:700, color:'var(--accent)', flexShrink:0 },

  catGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:12, marginBottom:26 },
  catCard: {
    display:'flex', flexDirection:'column', gap:10, padding:14,
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, minHeight:96, justifyContent:'space-between',
  },
  catIcon: { width:40, height:40, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 },
  catLabel: { fontSize:13.5, fontWeight:700, color:'var(--text)', lineHeight:1.25 },

  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:'20px 16px' },

  topList: { display:'flex', flexDirection:'column', gap:8 },
  topRow: { display:'flex', alignItems:'center', gap:13, padding:'8px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14 },
  rank: { fontSize:19, fontWeight:900, width:24, textAlign:'center', flexShrink:0, fontVariantNumeric:'tabular-nums' },
  topCover: { width:46, height:46, borderRadius:9, objectFit:'cover', flexShrink:0, background:'var(--bg3)' },
  topTitle: { fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  topArtist: { fontSize:12, color:'var(--text3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 },
  plays: { fontSize:12, color:'var(--text3)', flexShrink:0, fontVariantNumeric:'tabular-nums', display:'flex', alignItems:'center', gap:4 },
  topPlay: { width:38, height:38, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'none', cursor:'pointer', boxShadow:'0 3px 12px rgba(236,28,43,.4)' },

  followingBtn: { background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:22, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  empty: { textAlign:'center', padding:'60px 0', color:'var(--text2)' },
}
