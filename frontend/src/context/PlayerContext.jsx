import React, { createContext, useContext, useRef, useState, useEffect } from 'react'
import { trackStreamUrl } from '../api'
import { localSrc, queuePlay } from '../offline'

const Ctx = createContext()

export function PlayerProvider({ children }) {
  const audioRef    = useRef(null)
  const queueRef    = useRef([])
  const idxRef      = useRef(-1)
  const [queue,       setQueue]       = useState([])
  const [queueIndex,  setQueueIndex]  = useState(-1)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [volume,      setVolumeState] = useState(0.85)

  useEffect(() => { queueRef.current = queue },      [queue])
  useEffect(() => { idxRef.current   = queueIndex }, [queueIndex])

  function audio() {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.volume = 0.85
    }
    return audioRef.current
  }

  useEffect(() => {
    const a = audio()
    const onTime  = () => setCurrentTime(a.currentTime)
    const onDur   = () => setDuration(isNaN(a.duration) ? 0 : a.duration)
    const onPlay  = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnd   = () => {
      const q = queueRef.current, idx = idxRef.current
      if (idx + 1 < q.length) _load(q, idx + 1)
      else setIsPlaying(false)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('durationchange', onDur)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('durationchange', onDur)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  async function _load(q, idx) {
    const track = q[idx]
    const a = audio()
    setQueue([...q])
    setQueueIndex(idx)
    // Prefer a downloaded copy (works offline). If we play from disk the
    // server never sees it, so queue the play to sync later.
    const local = await localSrc(track.id)
    if (local) {
      a.src = local
      queuePlay(track.id)
    } else {
      a.src = trackStreamUrl(track.id)
    }
    a.play().catch(() => {})
  }

  function playTrack(track, tracks) {
    const q   = tracks || [track]
    const idx = tracks ? tracks.findIndex(t => t.id === track.id) : 0
    _load(q, idx < 0 ? 0 : idx)
  }

  function togglePlay() {
    const a = audio()
    a.paused ? a.play().catch(() => {}) : a.pause()
  }

  function playNext() {
    const q = queueRef.current, idx = idxRef.current
    if (idx + 1 < q.length) _load(q, idx + 1)
  }

  function playPrev() {
    const a = audio()
    if (a.currentTime > 3) { a.currentTime = 0; return }
    const q = queueRef.current, idx = idxRef.current
    if (idx > 0) _load(q, idx - 1)
  }

  function seek(t)   { audio().currentTime = t }
  function setVolume(v) { audio().volume = v; setVolumeState(v) }

  const currentTrack = queueIndex >= 0 && queue.length > 0 ? queue[queueIndex] : null

  return (
    <Ctx.Provider value={{
      currentTrack, queue, queueIndex,
      isPlaying, currentTime, duration, volume,
      playTrack, togglePlay, playNext, playPrev, seek, setVolume,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const usePlayer = () => useContext(Ctx)
