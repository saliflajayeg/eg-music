import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const [form, setForm] = useState({ username:'', email:'', password:'', display_name:'' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await register(form)
      loginUser(r.token, r.user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const f = (k, v) => setForm({ ...form, [k]: v })

  return (
    <div style={s.root}>
      <div style={s.box}>
        <h2 style={s.title}>Crear cuenta</h2>
        <p style={s.sub}>Escucha música gratis. Suscríbete para subir y compartir.</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={submit} style={s.form}>
          <input className="input" placeholder="Nombre artístico (opcional)"
            value={form.display_name} onChange={e => f('display_name', e.target.value)} />
          <input className="input" placeholder="Nombre de usuario" required
            value={form.username} onChange={e => f('username', e.target.value)} />
          <input className="input" type="email" placeholder="Email" required
            value={form.email} onChange={e => f('email', e.target.value)} />
          <input className="input" type="password" placeholder="Contraseña (mín. 6 caracteres)" required
            value={form.password} onChange={e => f('password', e.target.value)} />
          <button className="btn-primary" type="submit" disabled={loading} style={{width:'100%'}}>
            {loading ? 'Creando cuenta...' : 'Registrarse'}
          </button>
        </form>
        <p style={s.link}>¿Ya tienes cuenta? <Link to="/login" style={{color:'var(--accent)'}}>Iniciar sesión</Link></p>
      </div>
    </div>
  )
}

const s = {
  root: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'calc(100vh - 58px - var(--player-h))',padding:16},
  box: {width:'100%',maxWidth:400,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:32},
  title: {fontSize:22,fontWeight:700,marginBottom:8,textAlign:'center'},
  sub: {fontSize:13,color:'var(--text2)',textAlign:'center',marginBottom:24},
  error: {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13},
  form: {display:'flex',flexDirection:'column',gap:12},
  link: {textAlign:'center',marginTop:18,color:'var(--text2)',fontSize:13},
}
