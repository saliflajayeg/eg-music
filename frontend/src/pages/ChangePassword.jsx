import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword, changeEmail } from '../api'
import { useAuth } from '../context/AuthContext'

export default function ChangePassword() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  if (!user) return (
    <div style={s.root}>
      <div style={s.box}>
        <p style={{textAlign:'center',marginBottom:16}}>Inicia sesión primero.</p>
        <button className="btn-primary" style={{width:'100%'}} onClick={() => navigate('/login')}>
          Iniciar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div style={s.root}>
      <div style={{width:'100%',maxWidth:400,display:'flex',flexDirection:'column',gap:20}}>
        <h2 style={s.title}>Mi cuenta</h2>
        <EmailCard user={user} refreshUser={refreshUser} />
        <PasswordCard />
      </div>
    </div>
  )
}

function EmailCard({ user, refreshUser }) {
  const [form, setForm] = useState({ email: user.email || '', password: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError(''); setDone(false)
    try {
      await changeEmail({ new_email: form.email, password: form.password })
      await refreshUser()
      setForm(f => ({ ...f, password: '' }))
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.box}>
      <h3 style={s.cardTitle}>Correo electrónico</h3>
      <p style={s.hint}>Pon tu correo para asegurar tu cuenta y poder recuperarla.</p>
      {error && <div style={s.error}>{error}</div>}
      {done  && <div style={s.ok}>✅ Correo actualizado</div>}
      <form onSubmit={submit} style={s.form}>
        <input className="input" type="email" placeholder="Tu email" required
          value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
        <input className="input" type="password" placeholder="Tu contraseña (para confirmar)" required
          value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
        <button className="btn-primary" type="submit" disabled={loading} style={{width:'100%'}}>
          {loading ? 'Guardando...' : 'Guardar correo'}
        </button>
      </form>
    </div>
  )
}

function PasswordCard() {
  const [form, setForm] = useState({ current: '', next: '', repeat: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (form.next !== form.repeat) { setError('Las contraseñas nuevas no coinciden'); return }
    setLoading(true); setError(''); setDone(false)
    try {
      await changePassword({ current_password: form.current, new_password: form.next })
      setForm({ current: '', next: '', repeat: '' })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const f = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div style={s.box}>
      <h3 style={s.cardTitle}>Cambiar contraseña</h3>
      {error && <div style={s.error}>{error}</div>}
      {done  && <div style={s.ok}>✅ Contraseña actualizada</div>}
      <form onSubmit={submit} style={s.form}>
        <input className="input" type="password" placeholder="Contraseña actual" required
          value={form.current} onChange={e => f('current', e.target.value)} />
        <input className="input" type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" required
          value={form.next} onChange={e => f('next', e.target.value)} />
        <input className="input" type="password" placeholder="Repite la nueva contraseña" required
          value={form.repeat} onChange={e => f('repeat', e.target.value)} />
        <button className="btn-primary" type="submit" disabled={loading} style={{width:'100%'}}>
          {loading ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}

const s = {
  root: {display:'flex',alignItems:'flex-start',justifyContent:'center',minHeight:'calc(100vh - 58px - var(--player-h))',padding:'32px 16px'},
  box: {width:'100%',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:28},
  title: {fontSize:22,fontWeight:700,textAlign:'center'},
  cardTitle: {fontSize:16,fontWeight:700,marginBottom:6},
  hint: {color:'var(--text3)',fontSize:13,marginBottom:14},
  error: {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:12,fontSize:13},
  ok: {background:'rgba(var(--accent-rgb),.15)',color:'var(--accent)',padding:'10px 14px',borderRadius:8,marginBottom:12,fontSize:13},
  form: {display:'flex',flexDirection:'column',gap:12},
}
