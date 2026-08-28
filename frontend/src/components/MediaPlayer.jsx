import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useMedia } from '../context/MediaContext'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { trackStreamUrl, trackCoverUrl, likeTrack } from '../api'
import { shareTrack } from '../share'
import { localSrc, isDownloaded, queuePlay, isNative, downloadMedia, deleteDownload } from '../offline'
import ArtistLine from './ArtistLine'
import ArtistHeader from './ArtistHeader'
import Comments from './Comments'
import AddToPlaylist from './AddToPlaylist'

const HEADER_H = 52
const _resumeAt = {}   // last position per track, kept across src/quality swaps

function connectionPrefersSd() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (!c) return false
    if (c.saveData) return true
    if (c.effectiveType && /(^|\s)(slow-2g|2g|3g)/.test(c.effectiveType)) return true
    if (typeof c.downlink === 'number' && c.downlink > 0 && c.downlink < 1.5) return true
  } catch {}
  return false
}
const fmt = s => {
  if (!isFinite(s) || s < 0) s = 0
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const fmtCount = n => {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' M'
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + ' mil'
  return String(n)
}

export default function MediaPlayer() {
  const media = useMedia()
  const { current, queue, index, isPlaying, expanded, shuffle, repeat,
          next, prev, collapse, expand, close, toggleShuffle, cycleRepeat, _apiRef, _setIsPlaying } = media
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const wide = !useIsMobile(860)    // side-by-side suggestions on desktop-ish widths
  const videoRef = useRef(null)
  const wrapRef  = useRef(null)
  const touchY   = useRef(null)   // swipe-down-to-minimize

  const isVideo = current.media_type === 'video'
  const sdReady = current.sd_status === 'ready' && !!current.sd_file

  const [src, setSrc]     = useState(null)
  const [isLocal, setLocal] = useState(false)
  const [cur, setCur]     = useState(0)
  const [dur, setDur]     = useState(0)
  const [buf, setBuf]     = useState(0)
  const [vol, setVol]     = useState(0.9)
  const [muted, setMuted] = useState(false)
  const [quality, setQuality] = useState('auto')
  const [stalls, setStalls]   = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [liked, setLiked] = useState(!!current.liked_by_me)
  const [likeCount, setLikeCount] = useState(current.like_count || 0)
  const [dl, setDl] = useState('none')
  const [topOffset, setTopOffset] = useState(0)   // bottom of the app navbar; the expanded player sits below it
  const [showCtl, setShowCtl] = useState(true)    // video overlay controls auto-hide
  const hideTimer = useRef(null)
  const scrollRef = useRef(0)   // how far the page has scrolled (media slides with it)
  const paneRef   = useRef(null)

  const countedRef = useRef(false)
  const lastIdRef  = useRef(null)
  const localPlayedRef = useRef(false)
  const usingSd = isVideo && (quality === 'sd' || (quality === 'auto' && sdReady && (connectionPrefersSd() || stalls >= 2)))

  // A new track (or re-opening the page) starts scrolled to the top.
  useEffect(() => {
    scrollRef.current = 0
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [current.id, expanded])

  // Like / download state per track.
  useEffect(() => {
    setLiked(!!current.liked_by_me); setLikeCount(current.like_count || 0)
    if (isNative()) isDownloaded(current.id).then(d => setDl(d ? 'done' : 'none')); else setDl('none')
  }, [current.id])

  // Keep the app navbar visible when expanded (feels like YouTube's page, not a
  // takeover): measure where the navbar ends and start the player below it.
  useEffect(() => {
    if (!expanded) return
    const measure = () => {
      const nav = document.querySelector('nav')
      setTopOffset(nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setTimeout(measure, 60)
    return () => { window.removeEventListener('resize', measure); clearTimeout(t) }
  }, [expanded, isMobile])

  // Resolve the source (downloaded copy > adaptive stream), preserving position
  // on a quality swap and counting a view only on a genuine new track.
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const isNewTrack = lastIdRef.current !== current.id
      if (isNewTrack) { countedRef.current = false; localPlayedRef.current = false }
      const local = await localSrc(current.id)
      if (cancel) return
      if (local) { setLocal(true); setSrc(local) }
      else {
        setLocal(false)
        const q = usingSd ? 'sd' : undefined
        setSrc(trackStreamUrl(current.id, { q, count: isNewTrack ? 1 : 0 }))
      }
      lastIdRef.current = current.id
    })()
    return () => { cancel = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, quality, stalls])

  function onLoadedMeta() {
    const v = videoRef.current; if (!v) return
    setDur(v.duration || 0)
    v.volume = vol; v.muted = muted
    const t = _resumeAt[current.id] || 0
    if (t > 0 && Math.abs(v.currentTime - t) > 0.5) { try { v.currentTime = t } catch {} }
    v.play().catch(() => {})
  }

  // Native <video> events → shared state. Rebound per track so callbacks are fresh.
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay = () => _setIsPlaying(true)
    const onPause = () => _setIsPlaying(false)
    const onTime = () => {
      setCur(v.currentTime); _resumeAt[current.id] = v.currentTime
      if (!countedRef.current && v.currentTime > 1) {
        countedRef.current = true
        if (isLocal) isDownloaded(current.id).then(d => { if (d && !localPlayedRef.current) { localPlayedRef.current = true; queuePlay(current.id) } })
      }
    }
    const onDur = () => setDur(isNaN(v.duration) ? 0 : v.duration)
    const onProg = () => { try { if (v.buffered.length) setBuf(v.buffered.end(v.buffered.length - 1)) } catch {} }
    const onEnd = () => { if (repeat === 'one') { const x=videoRef.current; if (x) { x.currentTime = 0; x.play().catch(()=>{}) } } else next() }
    const onWaiting = () => { if (isVideo && quality === 'auto' && sdReady && !usingSd) setStalls(s => s + 1) }
    const onVolume = () => { setVol(v.volume); setMuted(v.muted) }
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime); v.addEventListener('durationchange', onDur)
    v.addEventListener('progress', onProg); v.addEventListener('ended', onEnd)
    v.addEventListener('waiting', onWaiting); v.addEventListener('volumechange', onVolume)
    return () => {
      v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('durationchange', onDur)
      v.removeEventListener('progress', onProg); v.removeEventListener('ended', onEnd)
      v.removeEventListener('waiting', onWaiting); v.removeEventListener('volumechange', onVolume)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, isLocal, quality, usingSd, repeat, next])

  // Imperative controls used by the context (and cards via play()).
  useEffect(() => {
    _apiRef.current = {
      toggle: () => { const v = videoRef.current; if (!v) return; v.paused ? v.play().catch(() => {}) : v.pause() },
      play:   () => videoRef.current?.play().catch(() => {}),
      seek:   t => { const v = videoRef.current; if (v) { v.currentTime = t; setCur(t) } },
      setVolume: x => { const v = videoRef.current; if (v) { v.volume = x; v.muted = x === 0 } },
      prev:   () => { const v = videoRef.current; if (v && v.currentTime > 3) { v.currentTime = 0; return } media._setIndex(i => (i > 0 ? i - 1 : i)) },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function seekTo(t) { const v = videoRef.current; if (v) { v.currentTime = t; setCur(t) } }
  function toggleMute() { const v = videoRef.current; if (v) v.muted = !v.muted }
  function setVolume(x) { const v = videoRef.current; if (v) { v.volume = x; v.muted = x === 0 } }
  function toggleFullscreen() {
    const el = wrapRef.current
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }
  async function togglePip() {
    const v = videoRef.current; if (!v) return
    try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await v.requestPictureInPicture?.() } catch {}
  }
  function pickQuality(q) { setQuality(q); setStalls(0); setMenuOpen(false) }

  // Video overlay controls: show on interaction, fade out ~2.8s into playback;
  // always visible while paused.
  function pokeControls() {
    setShowCtl(true)
    clearTimeout(hideTimer.current)
    if (isPlaying) hideTimer.current = setTimeout(() => { setShowCtl(false); setMenuOpen(false) }, 2800)
  }
  useEffect(() => {
    if (!expanded) return
    clearTimeout(hideTimer.current)
    if (isPlaying) hideTimer.current = setTimeout(() => setShowCtl(false), 2800)
    else setShowCtl(true)
    return () => clearTimeout(hideTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, expanded, current.id])

  async function handleLike() {
    if (!user) { navigate('/login'); return }
    try { const r = await likeTrack(current.id); setLiked(r.liked); setLikeCount(r.like_count) } catch {}
  }
  async function handleShare() {
    const r = await shareTrack(current); if (r === 'copied') alert('Enlace copiado. Pégalo donde quieras compartirlo.')
  }
  async function handleDownload() {
    if (!user) { navigate('/login'); return }
    if (dl === 'busy') return
    if (dl === 'done') { if (!confirm('¿Quitar de descargas?')) return; await deleteDownload(current.id); setDl('none'); return }
    setDl('busy')
    try { await downloadMedia(current); setDl('done') } catch (e) { setDl('none'); alert(e.message) }
  }

  const pct = dur ? (cur / dur) * 100 : 0
  const bufPct = dur ? (buf / dur) * 100 : 0
  const artistName = (current.artists && current.artists.length)
    ? current.artists.map(a => a.display_name || a.username).join(', ')
    : (current.artist || current.display_name || current.username)

  // Everything in the expanded player is positioned below the app navbar (TOP)
  // so the app chrome stays visible — the "same window" YouTube feel.
  const TOP = topOffset
  const HEAD = TOP + HEADER_H          // player sub-header bottom
  // ── "Escenario" (YouTube-style) layout ──────────────────────────────────
  // ONE media frame, always 16:9 and the same size whether it's audio or
  // video, centered inside a max-width stage with the up-next rail alongside.
  const RAILW = 344, GAP = 28
  const STAGE      = 'min(1180px, calc(100vw - 48px))'
  const STAGE_LEFT = 'max(24px, calc((100vw - 1180px) / 2))'
  const MAIN_W     = `calc(${STAGE} - ${RAILW + GAP}px)`
  const mediaH  = `min(calc((${MAIN_W}) * 0.5625), 56vh)`   // desktop, height-capped
  const mediaW  = `calc(${mediaH} * 16 / 9)`                // 16:9, same for both
  const mMediaH = 'min(56.25vw, 46vh)'                      // mobile, full-width 16:9

  // The persistent media surface (one <video>, never remounts). Fixed in both
  // modes so its parent never changes; only its rect animates.
  // The media slides up with the page. Its top follows the scroll and the part
  // that passes above the header line is clipped, so it tucks away like YouTube.
  const baseTop = wide ? HEAD + 18 : HEAD
  const frameTop = baseTop - scrollRef.current
  const clipCut = Math.max(0, HEAD - frameTop)
  const clip = clipCut > 0 ? `inset(${clipCut}px 0 0 0)` : 'none'

  const frameStyle = !expanded
    ? { position:'fixed', bottom:(isMobile?12:20), left:(isMobile?10:12), width:(isMobile?72:107), height:(isMobile?40:60), borderRadius:6, overflow:'hidden', background:'#000', zIndex:160, cursor:'pointer' }
    : wide
      ? { position:'fixed', top:frameTop, left:STAGE_LEFT, height:mediaH, width:mediaW, borderRadius:12, overflow:'hidden', background:'#000', zIndex:160, clipPath:clip }
      : { position:'fixed', top:frameTop, left:0, right:0, width:'100%', height:mMediaH, overflow:'hidden', background:'#000', zIndex:160, clipPath:clip }

  // Move the media with the scroll directly (no re-render) for a smooth slide.
  function onPaneScroll(e) {
    scrollRef.current = e.currentTarget.scrollTop
    const w = wrapRef.current
    if (!w || !expanded) return
    const top = (wide ? HEAD + 18 : HEAD) - scrollRef.current
    const cut = Math.max(0, HEAD - top)
    w.style.top = top + 'px'
    w.style.clipPath = cut > 0 ? `inset(${cut}px 0 0 0)` : 'none'
  }

  // YouTube-style controls painted ON the frame (auto-hiding) — for BOTH audio
  // (over its cover) and video, so a song looks and works exactly like a video.
  // Quality/PiP/fullscreen are video-only. The mini bar keeps its own chrome.
  const frameControls = expanded && (
    <>
      {!isPlaying && (
        <button onClick={e => { e.stopPropagation(); _apiRef.current.toggle?.() }} style={s.ovCenter} aria-label="Reproducir">
          <IcoPlay big />
        </button>
      )}
      <div style={{ ...s.ovBar, opacity: showCtl ? 1 : 0, pointerEvents: showCtl ? 'auto' : 'none' }}
           onClick={e => e.stopPropagation()}>
        <div style={s.ovSeek}
          onMouseDown={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const go = ev => seekTo(Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) * dur)
            go(e)
            const move = ev => go(ev), up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
            window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
          }}
          onTouchStart={e => { const r = e.currentTarget.getBoundingClientRect(), t = e.touches[0]; seekTo(Math.min(1, Math.max(0, (t.clientX - r.left) / r.width)) * dur) }}>
          <div style={s.ovTrack}>
            <div style={{ ...s.ovBuf, width:`${bufPct}%` }} />
            <div style={{ ...s.ovFill, width:`${pct}%` }} />
            <div style={{ ...s.ovKnob, left:`${pct}%` }} />
          </div>
        </div>
        <div style={s.ovRow}>
          {!isMobile && <button onClick={() => _apiRef.current.prev?.()} style={s.ovIcon} title="Anterior"><IcoPrev /></button>}
          <button onClick={() => _apiRef.current.toggle?.()} style={s.ovIcon} title={isPlaying ? 'Pausar' : 'Reproducir'}>{isPlaying ? <IcoPause /> : <IcoPlay />}</button>
          <button onClick={next} style={s.ovIcon} title="Siguiente"><IcoNext /></button>
          <span style={s.ovTime}>{fmt(cur)} / {fmt(dur)}</span>
          <span style={{ flex:1 }} />
          <button onClick={toggleMute} style={s.ovIcon} title={muted||vol===0 ? 'Activar sonido' : 'Silenciar'}>{muted||vol===0 ? <IcoVolMute /> : <IcoVol />}</button>
          {!isMobile && <input type="range" min={0} max={1} step={0.02} value={muted?0:vol} onChange={e => setVolume(Number(e.target.value))} style={s.ovVol} aria-label="Volumen" />}
          {isVideo && <>
          <div style={{ position:'relative' }}>
            <button onClick={() => setMenuOpen(m => !m)} style={s.ovIcon} title="Calidad"><IcoGear /></button>
            {menuOpen && (
              <div style={s.qMenu}>
                <QItem label="Auto (ajusta a tu red)" active={quality==='auto'} onClick={()=>pickQuality('auto')} />
                <QItem label="Alta (original)" active={quality==='high'} onClick={()=>pickQuality('high')} />
                <QItem label={`480p · ahorro de datos${sdReady?'':' (preparando…)'}`} active={quality==='sd'} disabled={!sdReady} onClick={()=>sdReady&&pickQuality('sd')} />
              </div>
            )}
          </div>
          {document.pictureInPictureEnabled && !isMobile && <button onClick={togglePip} style={s.ovIcon} title="Miniatura (PiP)"><IcoPip /></button>}
          <button onClick={toggleFullscreen} style={s.ovIcon} title="Pantalla completa"><IcoFull /></button>
          </>}
        </div>
      </div>
    </>
  )

  const mediaSurface = (
    <div key="media-surface" ref={wrapRef} style={frameStyle}
         onMouseMove={() => { if (expanded) pokeControls() }}
         onClick={() => { if (!expanded) expand(); else { pokeControls(); const v=videoRef.current; v && (v.paused? v.play().catch(()=>{}) : v.pause()) } }}>
      <video ref={videoRef} src={src || undefined} playsInline
        style={{ width:'100%', height:'100%', objectFit:'contain', display:'block', background:'#000' }}
        onLoadedMetadata={onLoadedMeta} />
      {/* Audio fills the SAME 16:9 frame with its cover — never a shrunken square. */}
      {!isVideo && (!expanded
        ? <img src={trackCoverUrl(current.id)} alt="" onError={e => { e.target.style.display='none' }}
            style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
        : <>
            <div style={{ position:'absolute', inset:0, backgroundImage:`url(${trackCoverUrl(current.id)})`, backgroundSize:'cover', backgroundPosition:'center', filter:'blur(28px) brightness(.45)', transform:'scale(1.2)' }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg, rgba(6,10,8,.2), rgba(6,10,8,.6))' }} />
            <img src={trackCoverUrl(current.id)} alt="" onError={e => { e.target.style.display='none' }}
              style={{ position:'absolute', top:'44%', left:'50%', transform:'translate(-50%,-50%)', height:'66%', aspectRatio:'1', objectFit:'cover', borderRadius:12, boxShadow:'0 16px 40px -12px rgba(0,0,0,.75)' }} />
          </>
      )}
      {frameControls}
    </div>
  )

  // The bottom-bar chrome (collapsed state).
  const barVolume = (
    <div style={s.barVol}>
      <button onClick={toggleMute} style={s.barIcon} title={muted||vol===0 ? 'Activar sonido' : 'Silenciar'} aria-label="Volumen">
        {muted||vol===0 ? <IcoVolMute/> : <IcoVol/>}
      </button>
      {!isMobile && (
        <input type="range" min={0} max={1} step={0.02} value={muted?0:vol}
          onChange={e => setVolume(Number(e.target.value))} style={s.barVolSlider} aria-label="Volumen" />
      )}
    </div>
  )

  const barChrome = (
    <div style={{ ...s.bar, height: isMobile ? 64 : 80 }}>
      <div style={s.barProg}><div style={{ ...s.barFill, width:`${pct}%` }} /></div>
      <div style={{ ...s.barRow, paddingLeft: (isMobile?72:107) + (isMobile?18:24) }}>
        <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={expand}>
          <div style={s.barTitle}>{current.title}</div>
          <div style={s.barArtist}>{artistName}</div>
        </div>
        {barVolume}
        {!isMobile && <button onClick={() => _apiRef.current.prev?.()} style={s.barIcon} title="Anterior"><IcoPrev /></button>}
        <button onClick={() => _apiRef.current.toggle?.()} style={s.barPlay}>{isPlaying?<IcoPause/>:<IcoPlay/>}</button>
        <button onClick={next} style={s.barIcon} title="Siguiente"><IcoNext /></button>
        {!isMobile && <button onClick={handleShare} style={s.barIcon} title="Compartir"><IcoShare /></button>}
        {!isMobile && user && <button onClick={handleLike} style={{ ...s.barIcon, color: liked?'var(--danger)':'var(--text3)', fontSize:18 }}>{liked?'♥':'♡'}</button>}
        <button onClick={close} style={s.barIcon} title="Cerrar">✕</button>
      </div>
    </div>
  )

  const contentPad = `calc(${mMediaH} + 18px)`

  const infoBlock = (
    <>
      <h1 style={s.fsTitle}>{current.title}</h1>
      <div style={s.fsMeta}>
        <span style={s.fsViews2}>{isVideo?'👁':'▶'} {fmtCount(current.play_count)} {isVideo?'vistas':'reproducciones'}</span>
        {current.genre && <span style={s.fsGenre}>{current.genre}</span>}
      </div>

      {/* YouTube-style channel row: artist + follow, and action pills. */}
      <div style={s.channelBar}>
        <ArtistHeader track={current} />
        <div style={s.pills}>
          <button onClick={handleLike} style={{ ...s.pill, ...(liked ? s.pillLiked : {}) }} title="Me gusta">
            {liked ? '♥' : '♡'} {likeCount > 0 ? likeCount : 'Me gusta'}
          </button>
          <button onClick={handleShare} style={s.pill}><IcoShare /> Compartir</button>
          <span style={s.pill}><AddToPlaylist trackId={current.id} /></span>
          {isNative() && <button onClick={handleDownload} style={s.pill}>{dl==='busy'?'⏳':dl==='done'?'✓':'⬇'} {dl==='done'?'Descargado':'Descargar'}</button>}
        </div>
      </div>
    </>
  )

  const upNextBlock = (
    <div style={s.upNext}>
      <div style={s.upHead}>
        <span style={s.upTitle}>A continuación</span>
        <div style={{ display:'flex', gap:2 }}>
          <button onClick={toggleShuffle} style={{ ...s.upCtl, color: shuffle ? 'var(--accent)' : 'var(--text3)' }} title={shuffle ? 'Aleatorio activado' : 'Reproducción aleatoria'}><IcoShuffle /></button>
          <button onClick={cycleRepeat} style={{ ...s.upCtl, color: repeat!=='off' ? 'var(--accent)' : 'var(--text3)' }} title={repeat==='one' ? 'Repetir esta' : repeat==='all' ? 'Repetir cola' : 'Repetir'}>
            {repeat==='one' ? <IcoRepeatOne /> : <IcoRepeat />}
          </button>
        </div>
      </div>
      {queue.length > 1
        ? queue.map((t, i) => i !== index && (
            <button key={t.id} onClick={() => media.play(t, queue)} style={s.upRow}>
              <img src={trackCoverUrl(t.id)} alt="" style={s.upThumb} onError={e=>{e.target.style.visibility='hidden'}} />
              <div style={{ minWidth:0, flex:1, textAlign:'left' }}>
                <div style={s.upRowTitle}>{t.title}</div>
                <div style={s.upRowArtist}>{(t.display_name||t.username)} · {t.media_type==='video'?'video':'canción'}</div>
              </div>
            </button>
          ))
        : <p style={s.upEmpty}>Nada más en la cola por ahora.</p>}
    </div>
  )

  const commentsBlock = (
    <div style={{ marginTop:24, paddingTop:20, borderTop:'1px solid var(--border)' }}>
      <Comments trackId={current.id} />
    </div>
  )

  // Single return: the media surface is ALWAYS the first child so the <video>
  // never remounts (everything is position:fixed, so DOM order ≠ visual order).
  return (
    <>
      {mediaSurface}
      {!expanded ? barChrome : (
      <>
      <div style={{ ...s.fsHeader, top: TOP }}
           onTouchStart={e => { touchY.current = e.touches[0].clientY }}
           onTouchEnd={e => { if (touchY.current != null && e.changedTouches[0].clientY - touchY.current > 45) collapse(); touchY.current = null }}>
        <button onClick={collapse} style={s.fsMinBtn} title="Minimizar">
          <IcoChevronDown />{!isMobile && <span>Minimizar</span>}
        </button>
        <span style={s.fsHeaderTitle}>{current.title}</span>
        <button onClick={close} style={s.fsIcon} title="Cerrar">✕</button>
      </div>

      {wide ? (
        <>
          <div ref={paneRef} onScroll={onPaneScroll} style={{ ...s.fsLeft, top: HEAD, left: STAGE_LEFT, width: MAIN_W, paddingTop:`calc(${mediaH} + 36px)` }}>
            {infoBlock}
            {commentsBlock}
          </div>
          <div style={{ ...s.fsRight, top: HEAD, left:`calc(${STAGE_LEFT} + ${MAIN_W} + ${GAP}px)`, width: RAILW }}>
            {upNextBlock}
          </div>
        </>
      ) : (
        <div ref={paneRef} onScroll={onPaneScroll} style={{ ...s.fsBody, top: HEAD, paddingTop: contentPad }}>
          {infoBlock}
          {upNextBlock}
          {commentsBlock}
        </div>
      )}
      </>
      )}
    </>
  )
}

