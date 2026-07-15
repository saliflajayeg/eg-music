import React, { useEffect, useState } from 'react'
import TrackCard from '../components/TrackCard'
import { isNative, getDownloads } from '../offline'

export default function Downloads() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!isNative()) { setItems([]); return }
    getDownloads().then(setItems).catch(() => setItems([]))
  }, [])

  if (!isNative()) return (
    <div style={s.center}>
      <div style={{fontSize:40, marginBottom:12}}>📥</div>
      <h2 style={{marginBottom:8}}>Descargas</h2>
      <p style={{color:'var(--text2)', textAlign:'center', maxWidth:340}}>
        Las descargas para escuchar sin conexión solo están disponibles en la app de Android.
      </p>
    </div>
  )

  if (items === null) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>

  return (
    <div style={{padding:'16px 14px'}}>
      <h1 style={{fontSize:22, fontWeight:700, marginBottom:4}}>Mis descargas</h1>
      <p style={{color:'var(--text3)', fontSize:13, marginBottom:20}}>
        Disponibles sin conexión · {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
      </p>
      {items.length === 0 ? (
        <div style={s.center}>
          <p style={{color:'var(--text2)', textAlign:'center', maxWidth:320}}>
            Aún no has descargado nada. Toca el ícono ⬇ en cualquier canción o video para guardarlo aquí.
          </p>
        </div>
      ) : (
        <div style={s.grid}>
          {items.map(t => (
            <TrackCard key={t.id} track={t} queue={items.filter(x => x.media_type !== 'video')} />
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  center: {display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'50vh', padding:16},
  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))',
    gap:12,
  },
}
