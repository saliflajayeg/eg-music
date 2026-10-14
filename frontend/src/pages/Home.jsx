import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [fresh,  setFresh]  = useState([])   // newest uploads, for the carousel
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    try {
      const [feed, tops, recent] = await Promise.all([
        tab === 'following' && user ? getFollowingFeed() : getFeed(0, 100, 'random'),
        getTopTracks(10),
        getFeed(0, 10, 'recent'),
      ])
      setTracks(feed); setTop(tops); setFresh(recent)
    } catch {}
    setLoading(false)
  }

  const onDelete = id => { setTracks(t => t.filter(x => x.id !== id)); setTop(t => t.filter(x => x.id !== id)) }

  return (
    <div style={{ padding: isMobile ? '10px 14px 20px' : '18px 28px 28px' }}>
      <CategoryTabs />

      <HeroCarousel top={top} fresh={fresh} loading={loading} />

      {/* Discover categories */}
      <SectionHead title="Descubre música" to="/explore" />
      <div style={s.catGrid}>
        <CatCard to="/explore" label="Top 50 del País" chip="Nacional"
          img="/city/libertad.jpg" pos="center 32%" alt="Torre de la Libertad, Bata" delay={0} />
        <CatCard to="/explore" label="Nuevos Lanzamientos" chip="Nuevo"
          img="/city/malabo.jpg" pos="center" alt="Malabo II, capital de Guinea Ecuatorial" delay={60} />
        <CatCard to="/explore" label="Tendencias" chip="En tendencia"
          img="/city/gepetrol.jpg" pos="center 38%" alt="Torre GEPetrol, Malabo" delay={120} />
        <CatCard to={user ? '/playlists' : '/login'} label="Para ti" chip="Para ti"
          img="/city/bata.jpg" pos="center" alt="Ciudad de Bata junto al mar" delay={180} />
      </div>

      {loading ? (
        <SkeletonGrid />
      ) : tracks.length === 0 && top.length === 0 ? (
        <div style={s.empty}>
          <p style={{ fontSize:16, marginBottom:8 }}>
            {tab === 'following' ? 'Sigue a artistas para ver su música aquí.' : 'Aún no hay música. ¡Sé el primero en subir!'}
          </p>
        </div>
      ) : (
        <>
          {tab !== 'following' && top.length > 0 && (
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
        <Link key={c.label} to={c.to} className="eg-press" style={{ ...s.tab, ...(c.active ? s.tabActive : {}) }}>
          {c.icon}<span>{c.label}</span>
        </Link>
      ))}
    </div>
  )
}

// A cinematic, auto-advancing carousel of spotlights: the country's Top 3, the
// newest release, and the December beatmakers event (with 240 Beats).
function HeroCarousel({ top, fresh, loading }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const top3 = top.slice(0, 3)
  const top3ids = new Set(top3.map(t => t.id))
  const newRelease = fresh.find(t => t.cover && !top3ids.has(t.id)) || fresh.find(t => !top3ids.has(t.id))
  const slides = [
    ...top3.map((t, i) => ({ key: 'top' + t.id, el: <TrackSlide track={t} rank={i + 1} queue={top} /> })),
    ...(newRelease ? [{ key: 'new' + newRelease.id, el: <TrackSlide track={newRelease} kind="new" queue={fresh} /> }] : []),
    { key: 'event', el: <EventSlide /> },
  ]

  const [i, setI] = useState(0)
  useEffect(() => { setI(v => (v < slides.length ? v : 0)) }, [slides.length])
  useEffect(() => {
    if (reduce || slides.length <= 1) return
    const t = setInterval(() => setI(k => (k + 1) % slides.length), 6500)
    return () => clearInterval(t)
  }, [slides.length, reduce])

  if (loading && top.length === 0 && fresh.length === 0) return <div className="eg-shimmer" style={s.carWrap} aria-hidden="true" />

  return (
    <div style={s.carWrap} aria-roledescription="carrusel" aria-label="Destacados">
      <div style={{ ...s.carTrack, transform: `translateX(-${i * 100}%)`, transition: reduce ? 'none' : 'transform .6s cubic-bezier(.4,0,.2,1)' }}>
        {slides.map(sl => <div key={sl.key} style={s.carSlide}>{sl.el}</div>)}
      </div>
      {slides.length > 1 && (
        <div style={s.carDots}>
          {slides.map((_, k) => (
            <button key={k} onClick={() => setI(k)} className="eg-dot-t"
              style={{ ...s.carDot, ...(k === i ? s.carDotOn : {}) }} aria-label={`Ir al destacado ${k + 1}`} />
          ))}
        </div>
      )}
    </div>
  )
}

