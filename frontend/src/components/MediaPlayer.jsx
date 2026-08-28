import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useMedia } from '../context/MediaContext'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks'
import { trackStreamUrl, trackCoverUrl, likeTrack } from '../api'
import { shareTrack } from '../share'
import { localSrc, isDownloaded, queuePlay, isNative, downloadMedia, deleteDownload } from '../offline'
import ArtistLine from './ArtistLine'
import Comments from './Comments'

const HEADER_H = 52
const _resumeAt = {}   // last position per track, kept across src/quality swaps

// Equalizer keyframes for the audio frame (flag colors). Injected once; the
// reduced-motion guard can't live in an inline style so it goes here.
if (typeof document !== 'undefined' && !document.getElementById('eg-player-css')) {
  const st = document.createElement('style')
  st.id = 'eg-player-css'
  st.textContent = '@keyframes egEq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}' +
    '.eg-eq span{transform-origin:bottom}' +
    '@media (prefers-reduced-motion:reduce){.eg-eq span{animation:none!important;transform:scaleY(.55)}}'
  document.head.appendChild(st)
}

// A little "now playing" life for audio, so a song never feels lesser than a
// video at the same frame size. Bars use the EG flag palette.
const _EQ = [0, .18, .32, .06, .24, .38, .12, .28]
function Equalizer() {
  return (
    <div className="eg-eq" aria-hidden="true"
      style={{ position:'absolute', left:0, right:0, bottom:'6%', zIndex:2, height:'14%',
               display:'flex', gap:4, alignItems:'flex-end', justifyContent:'center', pointerEvents:'none', opacity:.9 }}>
      {_EQ.map((d, i) => (
        <span key={i} style={{ width:5, height:'100%', borderRadius:4,
          background: i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--blue)' : 'var(--gold)',
          animation:`egEq 1.05s ease-in-out ${d}s infinite` }} />
      ))}
    </div>
  )
}

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

