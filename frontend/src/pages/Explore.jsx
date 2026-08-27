import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFeed, getArtists, getGenres } from '../api'
import { useIsMobile } from '../hooks'
import { Avatar } from '../components/Navbar'
import { PLAN_BADGE } from '../plans'
import TrackCard from '../components/TrackCard'

export default function Explore() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('tracks')

  return (
    <div style={{padding: isMobile ? '16px 14px' : '24px 28px'}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:16}}>Explorar</h1>
      <div style={s.tabs}>
        <TabBtn label="Canciones" val="tracks"  current={tab} set={setTab} />
        <TabBtn label="Artistas"  val="artists" current={tab} set={setTab} />
        <TabBtn label="Géneros"   val="genres"  current={tab} set={setTab} />
      </div>

      {tab === 'tracks'  && <TracksTab />}
      {tab === 'artists' && <ArtistsTab />}
      {tab === 'genres'  && <GenresTab />}
    </div>
  )
}

function TracksTab() {
  const [tracks, setTracks] = useState(null)
  useEffect(() => { getFeed(0, 100, 'random').then(setTracks).catch(() => setTracks([])) }, [])
  if (tracks === null) return <Loading />
  if (tracks.length === 0) return <Empty text="Aún no hay canciones." />
  return (
    <div style={s.grid}>
      {tracks.map(t => <TrackCard key={t.id} track={t} queue={tracks} />)}
    </div>
  )
}

function ArtistsTab() {
  const [artists, setArtists] = useState(null)
  useEffect(() => { getArtists().then(setArtists).catch(() => setArtists([])) }, [])
  if (artists === null) return <Loading />
  if (artists.length === 0) return <Empty text="Aún no hay artistas." />
  return (
    <div style={s.artistGrid}>
      {artists.map(u => (
        <Link key={u.id} to={`/user/${u.id}`} style={s.artistCard}>
          <div style={s.avatarRing}><Avatar user={u} size={120} /></div>
          <div style={s.artistName}>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>{u.display_name || u.username}</span>
            {PLAN_BADGE[u.plan] && <span className={PLAN_BADGE[u.plan].cls}>{PLAN_BADGE[u.plan].text}</span>}
          </div>
          <div style={s.artistHandle}>@{u.username}</div>
          <div style={s.artistStats}>
            {u.track_count} {u.track_count === 1 ? 'canción' : 'canciones'} · {u.total_plays} ▶
          </div>
          {u.bio && <div style={s.artistBio}>{u.bio}</div>}
          <span style={s.artistViewBtn}>Ver perfil</span>
        </Link>
      ))}
    </div>
  )
}

function GenresTab() {
  const [genres, setGenres]   = useState(null)
  const [active, setActive]   = useState(null)
  const [tracks, setTracks]   = useState(null)

  useEffect(() => { getGenres().then(setGenres).catch(() => setGenres([])) }, [])

  function pick(g) {
    setActive(g)
    setTracks(null)
    getFeed(0, 100, 'recent', g).then(setTracks).catch(() => setTracks([]))
  }

  if (genres === null) return <Loading />
  if (genres.length === 0) return <Empty text="Aún no hay géneros." />

  return (
    <div>
      <div style={s.chips}>
        {genres.map(g => (
          <button key={g.genre} onClick={() => pick(g.genre)} style={{
            ...s.chip,
            background: active === g.genre ? 'var(--accent)' : 'var(--bg3)',
            color:      active === g.genre ? '#fff' : 'var(--text2)',
          }}>
            {g.genre} <span style={{opacity:.7}}>({g.count})</span>
          </button>
        ))}
      </div>

      {active && (
        <section style={{marginTop:8}}>
          <h2 style={s.sectionTitle}>{active}</h2>
          {tracks === null ? <Loading />
            : tracks.length === 0 ? <Empty text="Sin canciones en este género." />
            : <div style={s.grid}>{tracks.map(t => <TrackCard key={t.id} track={t} queue={tracks} />)}</div>}
        </section>
      )}
    </div>
  )
}

function TabBtn({ label, val, current, set }) {
  return (
    <button onClick={() => set(val)} style={{
      padding:'7px 16px', borderRadius:20, fontSize:13, fontWeight:600,
      background: current === val ? 'var(--accent)' : 'var(--bg3)',
      color: current === val ? '#fff' : 'var(--text2)',
      border: '1px solid var(--border)', transition:'all .15s',
    }}>
      {label}
    </button>
  )
}

const Loading = () => <p style={{color:'var(--text3)',marginTop:30,textAlign:'center'}}>Cargando...</p>
const Empty   = ({ text }) => <p style={{color:'var(--text3)',marginTop:30,textAlign:'center'}}>{text}</p>

const s = {
  tabs: {display:'flex', gap:8, marginBottom:22, flexWrap:'wrap'},
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',
    gap:'20px 16px',
  },
  userRow: {
    display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
    background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,
    color:'var(--text)',
  },
  artistGrid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
    gap:16,
  },
  artistCard: {
    display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', gap:3,
    padding:'24px 14px 18px', background:'var(--bg2)', border:'1px solid var(--border)',
    borderRadius:16, color:'var(--text)', transition:'border-color .15s',
  },
  avatarRing: {
    padding:4, borderRadius:'50%', background:'var(--bg)',
    border:'3px solid rgba(var(--accent-rgb),.55)', marginBottom:8,
  },
  artistName: {
    display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'center',
    fontWeight:700, fontSize:15, maxWidth:'100%',
  },
  artistHandle: { fontSize:11, color:'var(--text3)' },
  artistStats: { fontSize:10.5, color:'var(--text3)', marginTop:1 },
  artistBio: {
    fontSize:11, color:'var(--text3)', marginTop:4, lineHeight:1.3,
    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden',
  },
  artistViewBtn: {
    marginTop:12, fontSize:12, fontWeight:700, color:'#fff', background:'var(--accent)',
    padding:'7px 20px', borderRadius:20,
  },
  chips: {display:'flex', flexWrap:'wrap', gap:10, marginBottom:24},
  chip: {
    padding:'8px 14px', borderRadius:20, fontSize:13, fontWeight:600,
    border:'1px solid var(--border)', cursor:'pointer', transition:'all .15s',
  },
  sectionTitle: {
    fontSize:17, fontWeight:700, marginBottom:14,
    borderLeft:'3px solid var(--accent)', paddingLeft:10,
  },
}
