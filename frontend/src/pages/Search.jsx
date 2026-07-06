import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { search } from '../api'
import TrackCard from '../components/TrackCard'
import { Avatar } from '../components/Navbar'

export default function Search() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const [results, setResults] = useState({ tracks:[], users:[] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q) return
    setLoading(true)
    search(q).then(setResults).catch(() => {}).finally(() => setLoading(false))
  }, [q])

  if (!q) return (
    <div style={{padding:'60px 28px',textAlign:'center',color:'var(--text3)'}}>
      Usa la barra de búsqueda arriba.
    </div>
  )

  const total = results.tracks.length + results.users.length

  return (
    <div style={{padding:'24px 28px'}}>
      <h1 style={{fontSize:20,fontWeight:700,marginBottom:4}}>Resultados para "{q}"</h1>
      {!loading && <p style={{color:'var(--text3)',marginBottom:24,fontSize:13}}>{total} resultado{total!==1?'s':''}</p>}

      {loading ? (
        <p style={{color:'var(--text3)'}}>Buscando...</p>
      ) : total === 0 ? (
        <p style={{color:'var(--text3)'}}>Sin resultados.</p>
      ) : (
        <>
          {results.users.length > 0 && (
            <section style={{marginBottom:32}}>
              <h2 style={{fontSize:15,fontWeight:700,marginBottom:14}}>Artistas</h2>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {results.users.map(u => (
                  <Link key={u.id} to={`/user/${u.id}`} style={s.userRow}>
                    <Avatar user={u} size={44} />
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{u.display_name || u.username}</div>
                      <div style={{fontSize:12,color:'var(--text3)'}}>@{u.username} · {u.track_count} canciones</div>
                    </div>
                    {u.plan === 'pro'    && <span className="badge-plan-pro" style={{marginLeft:'auto'}}>PRO</span>}
                    {u.plan === 'legend' && <span className="badge-plan-legend" style={{marginLeft:'auto'}}>LEGEND</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.tracks.length > 0 && (
            <section>
              <h2 style={{fontSize:15,fontWeight:700,marginBottom:14}}>Canciones</h2>
              <div style={s.grid}>
                {results.tracks.map(t => <TrackCard key={t.id} track={t} queue={results.tracks} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

const s = {
  userRow: {
    display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
    background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,
    transition:'background .15s',color:'var(--text)',
  },
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))',
    gap:12,
  },
}
