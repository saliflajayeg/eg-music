import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSubInfo, getMySubRequest, requestSub } from '../api'
import { useAuth } from '../context/AuthContext'
import { PLAN_LABEL } from '../plans'

export default function Subscribe() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [info, setInfo]         = useState(null)
  const [myReq, setMyReq]       = useState(null)
  const [selected, setSelected] = useState(null) // 'amante' | 'pro' | 'premium'
  const [note, setNote]         = useState('')
  const [receipt, setReceipt]   = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    getSubInfo().then(setInfo).catch(() => {})
    if (user) getMySubRequest().then(setMyReq).catch(() => {})
  }, [user])

  if (!user) return (
    <div style={s.center}>
      <p style={{marginBottom:12}}>Inicia sesión para ver los planes.</p>
      <button className="btn-primary" onClick={() => navigate('/login')}>Iniciar sesión</button>
    </div>
  )

  function handleReceipt(e) {
    const f = e.target.files[0]
    if (!f) return
    setReceipt(f)
    setReceiptPreview(URL.createObjectURL(f))
  }

  async function submit(e) {
    e.preventDefault()
    if (!receipt) { setError('Sube la foto de tu recibo de Muni Dinero'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('plan', selected)
      fd.append('note', note.trim())
      fd.append('receipt', receipt)
      await requestSub(fd)
      setSent(true)
      setMyReq({ status:'pending', plan: selected, note: note.trim() })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pendingPlan = (myReq?.status === 'pending' || sent) ? (myReq?.plan || selected) : null

  if (pendingPlan) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={{fontSize:40,marginBottom:12}}>⏳</div>
        <h2 style={{marginBottom:8}}>Solicitud de plan {PLAN_LABEL[pendingPlan]} enviada</h2>
        <p style={{color:'var(--text2)',textAlign:'center',maxWidth:340}}>
          Tu solicitud está pendiente de revisión por el administrador. Te activarán el plan cuando confirmen el pago.
        </p>
      </div>
    </div>
  )

  if (myReq?.status === 'rejected' && !selected) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={{fontSize:40,marginBottom:12}}>❌</div>
        <h2 style={{marginBottom:8}}>Solicitud rechazada</h2>
        <p style={{color:'var(--text2)',marginBottom:16}}>{myReq.review_note || 'Contacta al administrador para más info.'}</p>
        <button className="btn-primary" onClick={() => setSelected(myReq.plan || 'amante')}>Intentar de nuevo</button>
      </div>
    </div>
  )

  const PRICE = {
    amante:  info?.amante_price,
    pro:     info?.pro_price,
    premium: info?.premium_price,
  }
  const COLOR = {
    amante:  '#8b5cf6',
    pro:     'var(--blue)',
    premium: 'var(--gold)',
  }

  // Payment step for a chosen plan
  if (selected) {
    return (
      <div style={{padding:'24px 16px 40px',maxWidth:580,margin:'0 auto'}}>
        <button onClick={() => setSelected(null)} style={s.backBtn}>← Volver a los planes</button>
        <h1 style={{fontSize:22,fontWeight:700,marginBottom:6}}>Solicitar plan {PLAN_LABEL[selected]}</h1>
        <p style={{color:'var(--text2)',marginBottom:20,fontSize:14}}>
          Paga con <strong style={{color:'var(--text)'}}>Muni Dinero</strong>, sube la foto del recibo y
          un administrador activará tu plan.
        </p>

        <div style={{...s.priceBox, borderColor: COLOR[selected]}}>
          <div style={{fontSize:28,fontWeight:800,color: COLOR[selected]}}>{PRICE[selected]}</div>
        </div>

        {info && (
          <div style={s.instructions}>
            <h3 style={{fontWeight:700,marginBottom:10}}>📱 Cómo pagar con Muni Dinero</h3>
            <pre style={{whiteSpace:'pre-wrap',fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
              {info.instructions}
            </pre>
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:12}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text2)'}}>Foto del recibo de pago *</label>
          <label style={s.receiptLabel}>
            {receiptPreview ? (
              <img src={receiptPreview} style={s.receiptPreview} alt="recibo" />
            ) : (
              <div style={s.receiptPlaceholder}>
                <div style={{fontSize:30}}>📷</div>
                <span style={{fontSize:13,color:'var(--text3)',marginTop:6}}>
                  Toca para subir la foto o captura del recibo de Muni Dinero
                </span>
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleReceipt} style={{display:'none'}} />
          </label>

          <label style={{fontSize:13,fontWeight:600,color:'var(--text2)'}}>Nota (opcional)</label>
          <textarea className="input" rows={2}
            placeholder="Ej: Pago enviado desde el número 555 123 456..."
            value={note} onChange={e => setNote(e.target.value)} style={{resize:'vertical'}} />
          <button className="btn-primary" type="submit" disabled={loading || !receipt}
            style={{alignSelf:'flex-start',padding:'11px 28px',opacity: !receipt ? .55 : 1}}>
            {loading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    )
  }

  const dl = info?.paid_download_limit || 30
  const proUp = info?.pro_upload_limit || 8
  const premUp = info?.premium_upload_limit || 15
  const freeDl = info?.free_download_limit || 3

  const choose = p => user.plan === p ? null : () => setSelected(p)

  return (
    <div style={{padding:'24px 16px 40px',maxWidth:960,margin:'0 auto'}}>
      <h1 style={{fontSize:24,fontWeight:700,marginBottom:6,textAlign:'center'}}>Elige tu plan</h1>
      <p style={{color:'var(--text2)',marginBottom:24,fontSize:14,textAlign:'center'}}>
        Planes para escuchar y para artistas que quieren compartir su música.
      </p>

      <h2 style={s.groupTitle}>🎧 Para oyentes</h2>
      <div style={s.grid}>
        <PlanCard name="Gratis" color="var(--text2)" price="Gratis"
          features={[`${freeDl} descargas`, 'Escucha canciones y videos', 'Solo reproducir/pausar (sin saltar)']}
          current={user.plan === 'free'} />
        <PlanCard name="Amante de la música" color="#8b5cf6" price={PRICE.amante}
          features={['Escucha sin límites', `${dl} descargas al mes`, 'Control total del reproductor']}
          current={user.plan === 'amante'} onSelect={choose('amante')} />
      </div>

      <h2 style={{...s.groupTitle, marginTop:28}}>🎤 Para artistas</h2>
      <div style={s.grid}>
        <PlanCard name="Pro" color="var(--blue)" price={PRICE.pro}
          features={['Escucha sin límites', `${dl} descargas al mes`, `Sube ${proUp} canciones o videos al mes`]}
          current={user.plan === 'pro'} onSelect={choose('pro')} />
        <PlanCard name="Premium" color="var(--gold)" price={PRICE.premium}
          features={['Escucha y videos sin límites', 'Descargas ilimitadas', `Sube ${premUp} canciones o videos al mes`]}
          current={user.plan === 'premium'} onSelect={choose('premium')} gold />
      </div>
    </div>
  )
}

function PlanCard({ name, color, price, features, current, onSelect, gold }) {
  return (
    <div style={{...s.planCard, borderColor: current ? color : 'var(--border)'}}>
      <div style={{fontSize:13,fontWeight:700,color,letterSpacing:.3,textTransform:'uppercase'}}>{name}</div>
      <div style={{fontSize:24,fontWeight:800,margin:'8px 0 4px'}}>{price ?? '—'}</div>
      <ul style={s.featureList}>
        {features.map((f,i) => <li key={i} style={s.featureItem}>✓ {f}</li>)}
      </ul>
      {current ? (
        <div style={{...s.currentTag, color, borderColor: color}}>Tu plan actual</div>
      ) : onSelect ? (
        gold
          ? <button onClick={onSelect} style={s.goldBtn}>Elegir {name}</button>
          : <button onClick={onSelect} className="btn-primary" style={{width:'100%'}}>Elegir {name}</button>
      ) : null}
    </div>
  )
}

const s = {
  center: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh',flexDirection:'column',gap:8,padding:16},
  card: {display:'flex',flexDirection:'column',alignItems:'center',padding:32,background:'var(--bg2)',borderRadius:12,border:'1px solid var(--border)'},
  backBtn: {color:'var(--text2)',fontSize:13,marginBottom:16,fontWeight:600},
  priceBox: {background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'20px 24px',marginBottom:20,textAlign:'center'},
  instructions: {background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:20,marginBottom:20},
  error: {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:12,fontSize:13},
  groupTitle: {fontSize:15,fontWeight:700,marginBottom:12,color:'var(--text)'},
  grid: {display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(215px,1fr))',gap:16},
  planCard: {background:'var(--bg2)',border:'2px solid var(--border)',borderRadius:14,padding:'20px 18px',display:'flex',flexDirection:'column'},
  featureList: {listStyle:'none',display:'flex',flexDirection:'column',gap:8,margin:'14px 0 18px',flex:1,padding:0},
  featureItem: {fontSize:13,color:'var(--text2)'},
  currentTag: {textAlign:'center',fontWeight:700,fontSize:13,padding:'9px 0',border:'1px solid',borderRadius:8},
  goldBtn: {width:'100%',background:'linear-gradient(135deg, var(--gold), #ffe27a)',color:'#3a2b00',fontWeight:700,padding:'10px 22px',borderRadius:8,fontSize:14,border:'none',cursor:'pointer'},
  receiptLabel: {display:'block',border:'2px dashed var(--border)',borderRadius:10,overflow:'hidden',cursor:'pointer',minHeight:120},
  receiptPreview: {width:'100%',maxHeight:280,objectFit:'contain',display:'block'},
  receiptPlaceholder: {display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'28px 16px',textAlign:'center'},
}
