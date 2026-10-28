import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyRoyalties } from '../api'
import { useAuth } from '../context/AuthContext'

// "Mis regalías": lo que gana el artista. Cada oyente de pago (plan Amante)
// reparte su parte entre los artistas que él escucha, según cuánto los escucha.
// 2394 -> "2.394" (es-ES no agrupa los números de 4 cifras por defecto)
const group = n => {
  const [i, d] = String(n).split('.')
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : '')
}
export const fmtXAF = n => `${group(Math.round(n || 0))} XAF`
export const fmtN = n => group(Math.round((n || 0) * 10) / 10)
export function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number)
  const s = new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function Royalties() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [month, setMonth] = useState('')
  const [data, setData]   = useState(null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!user) return
    setError('')
    getMyRoyalties(month).then(d => { setData(d); if (!month) setMonth(d.month) })
      .catch(e => setError(e.message))
  }, [user, month])

  if (!user) return (
    <div style={s.center}>
      <p style={{marginBottom:12}}>Inicia sesión para ver tus regalías.</p>
      <button className="btn-primary" onClick={() => navigate('/login')}>Iniciar sesión</button>
    </div>
  )
  if (error) return <div style={s.center}><p style={{color:'var(--danger)'}}>{error}</p></div>
  if (!data) return <div style={s.center}><p style={{color:'var(--text3)'}}>Cargando...</p></div>

  const payout = data.payouts.find(p => p.month === data.month)
  const listeners = showAll ? data.listeners : data.listeners.slice(0, 12)
  const totalListens = data.paid_listens + data.free_listens + data.anon_listens

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>Mis regalías</h1>
          <p style={s.sub}>Lo que ganas con tu música en EG Music.</p>
        </div>
        <select className="input" value={data.month} onChange={e => setMonth(e.target.value)} style={s.select}
          aria-label="Mes">
          {data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div style={s.hero}>
        <div style={s.heroLabel}>Ganado en {monthLabel(data.month).toLowerCase()}</div>
        <div style={s.heroAmount}>{fmtXAF(data.amount)}</div>
        <div style={s.heroNote}>
          {payout
            ? <span style={{color:'var(--accent)',fontWeight:700}}>✓ Pagado: {fmtXAF(payout.amount)}{payout.note ? ` · ${payout.note}` : ''}</span>
            : data.month === new Date().toISOString().slice(0, 7)
              ? 'Mes en curso: la cifra sube con cada escucha de pago.'
              : 'Pendiente de pago.'}
        </div>
      </div>

      <div style={s.stats}>
        <Stat value={data.paid_listeners} label="Oyentes de pago" />
        <Stat value={fmtN(data.paid_listens)} label="Escuchas de pago" />
        <Stat value={fmtN(data.free_listens)} label="Escuchas gratis" />
        <Stat value={fmtN(data.anon_listens)} label="Sin cuenta" />
      </div>

      <details style={s.how}>
        <summary style={{cursor:'pointer',fontWeight:700}}>¿Cómo se calcula?</summary>
        <p style={s.howText}>
          Cada oyente de pago paga {fmtXAF(data.price)} al mes. El {data.artist_percent}% ({fmtXAF(data.contribution_per_listener)})
          se reparte <strong>solo entre los artistas que ese oyente escucha</strong>, según cuánto los escucha.
          Una canción cuenta como escucha a partir de los 30 segundos. En colaboraciones, cada escucha se divide según
          el porcentaje de cada artista. Las escuchas gratis y sin cuenta se muestran, pero no generan dinero.
          Tus propias escuchas no cuentan.
        </p>
      </details>

      <h2 style={s.h2}>Quién te escucha</h2>
      {data.listeners.length === 0 && data.anon_listens === 0 ? (
        <p style={s.empty}>Todavía nadie te ha escuchado este mes.</p>
      ) : (
        <div style={s.list}>
          {listeners.map(l => (
            <Link key={l.listener_id} to={`/user/${l.listener_id}`} style={s.row}>
              <div style={{flex:1,minWidth:0}}>
                <div style={s.rowTitle}>{l.name || l.username || 'Usuario'}</div>
                <div style={s.rowSub}>
                  {l.paid ? <span style={s.paidTag}>De pago</span> : <span style={s.freeTag}>Gratis</span>}
                  {' '}{fmtN(l.listens)} {l.listens === 1 ? 'escucha' : 'escuchas'}
                </div>
              </div>
              <div style={s.rowAmount}>{l.paid ? fmtXAF(l.amount) : '—'}</div>
            </Link>
          ))}
          {data.anon_listens > 0 && (
            <div style={s.row}>
              <div style={{flex:1}}>
                <div style={s.rowTitle}>Personas sin cuenta</div>
                <div style={s.rowSub}>{fmtN(data.anon_listens)} escuchas</div>
              </div>
              <div style={s.rowAmount}>—</div>
            </div>
          )}
          {data.listeners.length > 12 && (
            <button onClick={() => setShowAll(v => !v)} style={s.more}>
              {showAll ? 'Ver menos' : `Ver los ${data.listeners.length} oyentes`}
            </button>
          )}
        </div>
      )}

      <h2 style={s.h2}>Por canción</h2>
      {data.tracks.length === 0 ? <p style={s.empty}>Sin escuchas este mes.</p> : (
        <div style={s.list}>
          {data.tracks.map(t => (
            <Link key={t.track_id} to={`/track/${t.track_id}`} style={s.row}>
              <div style={{flex:1,minWidth:0}}>
                <div style={s.rowTitle}>{t.title}</div>
                <div style={s.rowSub}>
                  {fmtN(t.paid_listens)} de pago · {fmtN(t.free_listens)} gratis · {fmtN(t.anon_listens)} sin cuenta
                </div>
              </div>
              <div style={s.rowAmount}>{fmtXAF(t.amount)}</div>
            </Link>
          ))}
        </div>
      )}

      <h2 style={s.h2}>Historial de pagos</h2>
      {data.payouts.length === 0 ? <p style={s.empty}>Todavía no hay pagos registrados.</p> : (
        <div style={s.list}>
          {data.payouts.map(p => (
            <div key={p.id} style={s.row}>
              <div style={{flex:1}}>
                <div style={s.rowTitle}>{monthLabel(p.month)}</div>
                <div style={s.rowSub}>Pagado el {p.paid_at.slice(0, 10)}{p.note ? ` · ${p.note}` : ''}</div>
              </div>
              <div style={s.rowAmount}>{fmtXAF(p.amount)}</div>
            </div>
          ))}
        </div>
      )}
      {totalListens === 0 && data.tracks.length === 0 && user.account_type !== 'artist' && (
        <p style={{...s.empty,marginTop:24}}>Las regalías son para cuentas de artista.</p>
      )}
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div style={s.stat}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

const s = {
  page: {padding:'24px 16px 48px',maxWidth:760,margin:'0 auto'},
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh',flexDirection:'column',padding:16},
  head: {display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12,flexWrap:'wrap',marginBottom:18},
  h1: {fontSize:24,fontWeight:800},
  sub: {color:'var(--text2)',fontSize:14,marginTop:4},
  select: {width:'auto',minWidth:170},
  hero: {background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:14,padding:'22px 20px',marginBottom:12},
  heroLabel: {fontSize:13,color:'var(--text2)',fontWeight:600},
  heroAmount: {fontSize:34,fontWeight:800,margin:'6px 0',fontVariantNumeric:'tabular-nums'},
  heroNote: {fontSize:13,color:'var(--text3)'},
  stats: {display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))',gap:10,marginBottom:12},
  stat: {background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px'},
  statValue: {fontSize:20,fontWeight:800,fontVariantNumeric:'tabular-nums'},
  statLabel: {fontSize:12,color:'var(--text3)',marginTop:2},
  how: {background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 16px',fontSize:14},
  howText: {color:'var(--text2)',fontSize:13,lineHeight:1.6,marginTop:8},
  h2: {fontSize:17,fontWeight:700,margin:'26px 0 10px'},
  list: {display:'flex',flexDirection:'column',gap:6},
  row: {display:'flex',alignItems:'center',gap:12,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'11px 14px',color:'var(--text)',textDecoration:'none'},
  rowTitle: {fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'},
  rowSub: {fontSize:12,color:'var(--text3)',marginTop:2},
  rowAmount: {fontWeight:700,fontVariantNumeric:'tabular-nums',flexShrink:0},
  paidTag: {color:'var(--accent)',fontWeight:700},
  freeTag: {color:'var(--text2)',fontWeight:600},
  empty: {color:'var(--text3)',fontSize:14},
  more: {color:'var(--text2)',fontSize:13,fontWeight:600,padding:'8px 0',background:'none',border:'none',cursor:'pointer',alignSelf:'flex-start'},
}