// One spotlight slide for a track — plays it on click.
function TrackSlide({ track, rank, kind, queue }) {
  const { play, current, isPlaying } = useMedia()
  const isMobile = useIsMobile()
  const [imgErr, setImgErr] = useState(false)
  useEffect(() => { setImgErr(false) }, [track.id])

  const isCur = current?.id === track.id
  const playing = isCur && isPlaying
  const isVideo = track.media_type === 'video'
  const artist = track.artists?.length
    ? track.artists.map(a => a.display_name || a.username).join(', ')
    : (track.artist || track.display_name || track.username)
  const cover = trackCoverUrl(track.id)
  const hasCover = !!track.cover && !imgErr
  const eyebrow = kind === 'new' ? 'Nuevo lanzamiento' : `Nº ${rank} del país`

  return (
    <>
      {hasCover && <img src={cover} alt="" aria-hidden="true" style={s.featBg} />}
      <div style={s.featScrim} />
      <div style={s.featInner}>
        <div style={s.featText}>
          <span style={s.featEyebrow}><span style={s.featEyeDot} />{eyebrow}</span>
          <h2 style={s.featTitle}>{track.title}</h2>
          <div style={s.featArtist}>{artist}</div>
          <div style={s.featActions}>
            <button className="eg-press" style={s.featPlay} onClick={() => play(track, queue)}>
              {playing ? <IcoPause /> : <IcoPlay />}
              <span>{playing ? 'Reproduciendo' : isVideo ? 'Ver ahora' : 'Reproducir'}</span>
            </button>
            <Link to="/explore" className="eg-press" style={s.featGhost}>Explorar</Link>
          </div>
        </div>
        {!isMobile && (
          <div style={s.featCoverWrap}>
            {hasCover
              ? <img src={cover} alt={`Portada de ${track.title}`} style={s.featCover} onError={() => setImgErr(true)} />
              : <div style={s.featCoverPh}>{isVideo ? <IcoVideoBig /> : <IcoNoteBig />}</div>}
          </div>
        )}
      </div>
    </>
  )
}

// The beatmakers-event slide — registration lives on 240 Beats.
const EVENT_URL = 'https://240beats.com'

function EventSlide() {
  const isMobile = useIsMobile()
  return (
    <>
      <div style={s.evScrim} />
      <div style={s.featInner}>
        <div style={s.featText}>
          <span style={s.evBadge}>240 Beats · Evento</span>
          <h2 style={s.featTitle}>Evento de beatmakers del país</h2>
          <div style={s.evSub}>Productores y cantantes de Guinea Ecuatorial: compite en el primer encuentro nacional de beatmakers, con 240 Beats.</div>
          <div style={s.featActions}>
            <a href={EVENT_URL} target="_blank" rel="noopener noreferrer" className="eg-press" style={s.featPlay}>
              <IcoSpark /><span>Regístrate en 240 Beats</span>
            </a>
            <span style={s.evWhen}>Diciembre 2026</span>
          </div>
        </div>
        {!isMobile && (
          <div style={s.evArt} aria-hidden="true">
            <span style={s.evArtNum}>240</span>
            <span style={s.evArtWord}>Beats</span>
          </div>
        )}
      </div>
    </>
  )
}

