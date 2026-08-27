import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getComments, addComment, deleteComment, likeComment } from '../api'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './Navbar'

// Social-media style comments: threaded replies + per-comment likes.
export default function Comments({ trackId }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [list, setList]       = useState(null)   // top-level comments, each with .replies
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setList(null)
    getComments(trackId).then(c => { if (!cancelled) setList(c) }).catch(() => { if (!cancelled) setList([]) })
    return () => { cancelled = true }
  }, [trackId])

  const total = list ? list.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0) : null

  async function submitTop(e) {
    e?.preventDefault?.()
    const t = text.trim()
    if (!t || sending) return
    if (!user) { navigate('/login'); return }
    setSending(true)
    try {
      const c = await addComment(trackId, t)
      c.replies = []; c.reply_count = 0
      setList(prev => [c, ...(prev || [])])
      setText('')
    } catch (err) { alert(err.message || 'No se pudo publicar') }
    setSending(false)
  }

  // ── tree mutations ──
  const addReply = (topId, reply) => setList(prev => prev.map(c =>
    c.id === topId ? { ...c, replies: [...(c.replies || []), reply], reply_count: (c.reply_count || 0) + 1 } : c))

  const removeNode = (id, parentId) => setList(prev => parentId
    ? prev.map(c => c.id === parentId ? { ...c, replies: c.replies.filter(r => r.id !== id), reply_count: c.reply_count - 1 } : c)
    : prev.filter(c => c.id !== id))

  const setLike = (id, parentId, liked, count) => setList(prev => prev.map(c => {
    if (!parentId && c.id === id) return { ...c, liked_by_me: liked, like_count: count }
    if (parentId && c.id === parentId) return { ...c, replies: c.replies.map(r => r.id === id ? { ...r, liked_by_me: liked, like_count: count } : r) }
    return c
  }))

  return (
    <div style={st.wrap}>
      <h3 style={st.header}>Comentarios {total !== null && <span style={st.count}>{total}</span>}</h3>

      {user ? (
        <form onSubmit={submitTop} style={st.form}>
          <Avatar user={user} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea value={text}
              onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitTop(e) }}
              placeholder="Añade un comentario…" rows={1} style={st.textarea} />
            <div style={st.formActions}>
              <button type="submit" disabled={!text.trim() || sending}
                style={{ ...st.postBtn, opacity: !text.trim() || sending ? 0.5 : 1 }}>
                {sending ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <p style={st.loginPrompt}><Link to="/login" style={st.loginLink}>Inicia sesión</Link> para dejar un comentario.</p>
      )}

      {list === null ? <p style={st.muted}>Cargando comentarios…</p>
        : list.length === 0 ? <p style={st.muted}>Aún no hay comentarios. ¡Sé el primero!</p>
        : <div style={st.list}>
            {list.map(c => (
              <CommentNode key={c.id} comment={c} trackId={trackId}
                onAddReply={addReply} onRemove={removeNode} onLike={setLike} />
            ))}
          </div>}
    </div>
  )
}

function CommentNode({ comment, trackId, onAddReply, onRemove, onLike }) {
  const [showReplies, setShowReplies] = useState(false)
  const [replyOpen, setReplyOpen]     = useState(false)
  const replies = comment.replies || []
  return (
    <div style={st.thread}>
      <Row c={comment} trackId={trackId} onRemove={onRemove} onLike={onLike}
           onReply={() => setReplyOpen(v => !v)} />
      {replyOpen && (
        <div style={{ marginLeft: 46 }}>
          <ReplyForm trackId={trackId} topId={comment.id}
            onDone={r => { onAddReply(comment.id, r); setReplyOpen(false); setShowReplies(true) }} />
        </div>
      )}
      {replies.length > 0 && (
        <div style={{ marginLeft: 46 }}>
          <button style={st.toggleReplies} onClick={() => setShowReplies(v => !v)}>
            {showReplies ? '▲ Ocultar' : `▼ Ver ${replies.length} ${replies.length === 1 ? 'respuesta' : 'respuestas'}`}
          </button>
          {showReplies && replies.map(r => (
            <Row key={r.id} c={r} trackId={trackId} parentId={comment.id}
                 onRemove={onRemove} onLike={onLike} />
          ))}
        </div>
      )}
    </div>
  )
}

