import React, { useState, useEffect, useRef } from 'react'
import { searchArtists } from '../api'
import { Avatar } from './Navbar'

/**
 * Credit other artists on a track and split the percentages.
 * `value` is [{user_id, username, display_name, avatar, percent}].
 * The uploader keeps whatever is left over, so collaborators must total < 100.
 */
export default function CollaboratorPicker({ value, onChange, ownerName }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(() => {
      setSearching(true)
      searchArtists(q.trim())
        .then(r => setResults(r.filter(u => !value.some(v => v.user_id === u.id))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(timer.current)
  }, [q, value])

  const used = value.reduce((n, c) => n + (Number(c.percent) || 0), 0)
  const ownerShare = Math.round((100 - used) * 100) / 100

  function add(u) {
    onChange([...value, {
      user_id: u.id, username: u.username,
      display_name: u.display_name, avatar: u.avatar,
      percent: '',
    }])
    setQ(''); setResults([])
  }

  const remove = id => onChange(value.filter(c => c.user_id !== id))
  const setPct = (id, pct) =>
    onChange(value.map(c => c.user_id === id ? { ...c, percent: pct } : c))

  return (
    <div style={s.box}>
      <div style={s.head}>
        <span style={{fontWeight:700, fontSize:13}}>🤝 Otros artistas (colaboración)</span>
        <span style={{fontSize:11, color:'var(--text3)'}}>opcional</span>
      </div>
      <p style={s.hint}>
        Etiqueta a los artistas que participaron y reparte los porcentajes.
        Cada uno debe aceptar antes de aparecer en la canción.
      </p>

      {value.map(c => (
        <div key={c.user_id} style={s.row}>
          <Avatar user={c} size={30} />
          <div style={{flex:1, minWidth:0}}>
            <div style={s.name}>{c.display_name || c.username}</div>
            <div style={s.sub}>@{c.username}</div>
          </div>
          <input
            className="input" type="number" min="1" max="99" placeholder="%"
            value={c.percent}
            onChange={e => setPct(c.user_id, e.target.value)}
            style={s.pct}
          />
          <button type="button" onClick={() => remove(c.user_id)} style={s.remove}>✕</button>
        </div>
      ))}

      <div style={{position:'relative'}}>
        <input
          className="input" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar artista por nombre o @usuario..."
        />
        {(results.length > 0 || searching) && (
          <div style={s.results}>
            {searching && <div style={s.resultEmpty}>Buscando...</div>}
            {!searching && results.map(u => (
              <button key={u.id} type="button" onClick={() => add(u)} style={s.result}>
                <Avatar user={u} size={26} />
                <div style={{textAlign:'left', minWidth:0}}>
                  <div style={s.name}>{u.display_name || u.username}</div>
                  <div style={s.sub}>@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && !searching && results.length === 0 && (
          <div style={s.resultEmpty}>Sin resultados. El artista debe tener una cuenta en EG Music.</div>
        )}
      </div>

      {value.length > 0 && (
        <div style={{...s.split, color: ownerShare <= 0 ? 'var(--danger)' : 'var(--text2)'}}>
          Tu parte ({ownerName || 'tú'}): <strong>{ownerShare}%</strong>
          {ownerShare <= 0 && ' — los colaboradores deben sumar menos de 100%'}
        </div>
      )}
    </div>
  )
}

const s = {
  box: {background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, padding:14, display:'flex', flexDirection:'column', gap:10},
  head: {display:'flex', alignItems:'center', justifyContent:'space-between'},
  hint: {fontSize:12, color:'var(--text3)', lineHeight:1.5, margin:0},
  row: {display:'flex', alignItems:'center', gap:10},
  name: {fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'},
  sub: {fontSize:11, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'},
  pct: {width:66, flexShrink:0, textAlign:'center', padding:'8px 6px'},
  remove: {color:'var(--text3)', fontSize:14, padding:4, flexShrink:0},
  results: {
    position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:50,
    background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8,
    overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,.5)',
  },
  result: {display:'flex', alignItems:'center', gap:10, padding:'8px 10px', width:'100%', textAlign:'left'},
  resultEmpty: {padding:'8px 10px', fontSize:12, color:'var(--text3)'},
  split: {fontSize:12, paddingTop:4, borderTop:'1px solid var(--border)'},
}
