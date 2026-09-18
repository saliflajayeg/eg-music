import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { claimSearchArtists, submitClaim, avatarUrl } from '../api'
import { Avatar } from '../components/Navbar'

// Public page: an artist who already has music on EG Music (an account a us
// created for them) requests to take it over. The admin reviews and hands over
// access. No email is sent automatically — this is a reviewed request.
export default function ClaimAccount() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)
  const [email, setEmail] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (picked) return
    clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(() => {
      setSearching(true)
      claimSearchArtists(q.trim())
        .then(r => setResults(r || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(timer.current)
  }, [q, picked])

  async function send() {
    setError('')
    if (!email.trim() && !contact.trim()) { setError('Deja tu correo o tu WhatsApp para poder responderte.'); return }
    setBusy(true)
    try {
      await submitClaim({ artist_user_id: picked.id, email: email.trim(), contact: contact.trim(), message: message.trim() })
      setSent(true)
    } catch (e) { setError(e.message || 'No se pudo enviar la solicitud.') }
    finally { setBusy(false) }
  }

  if (sent) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ fontSize:44, marginBottom:12 }}>✅</div>
        <h1 style={s.h1}>Solicitud enviada</h1>
        <p style={s.p}>Revisaremos que la cuenta de <b>{picked.display_name || picked.username}</b> es tuya y te
          contactaremos para darte el acceso. Gracias por ser parte de EG Music.</p>
        <Link to="/" style={s.btnPrimary}>Volver al inicio</Link>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.h1}>Reclama tu cuenta</h1>
        <p style={s.p}>¿Ya tienes música en EG Music pero no tienes acceso a tu cuenta? Búscala, deja tu contacto y
          te la entregamos tras verificar que eres el artista.</p>

        {!picked ? (
          <>
            <label style={s.label}>Busca tu nombre de artista</label>
            <input className="input" value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Ej. Bencruis, Kicko B…" autoFocus />
            <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
              {searching && <div style={s.muted}>Buscando…</div>}
              {!searching && results.map(a => (
                <button key={a.id} onClick={() => { setPicked(a); setResults([]); setQ('') }} style={s.result}>
                  <Avatar user={a} size={38} />
                  <div style={{ textAlign:'left', minWidth:0 }}>
                    <div style={s.rName}>{a.display_name || a.username}</div>
                    <div style={s.rSub}>@{a.username} · {a.track_count} {a.track_count === 1 ? 'tema' : 'temas'}</div>
                  </div>
                </button>
              ))}
              {!searching && q.trim().length >= 2 && results.length === 0 && (
                <div style={s.muted}>No encontramos ese artista. Revisa el nombre o escríbenos.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={s.pickedRow}>
              <Avatar user={picked} size={44} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={s.rName}>{picked.display_name || picked.username}</div>
                <div style={s.rSub}>@{picked.username}</div>
              </div>
              <button onClick={() => setPicked(null)} style={s.change}>Cambiar</button>
            </div>

            <label style={s.label}>Tu correo electrónico</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />

            <label style={s.label}>WhatsApp / contacto</label>
            <input className="input" value={contact} onChange={e => setContact(e.target.value)} placeholder="+240 …" />

            <label style={s.label}>Mensaje (opcional)</label>
            <textarea className="input" value={message} onChange={e => setMessage(e.target.value)} rows={3}
                      placeholder="Cuéntanos cómo verificar que eres tú (redes, etc.)" style={{ resize:'vertical' }} />

            {error && <div style={s.err}>{error}</div>}
            <button onClick={send} disabled={busy} style={{ ...s.btnPrimary, marginTop:14, opacity: busy ? .6 : 1 }}>
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </>
        )}

        <p style={{ ...s.muted, marginTop:16, textAlign:'center' }}>
          ¿Es una cuenta nueva? <Link to="/register" style={{ color:'var(--accent)', fontWeight:600 }}>Regístrate</Link>
        </p>
      </div>
    </div>
  )
}

const s = {
  wrap: { minHeight:'70vh', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'32px 16px 60px' },
  card: { width:'100%', maxWidth:440, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'26px 24px' },
  h1: { fontFamily:'var(--font-display)', fontSize:24, fontWeight:800, marginBottom:8 },
  p: { color:'var(--text2)', fontSize:14, lineHeight:1.5, marginBottom:18 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'var(--text2)', margin:'14px 0 6px' },
  result: { display:'flex', alignItems:'center', gap:11, padding:'8px 10px', borderRadius:10, background:'var(--bg3)', border:'1px solid var(--border)', cursor:'pointer', width:'100%' },
  rName: { fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  rSub: { fontSize:12, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  pickedRow: { display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:12, background:'var(--bg3)', border:'1px solid var(--border)', marginBottom:4 },
  change: { fontSize:12, fontWeight:600, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', flexShrink:0 },
  muted: { fontSize:13, color:'var(--text3)' },
  err: { color:'var(--danger)', fontSize:13, marginTop:12 },
  btnPrimary: { display:'inline-block', width:'100%', textAlign:'center', background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:15, border:'none', borderRadius:24, padding:'12px 20px', cursor:'pointer' },
}
