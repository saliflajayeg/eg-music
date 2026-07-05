import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../api'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [form, setForm] = useState({ email:'', password:'' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await login(form)
      loginUser(r.token, r.user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.root}>
      <div style={s.box}>
        <h2 style={s.title}>Iniciar sesión</h2>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={submit} style={s.form}>
          <input className="input" type="email" placeholder="Email"
            value={form.email} onChange={e => setForm({...form,email:e.target.value})} required />
          <input className="input" type="password" placeholder="Contraseña"
            value={form.password} onChange={e => setForm({...form,password:e.target.value})} required />
          <button className="btn-primary" type="submit" disabled={loading} style={{width:'100%'}}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p style={s.link}>¿No tienes cuenta? <Link to="/register" style={{color:'var(--accent)'}}>Regístrate</Link></p>
      </div>
    </div>
  )
}

const s = {
  root: {display:'flex',alignItems:'center',justifyContent:'center',minHeight:'calc(100vh - 58px - var(--player-h))'},
  box: {width:'100%',maxWidth:380,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:32},
  title: {fontSize:22,fontWeight:700,marginBottom:24,textAlign:'center'},
  error: {background:'rgba(var(--danger-rgb),.15)',color:'var(--danger)',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13},
  form: {display:'flex',flexDirection:'column',gap:12},
  link: {textAlign:'center',marginTop:18,color:'var(--text2)',fontSize:13},
}
