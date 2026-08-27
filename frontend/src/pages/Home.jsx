import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFeed, getFollowingFeed, getTopTracks } from '../api'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { useMedia } from '../context/MediaContext'
import { Avatar } from '../components/Navbar'
import { trackCoverUrl } from '../api'
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
        setTracks(await getFollowingFeed())
        setTop([])
      } else {
        // Songs in random order + the 10 most played.
        const [feed, tops] = await Promise.all([
          getFeed(0, 100, 'random'),
          getTopTracks(10),
        ])
        setTracks(feed)
        setTop(tops)
      }
    } catch {}
    setLoading(false)
  }

  function onDelete(id) {
    setTracks(t => t.filter(x => x.id !== id))
    setTop(t => t.filter(x => x.id !== id))
  }

  return (
    <div style={{padding: isMobile ? '16px 14px' : '24px 28px'}}>
      <div style={s.header}>
        <h1 style={{fontSize:22,fontWeight:700}}>Descubre música</h1>
        <div style={s.tabs}>
          <TabBtn label="Todo" val="all"       current={tab} set={setTab} />
          {user && <TabBtn label="Siguiendo" val="following" current={tab} set={setTab} />}
          <Link to="/explore" style={s.exploreLink}>Explorar ›</Link>
        </div>
      </div>

      {loading ? (
        <p style={{color:'var(--text3)',marginTop:40,textAlign:'center'}}>Cargando...</p>
      ) : tracks.length === 0 && top.length === 0 ? (
        <div style={s.empty}>
          <p style={{fontSize:16,marginBottom:8}}>
            {tab === 'following' ? 'Sigue a artistas para ver su música aquí.' : 'Aún no hay música. ¡Sé el primero en subir!'}
          </p>
        </div>
      ) : (
        <>
          {top.length > 0 && (
            <section style={{marginBottom:34}}>
              <h2 style={s.sectionTitle}>🔥 Top 10 más escuchadas</h2>
              <div style={s.topList}>
                {top.map((t, i) => <TopRow key={t.id} track={t} rank={i + 1} queue={top} />)}
              </div>
            </section>
          )}

          {tracks.length > 0 && (
            <section>
              <h2 style={s.sectionTitle}>
                {tab === 'following' ? 'De quienes sigues' : 'Explora canciones'}
              </h2>
              <div style={s.grid}>
                {tracks.map(t => (
                  <TrackCard key={t.id} track={t} queue={tracks} onDelete={onDelete} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// Compact numbered row for the Top 10.
function TopRow({ track, rank, queue }) {
  const { play, current, isPlaying } = useMedia()
  const isCurrent = current?.id === track.id
  const artist = track.artists?.length
    ? track.artists.map(a => a.display_name || a.username).join(', ')
    : (track.artist || track.display_name || track.username)
  return (
    <button style={s.topRow} onClick={() => play(track, queue)}>
      <span style={{...s.rank, color: rank <= 3 ? 'var(--accent)' : 'var(--text3)'}}>{rank}</span>
      <img src={trackCoverUrl(track.id)} alt="" style={s.topCover}
           onError={e => { e.target.style.visibility = 'hidden' }} />
      <div style={{minWidth:0, flex:1, textAlign:'left'}}>
        <div style={s.topTitle}>{track.title}</div>
        <div style={s.topArtist}>{artist}</div>
      </div>
      <span style={s.plays}>{track.play_count} ▶</span>
      <span style={{fontSize:16, color: isCurrent && isPlaying ? 'var(--accent)' : 'var(--text3)'}}>
        {isCurrent && isPlaying ? '❚❚' : '►'}
      </span>
    </button>
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

const s = {
  header: {display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12},
  tabs: {display:'flex', gap:8, alignItems:'center'},
  exploreLink: {fontSize:13, fontWeight:600, color:'var(--accent)', padding:'7px 6px'},
  sectionTitle: {
    fontSize:17, fontWeight:700, marginBottom:14,
    display:'flex', alignItems:'baseline', gap:10,
    borderLeft:'3px solid var(--accent)', paddingLeft:10,
  },
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',
    gap:'20px 16px',
  },
  topList: {display:'flex', flexDirection:'column', gap:6, maxWidth:640},
  topRow: {
    display:'flex', alignItems:'center', gap:12, padding:'8px 12px',
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10,
    width:'100%', cursor:'pointer', color:'var(--text)',
  },
  rank: {fontSize:16, fontWeight:800, width:22, textAlign:'center', flexShrink:0},
  topCover: {width:42, height:42, borderRadius:6, objectFit:'cover', flexShrink:0, background:'var(--bg3)'},
  topTitle: {fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'},
  topArtist: {fontSize:12, color:'var(--text3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'},
  plays: {fontSize:12, color:'var(--text3)', flexShrink:0, fontVariantNumeric:'tabular-nums'},
  empty: {textAlign:'center', padding:'60px 0', color:'var(--text2)'},
}
