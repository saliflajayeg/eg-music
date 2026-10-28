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
          <p style={s.sub}>{data.live ? 'Lo que ganas con tu música en EG Music.' : 'Cómo ganarás dinero con tu música en EG Music.'}</p>
        </div>
        <select className="input" value={data.month} onChange={e => setMonth(e.target.value)} style={s.select}
          aria-label="Mes">
          {data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {!data.live && (
        <div style={s.notLive} role="note">
          <div style={{fontWeight:800,marginBottom:4}}>🚧 La monetización todavía no está activa</div>
          EG Music aún no paga regalías y, por ahora, el plan <strong>Amante es gratis</strong> para los oyentes.
          Esta página te enseña <strong>cómo se te pagará</strong> cuando empiece: las cifras son una <strong>simulación</strong>
          con tus escuchas reales, suponiendo que cada Amante pagara {fmtXAF(data.price)} al mes. No es dinero que se te deba.
        </div>
      )}

      <div style={s.hero}>
        <div style={s.heroLabel}>
          {data.live ? 'Ganado' : 'Simulación'} en {monthLabel(data.month).toLowerCase()}
        </div>
        <div style={{...s.heroAmount, opacity: data.live ? 1 : .75}}>{fmtXAF(data.amount)}</div>
        <div style={s.heroNote}>
          {!data.live ? 'Esto es lo que habrías ganado si la monetización ya estuviera activa. No es dinero real todavía.'
          : payout
            ? <span style={{color:'var(--accent)',fontWeight:700}}>✓ Pagado: {fmtXAF(payout.amount)}{payout.note ? ` · ${payout.note}` : ''}</span>
            : data.month === new Date().toISOString().slice(0, 7)
              ? 'Mes en curso: la cifra sube con cada escucha de pago.'
              : 'Pendiente de pago.'}
        </div>
      </div>

      <div style={s.stats}>
        <Stat value={data.paid_listeners} label={data.live ? 'Oyentes de pago' : 'Oyentes Amante'} />
        <Stat value={fmtN(data.paid_listens)} label={data.live ? 'Escuchas de pago' : 'Escuchas de Amantes'} />
        <Stat value={fmtN(data.free_listens)} label="Escuchas gratis" />
        <Stat value={fmtN(data.anon_listens)} label="Sin cuenta" />
      </div>

      <details style={s.how} open={!data.live}>
        <summary style={{cursor:'pointer',fontWeight:700}}>{data.live ? '¿Cómo se calcula?' : '¿Cómo te pagaremos?'}</summary>
        <ol style={s.howList}>
          <li>Cada <strong>oyente de pago</strong> (plan Amante) paga {fmtXAF(data.price)} al mes.
            {!data.live && ' (Por ahora el plan Amante es gratis; este será su precio cuando empiece la monetización.)'}</li>
          <li>El <strong>{data.artist_percent}%</strong> de lo que paga cada oyente ({fmtXAF(data.contribution_per_listener)}) es para los artistas.
            El resto mantiene la plataforma.</li>
          <li>Ese dinero se reparte <strong>solo entre los artistas que ese oyente escucha</strong>, según cuánto los escucha.
            Si un fan solo te escucha a ti, sus {fmtXAF(data.contribution_per_listener)} son tuyos.</li>
          <li>Una canción cuenta como escucha a partir de los <strong>30 segundos</strong>. En colaboraciones, cada escucha se divide
            según el porcentaje de cada artista.</li>
          <li>Las escuchas gratis y sin cuenta se muestran para que veas tu público, pero no generan dinero.
            Tus propias escuchas no cuentan.</li>
        </ol>
        <p style={s.howText}>
          <strong>Ejemplo:</strong> un fan escucha este mes 6 canciones tuyas y 4 de otro artista.
          De sus {fmtXAF(data.contribution_per_listener)}, el 60% ({fmtXAF(data.contribution_per_listener * 0.6)}) es para ti
          y el 40% ({fmtXAF(data.contribution_per_listener * 0.4)}) para el otro artista.
        </p>
        <p style={s.howText}><strong>Consejo:</strong> lo que más te hace ganar es tener muchos fans que paguen y te escuchen a menudo.
          Comparte tus canciones y anima a tu público a hacerse Amante.</p>
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
                  {l.paid ? <span style={s.paidTag}>{data.live ? 'De pago' : 'Amante'}</span> : <span style={s.freeTag}>Gratis</span>}
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
      {!data.live ? <p style={s.empty}>Los pagos empezarán cuando se active la monetización. Te avisaremos.</p>
      : data.payouts.length === 0 ? <p style={s.empty}>Todavía no hay pagos registrados.</p> : (
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
  notLive: {background:'rgba(245,180,0,.12)',border:'1px solid rgba(245,180,0,.45)',color:'var(--text)',borderRadius:12,padding:'14px 16px',fontSize:13,lineHeight:1.55,marginBottom:12},
  howList: {color:'var(--text2)',fontSize:13,lineHeight:1.6,margin:'10px 0 0',paddingLeft:20,display:'flex',flexDirection:'column',gap:6},
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
