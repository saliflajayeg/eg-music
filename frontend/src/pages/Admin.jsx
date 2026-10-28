import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminStats, adminUsers, adminUpdateUser, adminResetPassword, adminUserActivity, adminTracks, deleteTrack, trackCoverUrl,
  adminSubs, adminReviewSub, adminReceiptUrl, adminClaims, adminReviewClaim,
  adminGetSettings, adminSaveSettings, adminRoyalties, adminMarkPayout,
} from '../api'
import { fmtXAF, fmtN, monthLabel } from './Royalties'
import { useAuth } from '../context/AuthContext'

export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('subs')
  const [stats, setStats] = useState(null)
  const [userFilter, setUserFilter] = useState('all')   // plan filter for the Users tab

  // A stat card jumps to the matching section (and filters users by plan).
  const go = (t, filter) => { if (filter) setUserFilter(filter); setTab(t) }

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return }
    adminStats().then(setStats).catch(() => {})
  }, [user])

  if (!user?.is_admin) return null

  return (
    <div style={{padding:'24px 28px',maxWidth:1000,margin:'0 auto'}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Panel de administración</h1>

      {stats && (
        <div style={s.statsRow}>
          {[['Usuarios',stats.users,'var(--accent)',()=>go('users','all')],
            ['Canciones',stats.tracks,'var(--accent)',()=>go('songs')],
            ['Reproducciones',stats.plays,'var(--accent)',()=>go('songs')],
            ['Amante',stats.amante_users,'#8b5cf6',()=>go('users','amante')],
            ['Pro',stats.pro_users,'var(--blue)',()=>go('users','pro')],
            ['Premium',stats.premium_users,'var(--gold)',()=>go('users','premium')],
            ['Pendientes',stats.pending_subscriptions,'var(--danger)',()=>go('subs')]].map(([l,v,c,onClick]) => (
            <button key={l} onClick={onClick} style={s.statCard}>
              <div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>{l} ›</div>
            </button>
          ))}
        </div>
      )}

      <div style={s.tabs}>
        {['subs','claims','users','songs','earnings','settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:600,
            background:tab===t?'var(--accent)':'var(--bg3)',
            color:tab===t?'#fff':'var(--text2)',
            border:'1px solid var(--border)',cursor:'pointer',
          }}>
            {t==='subs'?'Suscripciones':t==='claims'?'Reclamos':t==='users'?'Usuarios':t==='songs'?'Canciones':t==='earnings'?'Regalías':'Configuración'}
            {t==='subs' && stats?.pending_subscriptions > 0 && (
              <span style={s.badge}>{stats.pending_subscriptions}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'subs'     && <SubsPanel onRefresh={() => adminStats().then(setStats)} />}
      {tab === 'claims'   && <ClaimsPanel />}
      {tab === 'users'    && <UsersPanel filter={userFilter} setFilter={setUserFilter} />}
      {tab === 'songs'    && <SongsPanel onChange={() => adminStats().then(setStats)} />}
      {tab === 'earnings' && <EarningsPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  )
}

function SubsPanel({ onRefresh }) {
  const [reqs, setReqs]   = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [filter])

  function load() {
    setLoading(true)
    adminSubs(filter).then(setReqs).catch(() => {}).finally(() => setLoading(false))
  }

  async function review(id, status) {
    const note = status === 'rejected' ? prompt('Motivo del rechazo (opcional):') || '' : ''
    await adminReviewSub(id, { status, note })
    load(); onRefresh()
  }

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {['pending','approved','rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,
            background:filter===f?'var(--bg3)':'transparent',
            border:'1px solid var(--border)',cursor:'pointer',color:'var(--text2)',
          }}>
            {f==='pending'?'Pendiente':f==='approved'?'Aprobado':'Rechazado'}
          </button>
        ))}
      </div>

      {loading ? <p style={{color:'var(--text3)'}}>Cargando...</p> :
       reqs.length === 0 ? <p style={{color:'var(--text3)'}}>Sin solicitudes.</p> : (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {reqs.map(r => (
            <div key={r.id} style={s.reqCard}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{fontWeight:600}}>{r.display_name || r.username}</div>
                  <span className={PLAN_BADGE[r.plan] || 'badge-plan-pro'}>
                    {(r.plan || 'pro').toUpperCase()}
                  </span>
                </div>
                <div style={{fontSize:12,color:'var(--text3)'}}>{r.email} · {r.created_at?.slice(0,16)}</div>
                {r.note && <div style={{fontSize:13,color:'var(--text2)',marginTop:6,fontStyle:'italic'}}>"{r.note}"</div>}
                {r.receipt && <ReceiptViewer reqId={r.id} />}
                {r.review_note && <div style={{fontSize:12,color:'var(--danger)',marginTop:4}}>Motivo: {r.review_note}</div>}
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                {r.status === 'pending' && <>
                  <button style={s.approveBtn} onClick={() => review(r.id,'approved')}>✓ Aprobar</button>
                  <button style={s.rejectBtn}  onClick={() => review(r.id,'rejected')}>✕ Rechazar</button>
                </>}
                {r.status !== 'pending' && (
                  <span style={{
                    padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:600,
                    background:r.status==='approved'?'rgba(34,197,94,.15)':'rgba(var(--danger-rgb),.15)',
                    color:r.status==='approved'?'#22c55e':'var(--danger)',
                  }}>
                    {r.status==='approved'?'Aprobado':'Rechazado'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReceiptViewer({ reqId }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (url) { setUrl(null); return }
    setLoading(true)
    try { setUrl(await adminReceiptUrl(reqId)) }
    catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{marginTop:8}}>
      <button onClick={toggle} style={{
        fontSize:12,fontWeight:600,color:'var(--accent2)',cursor:'pointer',
        background:'var(--bg3)',border:'1px solid var(--border)',
        borderRadius:6,padding:'5px 12px',
      }}>
        {loading ? 'Cargando...' : url ? 'Ocultar recibo' : '📄 Ver recibo de pago'}
      </button>
      {url && (
        <img src={url} alt="recibo de pago" style={{
          display:'block',marginTop:10,maxWidth:340,maxHeight:420,
          borderRadius:8,border:'1px solid var(--border)',objectFit:'contain',
        }} />
      )}
    </div>
  )
}

const PLANS = ['free', 'amante', 'pro', 'premium']
const PLAN_BADGE = { amante: 'badge-plan-amante', pro: 'badge-plan-pro', premium: 'badge-plan-premium' }

function UsersPanel({ filter = 'all', setFilter }) {
  const [users, setUsers] = useState([])
  const [q, setQ]         = useState('')
  const [sort, setSort]   = useState('recent')   // recent | seen | listens
  const [actFor, setActFor] = useState(null)     // id con la ficha de actividad abierta
  const [pwFor, setPwFor] = useState(null)   // id del usuario con el formulario de contraseña abierto
  const [pwVal, setPwVal] = useState('')
  const [pwDone, setPwDone] = useState({})   // id -> {username,email,password}
  const [pwErr, setPwErr] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const { user: me } = useAuth()

  useEffect(() => { adminUsers().then(setUsers).catch(() => {}) }, [])

  const term = q.trim().toLowerCase()
  const shown = (filter === 'all' ? users : users.filter(u => (u.plan || 'free') === filter))
    .filter(u => !term || [u.username, u.display_name, u.email].some(v => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => sort === 'seen' ? (b.last_seen_at || '').localeCompare(a.last_seen_at || '')
                  : sort === 'listens' ? (b.listens_month || 0) - (a.listens_month || 0) : 0)

  async function resetPassword(u, generate) {
    setPwErr('')
    if (!generate && pwVal.trim().length < 6) { setPwErr('Mínimo 6 caracteres'); return }
    setPwBusy(true)
    try {
      const r = await adminResetPassword(u.id, generate ? null : pwVal.trim())
      setPwDone(d => ({ ...d, [u.id]: r }))
      setPwFor(null); setPwVal('')
    } catch (e) { setPwErr(e.message) }
    finally { setPwBusy(false) }
  }

  function copyCreds(r) {
    const text = `EG Music — tu nueva contraseña\nUsuario: ${r.username}\nContraseña: ${r.password}\nCámbiala cuando entres, en Mi cuenta.`
    try { navigator.clipboard.writeText(text) } catch {}
  }

  async function setPlan(uid, plan) {
    await adminUpdateUser(uid, { plan })
    setUsers(us => us.map(u => u.id===uid ? {...u, plan} : u))
  }

  async function toggleAdmin(uid, val) {
    await adminUpdateUser(uid, { is_admin: val ? 0 : 1 })
    setUsers(us => us.map(u => u.id===uid ? {...u, is_admin: val?0:1} : u))
  }

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        {['all', ...PLANS].map(p => (
          <button key={p} onClick={() => setFilter?.(p)} style={{
            fontSize:12,fontWeight:600,padding:'6px 13px',borderRadius:16,cursor:'pointer',
            background: filter===p ? 'var(--accent)' : 'var(--bg3)',
            color: filter===p ? '#fff' : 'var(--text2)',
            border:'1px solid var(--border)',textTransform:'capitalize',
          }}>{p==='all'?'Todos':p}</button>
        ))}
        <span style={{fontSize:12,color:'var(--text3)',marginLeft:'auto'}}>{shown.length} usuario{shown.length===1?'':'s'}</span>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
        <input className="input" placeholder="Buscar por nombre, usuario o email…" value={q}
          onChange={e => setQ(e.target.value)} style={{flex:1,minWidth:200}} />
        <select className="input" value={sort} onChange={e => setSort(e.target.value)} style={{width:'auto'}}>
          <option value="recent">Más nuevos primero</option>
          <option value="seen">Última conexión</option>
          <option value="listens">Más escuchas este mes</option>
        </select>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {shown.map(u => (
          <div key={u.id} style={{...s.userRow,flexWrap:'wrap'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{fontWeight:600}}>{u.display_name || u.username}</div>
                {PLAN_BADGE[u.plan] && <span className={PLAN_BADGE[u.plan]}>{u.plan.toUpperCase()}</span>}
                {!!u.is_admin && <span className="badge-admin">ADMIN</span>}
              </div>
              <div style={{fontSize:12,color:'var(--text3)'}}>@{u.username} · {u.email} · desde {u.created_at?.slice(0,10)}</div>
              <div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>
                🕒 Última conexión: <strong>{ago(u.last_seen_at)}</strong> · 🎧 {u.listens_month || 0} escuchas este mes
                {u.last_listen_at ? <> · última escucha {ago(u.last_listen_at)}</> : null}
              </div>
              {pwDone[u.id] && (
                <div style={{marginTop:8,background:'var(--bg3)',border:'1px solid var(--accent)',borderRadius:8,padding:'10px 12px',fontSize:13}}>
                  <div>✓ Contraseña cambiada. Pásale estos datos al usuario:</div>
                  <div style={{marginTop:4}}>Usuario: <strong>{pwDone[u.id].username}</strong> · Contraseña: <strong style={{fontFamily:'monospace',fontSize:15}}>{pwDone[u.id].password}</strong></div>
                  <button style={{...s.rejectBtn,marginTop:8}} onClick={() => copyCreds(pwDone[u.id])}>Copiar mensaje</button>
                </div>
              )}
              {pwFor === u.id && (
                <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  <input className="input" placeholder="Nueva contraseña (mín. 6)" value={pwVal}
                    onChange={e => setPwVal(e.target.value)} style={{maxWidth:220}} autoFocus />
                  <button style={s.approveBtn} disabled={pwBusy} onClick={() => resetPassword(u, false)}>Guardar</button>
                  <button style={s.rejectBtn} disabled={pwBusy} onClick={() => resetPassword(u, true)}>Generar una</button>
                  <button style={s.rejectBtn} onClick={() => { setPwFor(null); setPwErr('') }}>Cancelar</button>
                  {pwErr && <span style={{color:'var(--danger)',fontSize:12}}>{pwErr}</span>}
                </div>
              )}
            </div>
            {u.id !== me?.id && (
              <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,flexWrap:'wrap'}}>
                <div style={{display:'flex',gap:4}}>
                  {PLANS.map(p => (
                    <button key={p} onClick={() => setPlan(u.id, p)} style={{
                      fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer',
                      background: u.plan === p ? 'var(--accent)' : 'var(--bg3)',
                      color: u.plan === p ? '#fff' : 'var(--text2)',
                      border: '1px solid var(--border)', textTransform:'capitalize',
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button style={actFor === u.id ? s.approveBtn : s.rejectBtn} onClick={() => setActFor(actFor === u.id ? null : u.id)}>
                  📊 Actividad
                </button>
                <button style={s.rejectBtn} onClick={() => { setPwFor(pwFor === u.id ? null : u.id); setPwVal(''); setPwErr('') }}>
                  🔑 Contraseña
                </button>
                <ToggleBtn
                  active={!!u.is_admin}
                  label={u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  danger={!u.is_admin}
                />
              </div>
            )}
            {actFor === u.id && <div style={{flexBasis:'100%'}}><ActivityCard uid={u.id} onClose={() => setActFor(null)} /></div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// '2026-10-28 17:05:00' (UTC) -> 'hace 3 h', 'ayer', '12 oct'
function ago(ts) {
  if (!ts) return 'nunca'
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  if (isNaN(d)) return ts
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 2) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.round(h / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

function when(ts) {
  if (!ts) return ''
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  return isNaN(d) ? ts : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const PLAN_NAME = { free: 'Gratis', amante: 'Amante', pro: 'Pro', premium: 'Premium' }

// Ficha de actividad: qué escucha una cuenta, cuánto y cuándo.
function ActivityCard({ uid, onClose }) {
  const [a, setA] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => { adminUserActivity(uid).then(setA).catch(() => setA({ error: true })) }, [uid])
  const box = {marginTop:10,background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',fontSize:13}
  if (!a) return <div style={box}>Cargando actividad…</div>
  if (a.error) return <div style={box}>No se pudo cargar la actividad.</div>
  const h3 = {fontSize:13,fontWeight:700,margin:'14px 0 6px'}
  const line = {display:'flex',justifyContent:'space-between',gap:10,padding:'3px 0',borderBottom:'1px solid var(--border)'}
  const recent = all ? a.recent : a.recent.slice(0, 10)
  return (
    <div style={box}>
      <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
        <strong>Actividad de {a.display_name || a.username}</strong>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text2)',cursor:'pointer'}}>✕</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginTop:10}}>
        {[[PLAN_NAME[a.plan] || a.plan, 'Plan'], [ago(a.last_seen_at), 'Última conexión'], [a.listens_month, 'Escuchas este mes'],
          [a.listens_total, 'Escuchas en total'], [a.distinct_tracks, 'Canciones distintas'], [a.created_at?.slice(0,10), 'Cuenta creada']]
          .map(([v, l]) => (
            <div key={l} style={{background:'var(--bg2)',borderRadius:8,padding:'8px 10px'}}>
              <div style={{fontWeight:800}}>{v ?? '—'}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>{l}</div>
            </div>
        ))}
      </div>
      {a.listens_total === 0 ? <p style={{marginTop:12,color:'var(--text3)'}}>Todavía no ha escuchado ninguna canción (desde que se registran las escuchas).</p> : <>
        <div style={h3}>Artistas que más escucha</div>
        {a.top_artists.map(x => <div key={x.artist_id} style={line}><span>{x.name}</span><span>{x.listens} escuchas</span></div>)}
        <div style={h3}>Canciones que más escucha</div>
        {a.top_tracks.map(t => (
          <div key={t.track_id} style={line}>
            <span>{t.title} <span style={{color:'var(--text3)'}}>· {t.artists}</span></span>
            <span style={{flexShrink:0}}>{t.listens}× · {ago(t.last)}</span>
          </div>
        ))}
        <div style={h3}>Historial de escuchas</div>
        {recent.map((r, i) => (
          <div key={i} style={line}>
            <span>{r.title} <span style={{color:'var(--text3)'}}>· {r.artists}</span></span>
            <span style={{flexShrink:0,color:'var(--text2)'}}>{when(r.played_at)}{r.source === 'offline' ? ' · sin conexión' : ''}</span>
          </div>
        ))}
        {a.recent.length > 10 && (
          <button onClick={() => setAll(v => !v)} style={{marginTop:8,background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontWeight:600}}>
            {all ? 'Ver menos' : `Ver las últimas ${a.recent.length}`}
          </button>
        )}
        <div style={h3}>Escuchas por mes</div>
        {a.by_month.map(m => <div key={m.month} style={line}><span>{m.month}</span><span>{m.listens}</span></div>)}
      </>}
    </div>
  )
}

function ClaimsPanel() {
  const [claims, setClaims] = useState(null)
  const [busy, setBusy] = useState(null)
  const [creds, setCreds] = useState({})   // claim id -> {username,email,temp_password}

  useEffect(() => { adminClaims().then(setClaims).catch(() => setClaims([])) }, [])

  async function review(c, action) {
    if (action === 'approve' && !confirm(`¿Confirmas que "${c.display_name || c.username}" es de esta persona? Se generará acceso nuevo.`)) return
    if (action === 'reject' && !confirm('¿Rechazar este reclamo?')) return
    setBusy(c.id)
    try {
      const r = await adminReviewClaim(c.id, action)
      if (action === 'approve') setCreds(cr => ({ ...cr, [c.id]: r }))
      setClaims(cs => cs.map(x => x.id === c.id ? { ...x, status: action === 'approve' ? 'approved' : 'rejected' } : x))
    } catch (e) { alert(e.message || 'Error') }
    finally { setBusy(null) }
  }

  if (claims === null) return <p style={{color:'var(--text3)',marginTop:20}}>Cargando…</p>
  if (claims.length === 0) return <p style={{color:'var(--text3)',marginTop:20}}>No hay reclamos de cuentas.</p>

  return (
    <div style={{marginTop:20, display:'flex', flexDirection:'column', gap:10}}>
      {claims.map(c => (
        <div key={c.id} style={{...s.userRow, flexDirection:'column', alignItems:'stretch', gap:10}}>
          <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:700}}>{c.display_name || c.username} <span style={{color:'var(--text3)',fontWeight:400,fontSize:12}}>@{c.username}</span></div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>
                {c.email && <>✉ {c.email} · </>}{c.contact && <>📞 {c.contact} · </>}{c.created_at?.slice(0,10)}
              </div>
              {c.message && <div style={{fontSize:12.5,color:'var(--text2)',marginTop:6,fontStyle:'italic'}}>“{c.message}”</div>}
            </div>
            {c.status === 'pending' ? (
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button disabled={busy===c.id} onClick={()=>review(c,'approve')} style={s.approveBtn}>✓ Aprobar</button>
                <button disabled={busy===c.id} onClick={()=>review(c,'reject')} style={s.rejectBtn}>Rechazar</button>
              </div>
            ) : (
              <span className={c.status==='approved'?'badge-plan-premium':'badge-admin'} style={{flexShrink:0}}>{c.status==='approved'?'APROBADO':'RECHAZADO'}</span>
            )}
          </div>
          {creds[c.id] && (
            <div style={{background:'var(--bg3)',border:'1px solid var(--accent)',borderRadius:8,padding:'10px 12px',fontSize:13}}>
              <div style={{fontWeight:700,marginBottom:4}}>Acceso para entregar al artista (por WhatsApp):</div>
              Usuario: <b>{creds[c.id].username}</b>{creds[c.id].email && <> · Correo: <b>{creds[c.id].email}</b></>}<br/>
              Contraseña temporal: <b style={{fontFamily:'monospace'}}>{creds[c.id].temp_password}</b>
              <div style={{color:'var(--text3)',marginTop:4,fontSize:11}}>Dile que entre y cambie su contraseña en “Mi cuenta”.</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SongsPanel({ onChange }) {
  const [tracks, setTracks] = useState(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => { adminTracks().then(setTracks).catch(() => setTracks([])) }, [])

  async function remove(t) {
    if (!confirm(`¿Eliminar "${t.title}"? Esta acción no se puede deshacer.`)) return
    setBusy(t.id)
    try {
      await deleteTrack(t.id)
      setTracks(ts => ts.filter(x => x.id !== t.id))
      onChange?.()
    } catch (e) { alert(e.message || 'No se pudo eliminar') }
    finally { setBusy(null) }
  }

  if (tracks === null) return <p style={{color:'var(--text3)',marginTop:20}}>Cargando…</p>

  const ql = q.trim().toLowerCase()
  const shown = ql
    ? tracks.filter(t => (t.title + ' ' + (t.display_name||t.username||t.artist||'')).toLowerCase().includes(ql))
    : tracks

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar canción o artista…" style={{maxWidth:320}} />
        <span style={{fontSize:12,color:'var(--text3)'}}>{shown.length} de {tracks.length}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {shown.map(t => (
          <div key={t.id} style={s.userRow}>
            <img src={trackCoverUrl(t.id)} alt="" onError={e=>{e.target.style.visibility='hidden'}}
                 style={{width:46,height:46,borderRadius:8,objectFit:'cover',flexShrink:0,background:'var(--bg3)'}} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title}</div>
                <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:10,background:'var(--bg3)',color:'var(--text2)'}}>
                  {t.media_type === 'video' ? '🎬 Vídeo' : '🎵 Audio'}
                </span>
                {!t.is_public && <span className="badge-admin">OCULTA</span>}
              </div>
              <div style={{fontSize:12,color:'var(--text3)'}}>
                {(t.display_name || t.username)} · {t.play_count} reproducciones · {t.created_at?.slice(0,10)}
              </div>
            </div>
            <button disabled={busy===t.id} onClick={() => remove(t)} style={{
              flexShrink:0,fontSize:12,fontWeight:700,padding:'8px 14px',borderRadius:8,cursor:'pointer',
              background:'transparent',color:'var(--danger)',border:'1px solid var(--danger)',
            }}>{busy===t.id ? '…' : '🗑 Eliminar'}</button>
          </div>
        ))}
        {shown.length === 0 && <p style={{color:'var(--text3)'}}>Sin resultados.</p>}
      </div>
    </div>
  )
}

function EarningsPanel() {
  const [month, setMonth] = useState('')
  const [data, setData]   = useState(null)
  const [open, setOpen]   = useState(null)      // listener_id expandido en el libro
  const [view, setView]   = useState('artists') // 'artists' | 'ledger'
  const [busy, setBusy]   = useState(null)

  function load(m) { adminRoyalties(m).then(d => { setData(d); if (!m) setMonth(d.month) }).catch(() => setData({ error: true })) }
  useEffect(() => { load(month) }, [month])   // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null) return <p style={{color:'var(--text3)',marginTop:20}}>Cargando...</p>
  if (data.error) return <p style={{color:'var(--danger)',marginTop:20}}>No se pudieron cargar las regalías.</p>

  async function markPaid(a) {
    const val = window.prompt(`Cantidad pagada a ${a.name} por ${monthLabel(data.month)} (XAF):`, String(Math.round(a.amount)))
    if (val == null) return
    const amount = parseInt(String(val).replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(amount)) return
    const note = window.prompt('Nota (opcional, ej: Muni Dinero 555 123 456):', a.payout?.note || '') || ''
    setBusy(a.artist_id)
    try { await adminMarkPayout({ artist_id: a.artist_id, month: data.month, amount, note }); load(data.month) }
    finally { setBusy(null) }
  }

  const fmt = fmtN

  return (
    <div style={{marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <select className="input" value={data.month} onChange={e => setMonth(e.target.value)} style={{width:'auto',minWidth:170}}>
          {data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div style={{display:'flex',gap:6}}>
          {[['artists','Por artista'],['ledger','Por oyente']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              style={view === id ? s.approveBtn : s.rejectBtn}>{label}</button>
          ))}
        </div>
      </div>

      <div style={s.statsRow}>
        {[
          [fmtXAF(data.collected), `${data.live ? 'Recaudado' : 'Recaudación simulada'} (${data.paying_listeners} oyentes Amante × ${fmtXAF(data.price)})`],
          [fmtXAF(data.to_artists), `Para artistas (${data.artist_percent}%)`],
          [fmtXAF(data.platform), `Para la plataforma (${100 - data.artist_percent}%)`],
        ].map(([v, l]) => (
          <div key={l} style={{...s.statCard,cursor:'default'}}>
            <div style={{fontSize:20,fontWeight:800}}>{v}</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>
      {!data.live && (
        <p style={{background:'rgba(245,180,0,.12)',border:'1px solid rgba(245,180,0,.45)',borderRadius:10,padding:'10px 14px',fontSize:13,marginBottom:12}}>
          🚧 <strong>Monetización no activa:</strong> por ahora el plan Amante es gratis, así que estas cifras son una simulación:
          suponen que cada Amante pagaría {fmtXAF(data.price)} al mes. Los artistas también lo ven como simulación.
          Actívala en Configuración cuando empecéis a cobrar y pagar.
        </p>
      )}
      <p style={{color:'var(--text3)',fontSize:12,marginBottom:16,lineHeight:1.6}}>
        Reparto por oyente: el {data.artist_percent}% de cada oyente Amante va solo a los artistas que él escuchó, según cuánto.
        Cuenta como escucha a partir de 30 s. Solo entran los oyentes Amante que escucharon algo en el mes;
        el dinero de un Amante que no escuchó nada se queda en la plataforma. El precio sale de “Precio Amante” en Configuración.
      </p>

      {view === 'artists' ? (
        data.artists.length === 0 ? <p style={{color:'var(--text3)'}}>Sin escuchas este mes.</p> : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {data.artists.map(a => (
              <div key={a.artist_id} style={s.userRow}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600}}>{a.name || a.username}</div>
                  <div style={{fontSize:12,color:'var(--text3)'}}>
                    {a.paid_listeners} oyentes de pago · {fmt(a.paid_listens)} escuchas de pago · {fmt(a.free_listens)} gratis · {fmt(a.anon_listens)} sin cuenta
                  </div>
                  {a.payout && <div style={{fontSize:12,color:'var(--accent)',marginTop:2}}>✓ Pagado {fmtXAF(a.payout.amount)}{a.payout.note ? ` · ${a.payout.note}` : ''}</div>}
                </div>
                <div style={{textAlign:'right',flexShrink:0,display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                  <div style={{fontSize:18,fontWeight:800,color:'var(--accent)'}}>{fmtXAF(a.amount)}</div>
                  {a.amount > 0 && (
                    <button style={s.rejectBtn} disabled={busy === a.artist_id} onClick={() => markPaid(a)}>
                      {a.payout ? 'Editar pago' : 'Marcar pagado'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        data.ledger.length === 0 ? <p style={{color:'var(--text3)'}}>Ningún oyente de pago escuchó música este mes.</p> : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {data.ledger.map(l => (
              <div key={l.listener_id} style={{...s.userRow,flexDirection:'column',alignItems:'stretch',cursor:'pointer'}}
                onClick={() => setOpen(open === l.listener_id ? null : l.listener_id)}>
                <div style={{display:'flex',gap:12,alignItems:'center'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600}}>{l.name || l.username}</div>
                    <div style={{fontSize:12,color:'var(--text3)'}}>{fmt(l.listens)} escuchas · {l.allocations.length} artistas</div>
                  </div>
                  <div style={{fontWeight:800}}>{fmtXAF(l.contribution)} {open === l.listener_id ? '▴' : '▾'}</div>
                </div>
                {open === l.listener_id && (
                  <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:4,borderTop:'1px solid var(--border)',paddingTop:10}}>
                    {l.allocations.map(x => (
                      <div key={x.artist_id} style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                        <span>{x.name} <span style={{color:'var(--text3)'}}>· {fmt(x.listens)} escuchas</span></span>
                        <strong>{fmtXAF(x.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function SettingsPanel() {
  const [cfg, setCfg]     = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => { adminGetSettings().then(setCfg).catch(() => {}) }, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    await adminSaveSettings(cfg)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <form onSubmit={save} style={{marginTop:20,display:'flex',flexDirection:'column',gap:14,maxWidth:600}}>
      <label style={s.label}>Nombre de la plataforma
        <input className="input" style={{marginTop:6}} value={cfg.site_name||''} onChange={e => setCfg({...cfg,site_name:e.target.value})} />
      </label>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        <label style={{...s.label,flex:1,minWidth:150}}>Precio Amante
          <input className="input" style={{marginTop:6}} value={cfg.amante_price||''} onChange={e => setCfg({...cfg,amante_price:e.target.value})} />
        </label>
        <label style={{...s.label,flex:1,minWidth:150}}>Precio Pro
          <input className="input" style={{marginTop:6}} value={cfg.pro_price||''} onChange={e => setCfg({...cfg,pro_price:e.target.value})} />
        </label>
        <label style={{...s.label,flex:1,minWidth:150}}>Precio Premium
          <input className="input" style={{marginTop:6}} value={cfg.premium_price||''} onChange={e => setCfg({...cfg,premium_price:e.target.value})} />
        </label>
      </div>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        <label style={{...s.label,flex:1,minWidth:130}}>Descargas Gratis (total)
          <input className="input" type="number" min="0" style={{marginTop:6}}
            value={cfg.free_download_limit||''} onChange={e => setCfg({...cfg,free_download_limit:e.target.value})} />
        </label>
        <label style={{...s.label,flex:1,minWidth:130}}>Descargas Amante/Pro (mes)
          <input className="input" type="number" min="0" style={{marginTop:6}}
            value={cfg.paid_download_limit||''} onChange={e => setCfg({...cfg,paid_download_limit:e.target.value})} />
        </label>
      </div>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        <label style={{...s.label,flex:1,minWidth:130}}>Subidas Pro (mes)
          <input className="input" type="number" min="0" style={{marginTop:6}}
            value={cfg.pro_upload_limit||''} onChange={e => setCfg({...cfg,pro_upload_limit:e.target.value})} />
        </label>
        <label style={{...s.label,flex:1,minWidth:130}}>Subidas Premium (mes)
          <input className="input" type="number" min="0" style={{marginTop:6}}
            value={cfg.premium_upload_limit||''} onChange={e => setCfg({...cfg,premium_upload_limit:e.target.value})} />
        </label>
      </div>
      <label style={s.label}>Monetización (regalías)
        <select className="input" style={{marginTop:6}} value={cfg.royalties_live === '1' ? '1' : '0'}
          onChange={e => setCfg({...cfg,royalties_live:e.target.value})}>
          <option value="0">No activa — los artistas ven una simulación</option>
          <option value="1">Activa — se paga a los artistas</option>
        </select>
      </label>
      <label style={s.label}>% de cada oyente Amante para los artistas (regalías)
        <input className="input" type="number" min="0" max="100" style={{marginTop:6}} placeholder="70"
          value={cfg.royalty_artist_percent||''} onChange={e => setCfg({...cfg,royalty_artist_percent:e.target.value})} />
      </label>
      <label style={s.label}>Instrucciones de pago
        <textarea className="input" rows={8} style={{marginTop:6,resize:'vertical'}}
          value={cfg.payment_instructions||''} onChange={e => setCfg({...cfg,payment_instructions:e.target.value})} />
      </label>
      <button className="btn-primary" type="submit" disabled={saving} style={{alignSelf:'flex-start',padding:'10px 24px'}}>
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
      </button>
    </form>
  )
}

function ToggleBtn({ active, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, cursor:'pointer',
      background: danger ? 'rgba(var(--danger-rgb),.15)' : 'var(--bg3)',
      color: danger ? 'var(--danger)' : 'var(--text2)',
      border: '1px solid var(--border)',
    }}>
      {label}
    </button>
  )
}

const s = {
  statsRow: {display:'flex',gap:12,marginBottom:24,flexWrap:'wrap'},
  statCard: {flex:1,minWidth:120,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 20px',cursor:'pointer',textAlign:'left',font:'inherit',transition:'border-color .15s,background .15s'},
  approveBtn: {fontSize:12,fontWeight:700,padding:'8px 14px',borderRadius:8,cursor:'pointer',background:'var(--accent)',color:'#fff',border:'none'},
  rejectBtn: {fontSize:12,fontWeight:700,padding:'8px 14px',borderRadius:8,cursor:'pointer',background:'transparent',color:'var(--text2)',border:'1px solid var(--border)'},
  tabs: {display:'flex',gap:8,marginBottom:4},
  badge: {
    background:'var(--danger)',color:'#fff',borderRadius:'50%',
    padding:'1px 6px',fontSize:10,marginLeft:6,fontWeight:700,
  },
  reqCard: {
    display:'flex',alignItems:'center',gap:16,
    background:'var(--bg2)',border:'1px solid var(--border)',
    borderRadius:10,padding:'14px 16px',
  },
  approveBtn: {
    background:'rgba(34,197,94,.15)',color:'#22c55e',border:'1px solid rgba(34,197,94,.3)',
    borderRadius:7,padding:'6px 14px',fontSize:13,fontWeight:600,cursor:'pointer',
  },
  rejectBtn: {
    background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',border:'1px solid rgba(var(--danger-rgb),.3)',
    borderRadius:7,padding:'6px 14px',fontSize:13,fontWeight:600,cursor:'pointer',
  },
  userRow: {
    display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',
    background:'var(--bg2)',border:'1px solid var(--border)',
    borderRadius:10,padding:'12px 16px',
  },
  label: {display:'flex',flexDirection:'column',fontSize:13,fontWeight:600,color:'var(--text2)'},
  bar: {height:5,background:'var(--bg4)',borderRadius:3,marginTop:8,overflow:'hidden'},
  barFill: {height:'100%',background:'var(--accent)',borderRadius:3},
}
