import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api'
import { useAuth } from '../context/AuthContext'

// Registro en dos pasos: 1) ¿artista u oyente?  2) datos de la cuenta.
// Las dos cuentas son gratis; el artista puede pasar a Pro/Premium después.
const TYPES = {
  artist: {
    icon: '🎤',
    title: 'Soy artista',
    text: 'Crea tu perfil de artista gratis. Cuando quieras subir tu música, eliges un plan Pro o Premium.',
  },
  listener: {
    icon: '🎧',
    title: 'Amante de la música',
    text: 'Escucha canciones y videos de artistas de Guinea Ecuatorial, gratis.',
  },
}

export default function Register() {
  const [type, setType]   = useState(null)   // 'artist' | 'listener'
  const [form, setForm]   = useState({ username:'', email:'', password:'', display_name:'' })
  const [error, setError] = useState('')
  const [hp, setHp]       = useState('')   // campo trampa: las personas no lo ven, los bots sí lo rellenan
  const [loading, setLoading] = useState(false)
  const { loginUser } = useAuth()
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await register({ ...form, account_type: type, website: hp })
      loginUser(r.token, r.user)
      navigate(type === 'artist' ? `/user/${r.user.id}` : '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const f = (k, v) => setForm({ ...form, [k]: v })

  // Paso 1: elegir tipo de cuenta
  if (!type) return (
    <div style={s.root}>
      <div style={{...s.box, maxWidth:520}}>
        <h2 style={s.title}>Crear cuenta</h2>
        <p style={s.sub}>¿Cómo quieres usar EG Music? Las dos cuentas son gratis.</p>
        <div style={s.choices}>
          {Object.entries(TYPES).map(([id, t]) => (
            <button key={id} type="button" onClick={() => setType(id)} style={s.choice}>
              <span style={{fontSize:34}}>{t.icon}</span>
              <span style={s.choiceTitle}>{t.title}</span>
              <span style={s.choiceText}>{t.text}</span>
            </button>
          ))}
        </div>
        <p style={s.link}>¿Ya tienes cuenta? <Link to="/login" style={{color:'var(--accent)'}}>Iniciar sesión</Link></p>
      </div>
    </div>
  )

  const isArtist = type === 'artist'

  // Paso 2: datos de la cuenta
  return (
    <div style={s.root}>
      <div style={s.box}>
        <button type="button" onClick={() => { setType(null); setError('') }} style={s.back}>← Cambiar tipo de cuenta</button>
        <h2 style={s.title}>{TYPES[type].icon} {isArtist ? 'Cuenta de artista' : 'Cuenta de oyente'}</h2>
        <p style={s.sub}>
          {isArtist
            ? 'Gratis. Después podrás elegir un plan para subir tu música.'
            : 'Gratis. Escucha música desde el primer momento.'}
        </p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={submit} style={s.form}>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
            value={hp} onChange={e => setHp(e.target.value)}
            style={{position:'absolute',left:'-10000px',width:1,height:1,opacity:0}} />
          <input className="input"
            placeholder={isArtist ? 'Nombre artístico' : 'Tu nombre (opcional)'}
            required={isArtist}
            value={form.display_name} onChange={e => f('display_name', e.target.value)} />
          <input className="input" placeholder="Nombre de usuario" required
            value={form.username} onChange={e => f('username', e.target.value)} />
          <input className="input" type="email" placeholder="Email" required
            value={form.email} onChange={e => f('email', e.target.value)} />
          <input className="input" type="password" placeholder="Contraseña (mín. 6 caracteres)" required
            value={form.password} onChange={e => f('password', e.target.value)} />
          <button className="btn-primary" type="submit" disabled={loading} style={{width:'100%'}}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
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
  back: {color:'var(--text2)',fontSize:13,fontWeight:600,marginBottom:14,background:'none',border:'none',cursor:'pointer',padding:0},
  choices: {display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))',gap:12},
  choice: {display:'flex',flexDirection:'column',alignItems:'center',gap:8,textAlign:'center',padding:'22px 16px',
           background:'var(--bg3)',border:'2px solid var(--border)',borderRadius:12,cursor:'pointer',color:'var(--text)'},
  choiceTitle: {fontSize:16,fontWeight:700},
  choiceText: {fontSize:13,color:'var(--text2)',lineHeight:1.45},
}
