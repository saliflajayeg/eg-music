import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrack } from '../api'
import { useMedia } from '../context/MediaContext'

// A shared /track link opens the song in the one player (same as /watch).
export default function Track() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { play, expand } = useMedia()
  const [error, setError] = useState(false)

  useEffect(() => {
    let done = false
    getTrack(Number(id)).then(t => {
      if (done) return
      play(t, [t]); expand()
      navigate('/', { replace: true })
    }).catch(() => setError(true))
    return () => { done = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <p style={{ color:'var(--text3)' }}>{error ? 'Contenido no encontrado.' : 'Abriendo…'}</p>
    </div>
  )
}
