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
        <CatCard to="/explore" label="Top 50 del País" bgImg="/flag-ge.png" />
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

const HERO_SLIDES = [
  { eye:'NUEVOS SONIDOS', eyeColor:'var(--accent2)', a:'Sonido', b:'Nacional', bColor:'var(--accent)',
    body:'Descubre. Escucha. Comparte.', btn:'Explorar ahora →', btnBg:'var(--accent)', btnColor:'#fff',
    to:'/explore', glow:'rgba(236,28,43,.5)', bg:'linear-gradient(115deg,#2a0c10,#120708 62%)', big:true },
  { eye:'QUÉ ES EG MUSIC', eyeColor:'#6aa6f5', a:'Más que', b:'música', bColor:'var(--accent)',
    kinds:['🎵 Audio','🎬 Vídeo'],
    body:'La plataforma musical de Guinea Ecuatorial para cantantes y músicos. Sube tu audio y tus vídeos y comparte tu talento con todo el país.',
    btn:'Únete gratis →', btnBg:'var(--accent)', btnColor:'#fff', to:'/register',
    glow:'rgba(47,127,224,.4)', bg:'linear-gradient(120deg,#12080a,#1a1210)' },
  { eye:'PARA ARTISTAS', eyeColor:'var(--gold)', a:'Gana con', b:'tus streams', bColor:'var(--gold)',
    body:'Cada reproducción cuenta. Los artistas generan ingresos con sus canciones y vídeos en EG Music.',
    btn:'Sube tu música →', btnBg:'var(--gold)', btnColor:'#3a2b00', to:'/upload',
    glow:'rgba(242,183,5,.4)', bg:'linear-gradient(120deg,#2a1c05,#170f08 60%)' },
]

