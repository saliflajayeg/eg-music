import React, { useEffect, useMemo, useState } from 'react'
import { getFeed, getFollowingFeed } from '../api'
import { useAuth } from '../context/AuthContext'
import TrackCard from '../components/TrackCard'

export default function Home() {
  const { user } = useAuth()
  const [tab,    setTab]    = useState('all')
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tab])

  async function load() {
    setLoading(true)
    try {
      const data = tab === 'following' && user
        ? await getFollowingFeed()
        : await getFeed()
      setTracks(data)
    } catch {}
    setLoading(false)
  }

  function onDelete(id) {
    setTracks(t => t.filter(x => x.id !== id))
  }

  // Group tracks by genre: biggest genres first, "Otros" always last
  const sections = useMemo(() => {
    const map = new Map()
    for (const t of tracks) {
      const key = (t.genre || '').trim().toLowerCase() || 'otros'
      if (!map.has(key)) {
        const raw = (t.genre || '').trim()
        map.set(key, { key, name: raw ? raw[0].toUpperCase() + raw.slice(1) : 'Otros', tracks: [] })
      }
      map.get(key).tracks.push(t)
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === 'otros') return 1
      if (b.key === 'otros') return -1
      return b.tracks.length - a.tracks.length
    })
  }, [tracks])

  return (
    <div style={{padding:'24px 28px'}}>
      <div style={s.header}>
        <h1 style={{fontSize:22,fontWeight:700}}>Descubre música</h1>
        <div style={s.tabs}>
          <TabBtn label="Todo" val="all"       current={tab} set={setTab} />
          {user && <TabBtn label="Siguiendo" val="following" current={tab} set={setTab} />}
        </div>
      </div>

      {loading ? (
        <p style={{color:'var(--text3)',marginTop:40,textAlign:'center'}}>Cargando...</p>
      ) : tracks.length === 0 ? (
        <div style={s.empty}>
          <p style={{fontSize:16,marginBottom:8}}>
            {tab === 'following' ? 'Sigue a artistas para ver su música aquí.' : 'Aún no hay música. ¡Sé el primero en subir!'}
          </p>
        </div>
      ) : (
        sections.map(sec => (
          <section key={sec.key} style={{marginBottom:30}}>
            <h2 style={s.sectionTitle}>
              {sec.name}
              <span style={s.sectionCount}>
                {sec.tracks.length} {sec.tracks.length === 1 ? 'canción' : 'canciones'}
              </span>
            </h2>
            <div style={s.grid}>
              {sec.tracks.map(t => (
                <TrackCard key={t.id} track={t} queue={sec.tracks} onDelete={onDelete} />
              ))}
            </div>
          </section>
        ))
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

const s = {
  header: {display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12},
  tabs: {display:'flex', gap:8},
  sectionTitle: {
    fontSize:17, fontWeight:700, marginBottom:12,
    display:'flex', alignItems:'baseline', gap:10,
    borderLeft:'3px solid var(--accent)', paddingLeft:10,
  },
  sectionCount: {fontSize:12, fontWeight:400, color:'var(--text3)'},
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(132px, 1fr))',
    gap:12,
  },
  empty: {textAlign:'center', padding:'60px 0', color:'var(--text2)'},
}