// Skeleton shown while the feed loads — matches the card grid shape.
function SkeletonGrid({ n = 8 }) {
  return (
    <section style={{ marginTop:28 }}>
      <div className="eg-shimmer" style={{ width:170, height:22, borderRadius:7, marginBottom:16 }} />
      <div style={s.grid}>
        {Array.from({ length:n }).map((_, i) => (
          <div key={i}>
            <div className="eg-shimmer" style={{ aspectRatio:'16 / 9', borderRadius:12 }} />
            <div className="eg-shimmer" style={{ height:13, width:'82%', borderRadius:5, marginTop:11 }} />
            <div className="eg-shimmer" style={{ height:11, width:'55%', borderRadius:5, marginTop:8 }} />
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionHead({ title, to }) {
  return (
    <div style={s.secHead}>
      <h2 style={s.secTitle}>{title}</h2>
      {to && <Link to={to} className="eg-press eg-link" style={s.verTodo}>Ver todo ›</Link>}
    </div>
  )
}

function CatCard({ to, label, chip, img, pos = 'center', alt = '', delay = 0 }) {
  return (
    <Link to={to} className="eg-card eg-rise eg-thumb" style={{ ...s.catCard, animationDelay: `${delay}ms` }}>
      <img src={img} alt={alt} style={{ ...s.catBg, objectPosition: pos }} />
      <div style={s.catScrim} />
      {chip && <span style={s.catChip}><span style={s.catDot} />{chip}</span>}
      <div style={s.catLabelWrap}>
        <div style={s.catTitle}>{label}</div>
        <div style={s.catUnderline} />
      </div>
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
    <div className="eg-row eg-rise" style={{ ...s.topRow, animationDelay: `${Math.min(rank - 1, 10) * 40}ms` }}>
      <span style={{ ...s.rank, color: rank <= 3 ? 'var(--accent)' : 'var(--text3)' }}>{rank}</span>
      <img src={trackCoverUrl(track.id)} alt="" style={s.topCover} onError={e => { e.target.style.visibility='hidden' }} />
      <div style={{ minWidth:0, flex:1 }}>
        <div style={s.topTitle}>{track.title}</div>
        <div style={s.topArtist}>{artist}</div>
      </div>
      <span style={s.plays}>{track.play_count} <IcoBars/></span>
      <button className="eg-press" style={s.topPlay} onClick={() => play(track, queue)} aria-label="Reproducir">
        {isCurrent && isPlaying ? <IcoPause/> : <IcoPlay/>}
      </button>
    </div>
  )
}

function FollowingToggle({ tab, setTab }) {
  return (
    <button onClick={() => setTab(tab === 'following' ? 'all' : 'following')} className="eg-press" style={s.followingBtn}>
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
const IcoNoteBig = () => <svg width="44" height="44" viewBox="0 0 24 24" fill="var(--text3)"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
const IcoVideoBig = () => <svg width="46" height="46" viewBox="0 0 24 24" fill="var(--text3)"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>
const IcoSpark = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7z"/></svg>

const s = {
  tabsRow: { display:'flex', gap:8, overflowX:'auto', paddingBottom:6, marginBottom:14, scrollbarWidth:'none' },
  tab: {
    display:'flex', alignItems:'center', gap:7, flexShrink:0,
    padding:'8px 15px', borderRadius:22, fontSize:13, fontWeight:600,
    background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)',
  },
  tabActive: { background:'var(--accent)', color:'#fff', border:'1px solid var(--accent)' },

  carWrap: { position:'relative', overflow:'hidden', borderRadius:20, marginBottom:26,
    background:'linear-gradient(120deg, #241012 0%, #150c0c 58%, #0e0809 100%)',
    minHeight:'clamp(188px, 32vw, 280px)' },
  carTrack: { display:'flex', minHeight:'inherit' },
  carSlide: { minWidth:'100%', position:'relative', minHeight:'clamp(188px, 32vw, 280px)', overflow:'hidden' },
  carDots: { position:'absolute', left:'50%', transform:'translateX(-50%)', bottom:12, zIndex:3, display:'flex', gap:6,
    background:'rgba(0,0,0,.34)', padding:'6px 10px', borderRadius:14, backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)' },
  carDot: { width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.34)', border:'none', padding:0, cursor:'pointer' },
  carDotOn: { width:18, background:'var(--accent)' },
  featBg: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover',
    filter:'blur(34px) saturate(1.35) brightness(.95)', transform:'scale(1.18)', opacity:.42 },
  featScrim: { position:'absolute', inset:0, background:
    'linear-gradient(90deg, rgba(10,6,7,.92) 0%, rgba(10,6,7,.62) 50%, rgba(10,6,7,.28) 100%),'
    + 'radial-gradient(640px 440px at 82% 58%, rgba(236,28,43,.34), transparent 72%),'
    + 'radial-gradient(420px 300px at 16% 128%, rgba(236,28,43,.16), transparent 70%)' },
  featInner: { position:'relative', zIndex:1, minHeight:'inherit', display:'flex', alignItems:'center',
    justifyContent:'space-between', gap:'clamp(16px, 4vw, 40px)', padding:'clamp(18px, 4vw, 36px)' },
  featText: { display:'flex', flexDirection:'column', minWidth:0, maxWidth:560 },
  featEyebrow: { display:'inline-flex', alignItems:'center', gap:7, fontSize:11.5, fontWeight:700,
    letterSpacing:'.14em', textTransform:'uppercase', color:'var(--accent2)' },
  featEyeDot: { width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 8px rgba(236,28,43,.9)' },
  featTitle: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:'clamp(26px, 5.4vw, 44px)',
    lineHeight:1.02, letterSpacing:'-.02em', color:'#fff', margin:'10px 0 0',
    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
  featArtist: { fontSize:'clamp(13px, 2.4vw, 16px)', fontWeight:600, color:'var(--text2)', marginTop:8,
    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  featActions: { display:'flex', alignItems:'center', gap:10, marginTop:'clamp(14px, 2.4vw, 22px)', flexWrap:'wrap' },
  featPlay: { display:'inline-flex', alignItems:'center', gap:8, background:'var(--accent)', color:'#fff',
    fontWeight:700, fontSize:14.5, padding:'11px 22px', borderRadius:999, border:'none', cursor:'pointer',
    boxShadow:'0 12px 28px -8px rgba(236,28,43,.75)' },
  featGhost: { display:'inline-flex', alignItems:'center', color:'#fff', fontWeight:600, fontSize:13.5,
    padding:'11px 18px', borderRadius:999, background:'rgba(255,255,255,.08)',
    border:'1px solid rgba(255,255,255,.18)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' },
  featCoverWrap: { width:'clamp(150px, 17vw, 196px)', aspectRatio:'1 / 1', flexShrink:0, borderRadius:16,
    overflow:'hidden', border:'1px solid rgba(255,255,255,.14)',
    boxShadow:'0 24px 54px -18px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.05) inset' },
  featCover: { width:'100%', height:'100%', objectFit:'cover', display:'block', background:'var(--bg3)' },
  featCoverPh: { width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg3)' },

  // Event slide
  evScrim: { position:'absolute', inset:0, background:
    'linear-gradient(90deg, rgba(10,6,7,.92) 0%, rgba(10,6,7,.6) 52%, rgba(10,6,7,.35) 100%),'
    + 'radial-gradient(700px 480px at 80% 60%, rgba(236,28,43,.4), transparent 72%),'
    + 'radial-gradient(420px 320px at 12% 130%, rgba(242,183,5,.14), transparent 72%)' },
  evBadge: { display:'inline-flex', alignItems:'center', alignSelf:'flex-start', gap:6, fontSize:11, fontWeight:800,
    letterSpacing:'.1em', textTransform:'uppercase', color:'#fff', background:'rgba(236,28,43,.22)',
    border:'1px solid rgba(236,28,43,.5)', padding:'5px 11px', borderRadius:20 },
  evWhen: { fontSize:13, fontWeight:700, color:'var(--text2)', letterSpacing:'.02em' },
  evSub: { fontSize:'clamp(13px, 2.4vw, 15px)', fontWeight:500, color:'var(--text2)', marginTop:8, maxWidth:430,
    lineHeight:1.42, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' },
  evArt: { width:'clamp(150px, 17vw, 196px)', aspectRatio:'1 / 1', flexShrink:0, borderRadius:16,
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    background:'linear-gradient(140deg, #ec1c2b 0%, #7a0f16 70%, #2a0709 100%)',
    border:'1px solid rgba(255,255,255,.14)', boxShadow:'0 24px 54px -18px rgba(236,28,43,.6)' },
  evArtNum: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:'clamp(44px, 6vw, 60px)', lineHeight:1, color:'#fff', letterSpacing:'-.02em' },
  evArtWord: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:'clamp(15px, 2vw, 19px)', letterSpacing:'.42em', color:'#fff', marginTop:4, paddingLeft:'.42em' },

  secHead: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, marginTop:6 },
  secTitle: { fontFamily:'var(--font-display)', fontSize:20, fontWeight:800, letterSpacing:'-.01em' },
  verTodo: { fontSize:13, fontWeight:700, color:'var(--accent)', flexShrink:0 },

  catGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:14, marginBottom:28 },
  catCard: {
    position:'relative', overflow:'hidden', display:'block',
    height:150, borderRadius:16, background:'#17100f', border:'1px solid rgba(255,255,255,.06)',
  },
  catBg: { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', display:'block' },
  catScrim: { position:'absolute', inset:0, background:'linear-gradient(to top, rgba(8,5,6,.94) 0%, rgba(8,5,6,.55) 42%, rgba(8,5,6,.06) 100%)' },
  catChip: {
    position:'absolute', top:10, left:10, zIndex:2, display:'flex', alignItems:'center', gap:5,
    background:'rgba(0,0,0,.42)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)',
    color:'#fff', fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase',
    padding:'4px 9px', borderRadius:20, border:'1px solid rgba(255,255,255,.14)',
  },
  catDot: { width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 8px rgba(236,28,43,.9)' },
  catLabelWrap: { position:'absolute', left:14, right:14, bottom:12, zIndex:2 },
  catTitle: { fontFamily:'"Archivo Black", var(--font-display)', fontSize:18, lineHeight:1.08, letterSpacing:'-.01em', color:'#fff', textShadow:'0 2px 10px rgba(0,0,0,.6)' },
  catUnderline: { width:26, height:3, borderRadius:3, background:'var(--accent)', marginTop:8 },

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