function QItem({ label, active, disabled, onClick }) {
  return <button onClick={onClick} disabled={disabled} style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:7, fontSize:13, background:'none', border:'none', cursor:'pointer', color: disabled?'var(--text3)':'#fff', fontWeight: active?700:400 }}><span style={{width:14,display:'inline-block'}}>{active?'✓':''}</span> {label}</button>
}

const IcoPlay  = ({big}) => <svg width={big?26:22} height={big?26:22} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
const IcoPause = ({big}) => <svg width={big?26:22} height={big?26:22} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/></svg>
const IcoNext  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 5.6v12.8a1 1 0 0 0 1.54.84l8-6.4a1 1 0 0 0 0-1.68l-8-6.4A1 1 0 0 0 6.5 5.6z"/><rect x="17.4" y="5" width="2.4" height="14" rx="1.2"/></svg>
const IcoPrev  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 5.6v12.8a1 1 0 0 1-1.54.84l-8-6.4a1 1 0 0 1 0-1.68l8-6.4A1 1 0 0 1 17.5 5.6z"/><rect x="4.2" y="5" width="2.4" height="14" rx="1.2"/></svg>
const IcoShare = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
const IcoChevronDown = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
const IcoPip  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16.01H3V4.98h18v14.03z"/></svg>
const IcoFull = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
const IcoShuffle = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>
const IcoRepeat = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
const IcoRepeatOne = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4" fill="currentColor"/></svg>
const IcoGear = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.5 7.5 0 0 0 .05-.94 7.5 7.5 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.86a.5.5 0 0 0 .12.62l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.14.24.42.32.66.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96c.24.1.52.02.66-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>
const IcoVol = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
const IcoVolMute = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>