// One comment or reply row.
function Row({ c, trackId, parentId, onReply, onRemove, onLike }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  async function toggleLike() {
    if (!user) { navigate('/login'); return }
    try { const r = await likeComment(c.id); onLike(c.id, parentId, r.liked, r.like_count) } catch {}
  }
  async function remove() {
    if (!confirm('¿Borrar este comentario?')) return
    try { await deleteComment(c.id); onRemove(c.id, parentId) } catch (e) { alert(e.message) }
  }
  return (
    <div style={st.item}>
      <Link to={`/user/${c.user_id}`}><Avatar user={c} size={parentId ? 30 : 36} /></Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={st.itemHead}>
          <Link to={`/user/${c.user_id}`} style={st.name}>{c.display_name || c.username}</Link>
          <span style={st.time}>{timeAgo(c.created_at)}</span>
        </div>
        <div style={st.text}>{c.text}</div>
        <div style={st.actions}>
          <button onClick={toggleLike} style={{ ...st.actBtn, color: c.liked_by_me ? 'var(--danger)' : 'var(--text3)' }}>
            {c.liked_by_me ? '♥' : '♡'} {c.like_count > 0 ? c.like_count : ''}
          </button>
          {onReply && <button onClick={onReply} style={st.actBtn}>Responder</button>}
          {user && (user.id === c.user_id || user.is_admin) && (
            <button onClick={remove} style={st.actBtn}>Borrar</button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReplyForm({ trackId, topId, onDone }) {
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const t = text.trim(); if (!t || sending) return
    setSending(true)
    try { const r = await addComment(trackId, t, topId); onDone(r) } catch (e) { alert(e.message) }
    setSending(false)
  }
  return (
    <form onSubmit={submit} style={{ ...st.form, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea value={text} autoFocus
          onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
          placeholder="Escribe una respuesta…" rows={1} style={st.textarea} />
        <div style={st.formActions}>
          <button type="submit" disabled={!text.trim() || sending} style={{ ...st.postBtn, opacity: !text.trim() || sending ? 0.5 : 1 }}>
            {sending ? 'Enviando…' : 'Responder'}
          </button>
        </div>
      </div>
    </form>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'ahora'
  const m = s / 60; if (m < 60) return `hace ${Math.floor(m)} min`
  const h = m / 60; if (h < 24) return `hace ${Math.floor(h)} h`
  const d = h / 24; if (d < 30) return `hace ${Math.floor(d)} d`
  const mo = d / 30; if (mo < 12) return `hace ${Math.floor(mo)} mes${Math.floor(mo) > 1 ? 'es' : ''}`
  return `hace ${Math.floor(d / 365)} a`
}

const st = {
  wrap: { marginTop: 8 },
  header: { fontSize: 16, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  count: { fontSize: 13, fontWeight: 600, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 12, padding: '1px 9px' },
  form: { display: 'flex', gap: 10, marginBottom: 20, alignItems: 'flex-start' },
  textarea: { width: '100%', resize: 'none', background: 'transparent', color: 'var(--text)', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 14, padding: '6px 0', fontFamily: 'inherit', lineHeight: 1.4 },
  formActions: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 },
  postBtn: { background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', borderRadius: 20, padding: '8px 18px', cursor: 'pointer' },
  loginPrompt: { color: 'var(--text3)', fontSize: 14, marginBottom: 18 },
  loginLink: { color: 'var(--accent2)', fontWeight: 600 },
  muted: { color: 'var(--text3)', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 18 },
  thread: { display: 'flex', flexDirection: 'column' },
  item: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  itemHead: { display: 'flex', alignItems: 'center', gap: 8 },
  name: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  time: { fontSize: 12, color: 'var(--text3)' },
  text: { fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '2px 0 4px' },
  actions: { display: 'flex', alignItems: 'center', gap: 16 },
  actBtn: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  toggleReplies: { fontSize: 12, fontWeight: 700, color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 8px' },
}