function Hero() {
  const navigate = useNavigate()
  const [i, setI] = useState(0)
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Auto-advance every 5s (paused when the tab is hidden or reduced motion).
  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI(k => (k + 1) % HERO_SLIDES.length), 5000)
    return () => clearInterval(t)
  }, [reduce])

  return (
    <div style={s.heroWrap}>
      <div style={{ ...s.heroTrack, transform:`translateX(-${i*100}%)`, transition: reduce ? 'none' : 'transform .7s cubic-bezier(.7,0,.2,1)' }}>
        {HERO_SLIDES.map((sl, k) => (
          <div key={k} style={{ ...s.heroSlide, background: sl.bg }} onClick={() => navigate(sl.to)}>
            <div style={{ ...s.heroGlow, background:`radial-gradient(circle, ${sl.glow}, transparent 70%)` }} />
            <div style={s.heroContent}>
              <div style={{ ...s.heroEyebrow, color: sl.eyeColor }}>{sl.eye}</div>
              <h2 style={{ ...s.heroTitle, fontSize: sl.big ? 'clamp(30px,8vw,46px)' : 'clamp(23px,6.4vw,36px)' }}>
                {sl.a}<br/><span style={{ color: sl.bColor }}>{sl.b}</span>
              </h2>
              {sl.kinds && <div style={s.heroKinds}>{sl.kinds.map(x => <span key={x} style={s.heroKind}>{x}</span>)}</div>}
              <div style={s.heroSub}>{sl.body}</div>
              <button style={{ ...s.heroBtn, background: sl.btnBg, color: sl.btnColor }}
                onClick={e => { e.stopPropagation(); navigate(sl.to) }}>{sl.btn}</button>
            </div>
          </div>
        ))}
      </div>
      <div style={s.dots}>
        {HERO_SLIDES.map((_, k) => (
          <span key={k} onClick={() => setI(k)} style={{ ...s.dot, ...(k===i ? s.dotOn : {}), cursor:'pointer' }} />
        ))}
      </div>
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

function CatCard({ to, icon, label, tint, bgImg }) {
  if (bgImg) {
    return (
      <Link to={to} style={{ ...s.catCard, justifyContent:'flex-end' }}>
        <img src={bgImg} alt="" style={s.catBg} />
        <div style={s.catBgOverlay} />
        <div style={{ ...s.catLabel, position:'relative', zIndex:1 }}>{label}</div>
      </Link>
    )
  }
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

  heroWrap: { position:'relative', overflow:'hidden', borderRadius:18, marginBottom:26, border:'1px solid rgba(236,28,43,.28)' },
  heroTrack: { display:'flex', alignItems:'stretch' },
  heroSlide: { minWidth:'100%', position:'relative', overflow:'hidden', cursor:'pointer', padding:'26px 22px 34px', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:196 },
  heroGlow: { position:'absolute', right:-40, top:-40, width:220, height:220, borderRadius:'50%', pointerEvents:'none' },
  heroContent: { position:'relative', zIndex:1, maxWidth:'82%' },
  heroEyebrow: { color:'var(--accent)', fontSize:11, fontWeight:800, letterSpacing:'.18em' },
  heroTitle: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:'clamp(30px,8vw,46px)', fontWeight:800, lineHeight:.92, letterSpacing:'-.02em', textTransform:'uppercase', margin:'10px 0 9px' },
  heroKinds: { display:'flex', gap:8, marginBottom:12 },
  heroKind: { fontSize:11, fontWeight:700, color:'var(--text)', background:'rgba(255,255,255,.08)', border:'1px solid var(--border)', padding:'5px 11px', borderRadius:20 },
  heroSub: { color:'var(--text2)', fontSize:13.5, lineHeight:1.5, marginBottom:15 },
  heroBtn: { alignSelf:'flex-start', fontWeight:700, fontSize:14, border:'none', borderRadius:24, padding:'11px 20px', cursor:'pointer' },
  dots: { position:'absolute', left:22, bottom:14, display:'flex', gap:6, zIndex:2 },
  dot: { width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.3)' },
  dotOn: { width:18, background:'var(--accent)' },

  secHead: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, marginTop:6 },
  secTitle: { fontFamily:'var(--font-display)', fontSize:20, fontWeight:800, letterSpacing:'-.01em' },
  verTodo: { fontSize:13, fontWeight:700, color:'var(--accent)', flexShrink:0 },

  catGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:12, marginBottom:26 },
  catCard: {
    position:'relative', overflow:'hidden',
    display:'flex', flexDirection:'column', gap:10, padding:14,
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, minHeight:96, justifyContent:'space-between',
  },
  catBg: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', filter:'blur(6px) saturate(1.15)', transform:'scale(1.25)', zIndex:0 },
  catBgOverlay: { position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(10,6,7,.15), rgba(10,6,7,.7))', zIndex:0 },
  catIcon: { width:40, height:40, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 },
  catLabel: { fontSize:13.5, fontWeight:700, color:'var(--text)', lineHeight:1.25 },

  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:'20px 16px' },

  topList: { display:'flex', flexDirection:'column', gap:8 },
  topRow: { display:'flex', alignItems:'center', gap:13, padding:'8px 12px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14 },
  rank: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:22, fontWeight:800, width:26, textAlign:'center', flexShrink:0, fontVariantNumeric:'tabular-nums' },
  topCover: { width:46, height:46, borderRadius:9, objectFit:'cover', flexShrink:0, background:'var(--bg3)' },
  topTitle: { fontWeight:700, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  topArtist: { fontSize:12, color:'var(--text3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 },
  plays: { fontSize:12, color:'var(--text3)', flexShrink:0, fontVariantNumeric:'tabular-nums', display:'flex', alignItems:'center', gap:4 },
  topPlay: { width:38, height:38, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, border:'none', cursor:'pointer', boxShadow:'0 3px 12px rgba(236,28,43,.4)' },

  followingBtn: { background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:22, padding:'9px 18px', fontSize:13, fontWeight:600, cursor:'pointer' },
  empty: { textAlign:'center', padding:'60px 0', color:'var(--text2)' },
}