const s = {
  bar: { position:'fixed', left:0, right:0, bottom:0, zIndex:150, background:'var(--bg2)', borderTop:'1px solid var(--border)' },
  barProg: { position:'absolute', top:0, left:0, right:0, height:3, background:'var(--bg4)' },
  barFill: { height:'100%', background:'var(--accent)' },
  barRow: { display:'flex', alignItems:'center', gap:8, height:'100%', paddingRight:12 },
  barTitle: { fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  barArtist: { fontSize:12, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  barIcon: { color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', padding:5, flexShrink:0, background:'none', border:'none', cursor:'pointer' },
  barPlay: { width:38, height:38, borderRadius:'50%', background:'var(--accent)', color:'#fff', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer' },
  barVol: { display:'flex', alignItems:'center', gap:4, flexShrink:0 },
  barVolSlider: { width:74, accentColor:'var(--accent)', cursor:'pointer' },

  fsHeader: { position:'fixed', top:0, left:0, right:0, height:HEADER_H, zIndex:165, background:'var(--bg)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, padding:'0 12px' },
  fsHeaderTitle: { flex:1, fontSize:14, fontWeight:600, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  fsIcon: { color:'var(--text2)', padding:6, background:'none', border:'none', cursor:'pointer', display:'flex' },
  fsMinBtn: { display:'flex', alignItems:'center', gap:6, color:'var(--text)', fontSize:13, fontWeight:600, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:20, padding:'6px 12px 6px 8px', cursor:'pointer' },
  fsBody: { position:'fixed', top:HEADER_H, left:0, right:0, bottom:0, zIndex:150, background:'var(--bg)', overflowY:'auto', padding:'0 18px 40px', maxWidth:800, margin:'0 auto' },
  fsLeft: { position:'fixed', top:HEADER_H, bottom:0, zIndex:150, background:'var(--bg)', overflowY:'auto', padding:'0 0 48px' },
  fsRight: { position:'fixed', top:HEADER_H, bottom:0, zIndex:150, background:'var(--bg)', overflowY:'auto', padding:'2px 0 48px' },
  fsTitle: { fontSize:20, fontWeight:700, marginBottom:8 },
  fsMeta: { display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:14 },
  fsArtist: { fontSize:14, color:'var(--accent2)', fontWeight:600 },
  fsGenre: { fontSize:10, fontWeight:600, background:'var(--bg3)', color:'var(--text3)', padding:'2px 8px', borderRadius:10, letterSpacing:.5 },
  fsViews: { fontSize:13, color:'var(--text3)', marginLeft:'auto' },
  fsViews2: { fontSize:13, color:'var(--text3)', fontWeight:500 },
  channelBar: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginTop:14, paddingBottom:16, borderBottom:'1px solid var(--border)' },
  pills: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
  pill: { display:'flex', alignItems:'center', gap:6, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:20, padding:'8px 15px', fontSize:13, fontWeight:600, color:'var(--text)', cursor:'pointer' },
  pillLiked: { color:'var(--danger)' },
  seekWrap: { padding:'6px 0', cursor:'pointer' },
  seekTrack: { position:'relative', height:4, borderRadius:3, background:'var(--bg4)' },
  seekBuf: { position:'absolute', top:0, left:0, height:'100%', borderRadius:3, background:'var(--border)' },
  seekFill: { position:'absolute', top:0, left:0, height:'100%', borderRadius:3, background:'var(--accent)' },
  seekKnob: { position:'absolute', top:'50%', width:12, height:12, borderRadius:'50%', background:'var(--accent)', transform:'translate(-50%,-50%)' },
  times: { display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginTop:2 },
  fsControls: { display:'flex', alignItems:'center', justifyContent:'center', gap:26, margin:'16px 0 6px' },
  ctrlIcon: { color:'var(--text)', background:'none', border:'none', cursor:'pointer', display:'flex' },
  ctrlPlay: { width:58, height:58, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', boxShadow:'0 2px 12px rgba(var(--accent-rgb),.4)' },
  volAbs: { position:'absolute', right:0, top:'50%', transform:'translateY(-50%)' },
  volGroup: { display:'flex', alignItems:'center', gap:6 },
  volBtn: { color:'var(--text2)', background:'none', border:'none', cursor:'pointer', display:'flex', padding:2 },
  volSlider: { width:80, accentColor:'var(--accent)', cursor:'pointer', maxWidth:'22vw' },
  fsActions: { display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', paddingTop:14, marginTop:10, borderTop:'1px solid var(--border)' },
  act: { display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'var(--text2)', background:'none', border:'none', cursor:'pointer' },
  qMenu: { position:'absolute', bottom:'calc(100% + 8px)', right:0, minWidth:210, background:'rgba(20,20,20,.97)', border:'1px solid rgba(255,255,255,.15)', borderRadius:10, padding:6, zIndex:170, boxShadow:'0 8px 24px rgba(0,0,0,.5)' },
  upNext: { marginTop:24 },
  upHead: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  upTitle: { fontSize:14, fontWeight:700 },
  upCtl: { display:'flex', alignItems:'center', justifyContent:'center', padding:5, background:'none', border:'none', cursor:'pointer', borderRadius:6 },
  upRow: { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'6px 0', background:'none', border:'none', cursor:'pointer', color:'var(--text)' },
  upThumb: { width:56, height:40, borderRadius:6, objectFit:'cover', flexShrink:0, background:'var(--bg3)' },
  upRowTitle: { fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  upRowArtist: { fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  upEmpty: { fontSize:13, color:'var(--text3)' },

  // Video overlay controls (painted on the frame, auto-hiding).
  ovCenter: { position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:4, width:64, height:64, borderRadius:'50%', background:'rgba(0,0,0,.5)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', paddingLeft:4 },
  ovBar: { position:'absolute', left:0, right:0, bottom:0, zIndex:4, padding:'22px 12px 8px', background:'linear-gradient(0deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,.35) 55%, transparent 100%)', transition:'opacity .2s ease' },
  ovSeek: { padding:'8px 0', cursor:'pointer' },
  ovTrack: { position:'relative', height:4, borderRadius:3, background:'rgba(255,255,255,.28)' },
  ovBuf: { position:'absolute', top:0, left:0, height:'100%', borderRadius:3, background:'rgba(255,255,255,.45)' },
  ovFill: { position:'absolute', top:0, left:0, height:'100%', borderRadius:3, background:'var(--accent)' },
  ovKnob: { position:'absolute', top:'50%', width:13, height:13, borderRadius:'50%', background:'var(--accent)', transform:'translate(-50%,-50%)', boxShadow:'0 0 0 3px rgba(var(--accent-rgb),.35)' },
  ovRow: { display:'flex', alignItems:'center', gap:6, color:'#fff' },
  ovIcon: { color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:5, background:'none', border:'none', cursor:'pointer', flexShrink:0 },
  ovTime: { fontSize:12.5, color:'#fff', fontVariantNumeric:'tabular-nums', marginLeft:6, whiteSpace:'nowrap' },
  ovVol: { width:72, accentColor:'var(--accent)', cursor:'pointer' },
}
