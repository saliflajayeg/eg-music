import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getFeed } from '../api'
import MediaPlayer from '../components/MediaPlayer'

// One player for everything. Songs and videos share the same queue, the same
// controls and the same single <video> element (which never remounts, so
// switching between the bottom bar and full screen never restarts playback).
const Ctx = createContext()
export const useMedia = () => useContext(Ctx)

export function MediaProvider({ children }) {
  const [queue, setQueue]         = useState([])
  const [index, setIndex]         = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffle, setShuffle]     = useState(false)
  const [repeat, setRepeat]       = useState('off')   // 'off' | 'all' | 'one'
  const apiRef = useRef({})        // imperative controls registered by MediaPlayer
  const primedRef = useRef(false)  // a random song is cued, waiting for a gesture
  const openedAtRef = useRef(0)    // when the current item was opened
  const navigate = useNavigate()
  const location = useLocation()

  const current = index >= 0 && index < queue.length ? queue[index] : null
  // The route IS the source of truth for "expanded": the full player lives at
  // its own page (/watch/:id). Minimizing just navigates away; the persistent
  // <video> (rendered outside <Routes>) keeps playing in the bottom bar.
  const expanded = location.pathname.startsWith('/watch/')

  const play = useCallback((track, list) => {
    const q = (list && list.length) ? list : [track]
    const i = Math.max(0, q.findIndex(t => t.id === track.id))
    primedRef.current = false
    openedAtRef.current = Date.now()
    setQueue(q)
    setIndex(i)
    // Videos open their own page (you want to watch); songs stay in the bar so
    // you can keep browsing. Replace the entry when already on a watch page so
    // "minimize" goes back to where you were, not to the previous track.
    if (track.media_type === 'video') {
      navigate('/watch/' + track.id, { replace: location.pathname.startsWith('/watch/'), state: { fromApp: true } })
    }
  }, [navigate, location.pathname])

  const togglePlay = useCallback(() => apiRef.current.toggle?.(), [])
  const seek       = useCallback(t => apiRef.current.seek?.(t), [])
  const next = useCallback(() => setIndex(i => {
    if (queue.length <= 1) return i
    if (shuffle) { let r = i; while (r === i) r = Math.floor(Math.random() * queue.length); return r }
    if (i + 1 < queue.length) return i + 1
    return repeat === 'all' ? 0 : i          // wrap to start only when repeating all
  }), [queue.length, shuffle, repeat])
  const prev = useCallback(() => {
    // Restart the current item if we're more than 3s in, else go back.
    if (apiRef.current.prev) apiRef.current.prev()
    else setIndex(i => (i > 0 ? i - 1 : i))
  }, [])
  const close = useCallback(() => {
    setQueue([]); setIndex(-1)
    if (location.pathname.startsWith('/watch/')) navigate('/')
  }, [navigate, location.pathname])

  // Radio-style: cue a random song when the app opens. Browsers block autoplay
  // with sound until a gesture, so we start on the first interaction.
  useEffect(() => {
    let cancelled = false
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/watch')) return
    getFeed(0, 50, 'random').then(list => {
      if (cancelled) return
      const songs = (list || []).filter(t => t.media_type !== 'video')
      if (!songs.length) return
      const pick = songs[Math.floor(Math.random() * songs.length)]
      primedRef.current = true
      setQueue([pick]); setIndex(0)
    }).catch(() => {})

    const kick = () => {
      if (!primedRef.current) return
      primedRef.current = false
      apiRef.current.play?.()
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      window.removeEventListener('touchstart', kick)
    }
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    window.addEventListener('touchstart', kick)
    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      window.removeEventListener('touchstart', kick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = {
    queue, index, current, isPlaying, expanded, shuffle, repeat,
    play, togglePlay, next, prev, seek, close,
    toggleShuffle: () => setShuffle(s => !s),
    cycleRepeat: () => setRepeat(r => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    // Open the full player as its own page; minimize returns to where you were
    // (a real in-app back), or home if the watch page was opened directly.
    expand: () => { if (current) navigate('/watch/' + current.id, { state: { fromApp: true } }) },
    collapse: () => { if (location.state && location.state.fromApp) navigate(-1); else navigate('/') },
    // internals for MediaPlayer
    _apiRef: apiRef, _setIsPlaying: setIsPlaying, _setIndex: setIndex, _primedRef: primedRef, _openedAtRef: openedAtRef,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {current && <MediaPlayer />}
    </Ctx.Provider>
  )
}
