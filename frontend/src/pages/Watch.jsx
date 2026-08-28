import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getTrack } from '../api'
import { useMedia } from '../context/MediaContext'

// The full player lives at its own page, /watch/:id. This route just makes
// sure the requested track is the one playing; the player itself (a persistent
// overlay rendered outside <Routes>, so its <video> never remounts) draws the
// whole page UI on top. Minimizing navigates away and the player shrinks to the
// bottom bar.
export default function Watch() {
  const { id } = useParams()
  const { play, current } = useMedia()
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
    if (current && current.id === Number(id)) return   // already playing this one
    getTrack(Number(id)).then(t => play(t, [t])).catch(() => setError(true))
  // Only react to the URL changing — not to auto-advance changing `current`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <p style={{ color:'var(--text3)' }}>Contenido no encontrado.</p>
    </div>
  )
  return null
}
