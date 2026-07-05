import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword } from '../api'
import { useAuth } from '../context/AuthContext'

export default function ChangePassword() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current: '', next: '', repeat: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

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

  async function submit(e) {
    e.preventDefault()
    if (form.next !== form.repeat) { setError('Las contraseñas nuevas no coinciden'); return }
    setLoading(true); setError('')
    try {
      await changePassword({ current_password: form.current, new_password: form.next })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const f = (k, v) => setForm({ ...form, [k]: v })

  if (done) return (
    <div style={s.root}>
      <div style={s.box}>
        <div style={{fontSize:40,textAlign:'center',marginBottom:12}}>✅</div>
        <h2 style={s.title}>Contraseña actualizada</h2>
        <button className="btn-primary" style={{width:'100%',marginTop:16}} onClick={() => navigate(`/user/${user.id}`)}>
          Volver a mi perfil
        </button>
      </div>
    </div>
  )

  return (
    <div style={s.root}>
      <div style={s.box}>
        <h2 style={s.title}>Cambiar contraseña</h2>
        {error && <div style={s.error}>{error}</div>}
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
    </div>
  )
}

const s = {
  root: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'calc(100vh - 58px - var(--player-h))',padding:16},
  box: {width:'100%',maxWidth:400,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:32},
  title: {fontSize:22,fontWeight:700,marginBottom:16,textAlign:'center'},
  error: {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13},
  form: {display:'flex',flexDirection:'column',gap:12},
}
