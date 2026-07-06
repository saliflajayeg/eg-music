import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  adminStats, adminUsers, adminUpdateUser,
  adminSubs, adminReviewSub, adminReceiptUrl,
  adminGetSettings, adminSaveSettings,
} from '../api'
import { useAuth } from '../context/AuthContext'

export default function Admin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('subs')
  const [stats, setStats] = useState(null)

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
          {[['Usuarios',stats.users,'var(--accent)'],['Canciones',stats.tracks,'var(--accent)'],
            ['Reproducciones',stats.plays,'var(--accent)'],['Pro',stats.pro_users,'var(--blue)'],
            ['Legend',stats.legend_users,'var(--gold)'],
            ['Suscripciones pendientes',stats.pending_subscriptions,'var(--danger)']].map(([l,v,c]) => (
            <div key={l} style={s.statCard}>
              <div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:12,color:'var(--text3)'}}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={s.tabs}>
        {['subs','users','settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:600,
            background:tab===t?'var(--accent)':'var(--bg3)',
            color:tab===t?'#fff':'var(--text2)',
            border:'1px solid var(--border)',cursor:'pointer',
          }}>
            {t==='subs'?'Suscripciones':t==='users'?'Usuarios':'Configuración'}
            {t==='subs' && stats?.pending_subscriptions > 0 && (
              <span style={s.badge}>{stats.pending_subscriptions}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'subs'     && <SubsPanel onRefresh={() => adminStats().then(setStats)} />}
      {tab === 'users'    && <UsersPanel />}
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
                  <span className={r.plan === 'legend' ? 'badge-plan-legend' : 'badge-plan-pro'}>
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

const PLANS = ['free', 'pro', 'legend']
const PLAN_BADGE = { pro: 'badge-plan-pro', legend: 'badge-plan-legend' }

function UsersPanel() {
  const [users, setUsers] = useState([])
  const { user: me } = useAuth()

  useEffect(() => { adminUsers().then(setUsers).catch(() => {}) }, [])

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
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {users.map(u => (
          <div key={u.id} style={s.userRow}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <div style={{fontWeight:600}}>{u.display_name || u.username}</div>
                {PLAN_BADGE[u.plan] && <span className={PLAN_BADGE[u.plan]}>{u.plan.toUpperCase()}</span>}
                {u.is_admin && <span className="badge-admin">ADMIN</span>}
              </div>
              <div style={{fontSize:12,color:'var(--text3)'}}>{u.email} · desde {u.created_at?.slice(0,10)}</div>
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
                <ToggleBtn
                  active={!!u.is_admin}
                  label={u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  onClick={() => toggleAdmin(u.id, u.is_admin)}
                  danger={!u.is_admin}
                />
              </div>
            )}
          </div>
        ))}
      </div>
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
      <div style={{display:'flex',gap:14}}>
        <label style={{...s.label,flex:1}}>Precio plan Pro
          <input className="input" style={{marginTop:6}} value={cfg.pro_price||''} onChange={e => setCfg({...cfg,pro_price:e.target.value})} />
        </label>
        <label style={{...s.label,flex:1}}>Precio plan Legend
          <input className="input" style={{marginTop:6}} value={cfg.legend_price||''} onChange={e => setCfg({...cfg,legend_price:e.target.value})} />
        </label>
      </div>
      <label style={s.label}>Límite de canciones del plan Pro
        <input className="input" type="number" min="1" style={{marginTop:6,maxWidth:160}}
          value={cfg.pro_upload_limit||''} onChange={e => setCfg({...cfg,pro_upload_limit:e.target.value})} />
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
  statCard: {flex:1,minWidth:120,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:10,padding:'16px 20px'},
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
}