export default function MediaPlayer() {
  const media = useMedia()
  const { current, queue, index, isPlaying, expanded,
          next, prev, collapse, expand, close, _apiRef, _setIsPlaying } = media
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

  const countedRef = useRef(false)
  const lastIdRef  = useRef(null)
  const localPlayedRef = useRef(false)
  const usingSd = isVideo && (quality === 'sd' || (quality === 'auto' && sdReady && (connectionPrefersSd() || stalls >= 2)))

  // Like / download state per track.
  useEffect(() => {
    setLiked(!!current.liked_by_me); setLikeCount(current.like_count || 0)
    if (isNative()) isDownloaded(current.id).then(d => setDl(d ? 'done' : 'none')); else setDl('none')
  }, [current.id])

  // Navigating (tapping Explorar, a link, search…) minimizes the player so you
  // land on the new page — but not right after opening (guards deep-link opens).
  const lastPathRef = useRef(location.pathname)
  useEffect(() => {
    if (location.pathname !== lastPathRef.current) {
      lastPathRef.current = location.pathname
      if (expanded && Date.now() - media._openedAtRef.current > 1200) collapse()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

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
    const onEnd = () => next()
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
  }, [current.id, isLocal, quality, usingSd])

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
  const frameStyle = !expanded
    ? { position:'fixed', bottom:(isMobile?12:20), left:(isMobile?10:12), width:(isMobile?72:107), height:(isMobile?40:60), borderRadius:6, overflow:'hidden', background:'#000', zIndex:160, cursor:'pointer' }
    : wide
      ? { position:'fixed', top:HEAD+18, left:STAGE_LEFT, height:mediaH, width:mediaW, borderRadius:12, overflow:'hidden', background:'#000', zIndex:160 }
      : { position:'fixed', top:HEAD, left:0, right:0, width:'100%', height:mMediaH, overflow:'hidden', background:'#000', zIndex:160 }

  const mediaSurface = (
    <div key="media-surface" ref={wrapRef} style={frameStyle}
         onClick={() => { if (!expanded) expand(); else if (isVideo) { const v=videoRef.current; v && (v.paused? v.play().catch(()=>{}) : v.pause()) } }}>
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
              style={{ position:'absolute', top:'42%', left:'50%', transform:'translate(-50%,-50%)', height:'64%', aspectRatio:'1', objectFit:'cover', borderRadius:12, boxShadow:'0 16px 40px -12px rgba(0,0,0,.75)' }} />
            {isPlaying && <Equalizer />}
          </>
      )}
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

  const volumeControl = (
    <div style={s.volGroup}>
      <button onClick={toggleMute} style={s.volBtn} title={muted||vol===0 ? 'Activar sonido' : 'Silenciar'} aria-label="Volumen">
        {muted||vol===0 ? <IcoVolMute/> : <IcoVol/>}
      </button>
      <input type="range" min={0} max={1} step={0.02} value={muted?0:vol}
        onChange={e => setVolume(Number(e.target.value))} style={s.volSlider} aria-label="Volumen" />
    </div>
  )

  const infoBlock = (
    <>
      <h1 style={s.fsTitle}>{current.title}</h1>
      <div style={s.fsMeta}>
        <ArtistLine track={current} style={s.fsArtist} showSplit={(current.artists||[]).length>1} />
        {current.genre && <span style={s.fsGenre}>{current.genre}</span>}
        <span style={s.fsViews}>{isVideo?'👁':'▶'} {current.play_count}</span>
      </div>

      <div style={s.seekWrap} onMouseDown={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const go = ev => seekTo(Math.min(1, Math.max(0, (ev.clientX-rect.left)/rect.width)) * dur)
        go(e)
        const move = ev => go(ev), up = () => { window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
        window.addEventListener('mousemove',move); window.addEventListener('mouseup',up)
      }}>
        <div style={s.seekTrack}>
          <div style={{ ...s.seekBuf, width:`${bufPct}%` }} />
          <div style={{ ...s.seekFill, width:`${pct}%` }} />
          <div style={{ ...s.seekKnob, left:`${pct}%` }} />
        </div>
      </div>
      <div style={s.times}><span>{fmt(cur)}</span><span>{fmt(dur)}</span></div>

      <div style={{ ...s.fsControls, position:'relative' }}>
        <button onClick={() => _apiRef.current.prev?.()} style={s.ctrlIcon} title="Anterior"><IcoPrev /></button>
        <button onClick={() => _apiRef.current.toggle?.()} style={s.ctrlPlay}>{isPlaying?<IcoPause big/>:<IcoPlay big/>}</button>
        <button onClick={next} style={s.ctrlIcon} title="Siguiente"><IcoNext /></button>
        <div style={s.volAbs}>{volumeControl}</div>
      </div>

      <div style={s.fsActions}>
        <button onClick={handleLike} style={{ ...s.act, color: liked?'var(--danger)':'var(--text2)' }}>{liked?'♥':'♡'} {likeCount>0?likeCount:''}</button>
        <button onClick={handleShare} style={s.act}><IcoShare /> Compartir</button>
        {isNative() && <button onClick={handleDownload} style={{ ...s.act, color:'var(--accent2)' }}>{dl==='busy'?'⏳':dl==='done'?'✓':'⬇'} {dl==='done'?'Descargado':'Descargar'}</button>}
        {isVideo && (
          <div style={{ position:'relative' }}>
            <button onClick={() => setMenuOpen(m=>!m)} style={s.act}>
              {quality==='auto'?`Auto${usingSd?' · 480p':''}`:quality==='sd'?'480p':'Alta'}
            </button>
            {menuOpen && (
              <div style={s.qMenu}>
                <QItem label="Auto (ajusta a tu red)" active={quality==='auto'} onClick={()=>pickQuality('auto')} />
                <QItem label="Alta (original)" active={quality==='high'} onClick={()=>pickQuality('high')} />
                <QItem label={`480p · ahorro de datos${sdReady?'':' (preparando…)'}`} active={quality==='sd'} disabled={!sdReady} onClick={()=>sdReady&&pickQuality('sd')} />
              </div>
            )}
          </div>
        )}
        {isVideo && document.pictureInPictureEnabled && <button onClick={togglePip} style={s.act} title="PiP"><IcoPip /></button>}
        {isVideo && <button onClick={toggleFullscreen} style={s.act} title="Pantalla completa"><IcoFull /></button>}
      </div>
    </>
  )

  const upNextBlock = (
    <div style={s.upNext}>
      <div style={s.upTitle}>A continuación</div>
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
          <div style={{ ...s.fsLeft, top: HEAD, left: STAGE_LEFT, width: MAIN_W, paddingTop:`calc(${mediaH} + 36px)` }}>
            {infoBlock}
            {commentsBlock}
          </div>
          <div style={{ ...s.fsRight, top: HEAD, left:`calc(${STAGE_LEFT} + ${MAIN_W} + ${GAP}px)`, width: RAILW }}>
            {upNextBlock}
          </div>
        </>
      ) : (
        <div style={{ ...s.fsBody, top: HEAD, paddingTop: contentPad }}>
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
  upTitle: { fontSize:14, fontWeight:700, marginBottom:10 },
  upRow: { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'6px 0', background:'none', border:'none', cursor:'pointer', color:'var(--text)' },
  upThumb: { width:56, height:40, borderRadius:6, objectFit:'cover', flexShrink:0, background:'var(--bg3)' },
  upRowTitle: { fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  upRowArtist: { fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  upEmpty: { fontSize:13, color:'var(--text3)' },
}
