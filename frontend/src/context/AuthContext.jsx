import React, { createContext, useContext, useState, useEffect } from 'react'
import { getMe } from '../api'

const Ctx = createContext()

// Cache the user object alongside the token so the app comes up already
// logged-in on restart, even before (or without) a network round-trip.
function cachedUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(cachedUser)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    // We already showed the cached user; refresh in the background.
    getMe()
      .then(u => { setUser(u); localStorage.setItem('user', JSON.stringify(u)) })
      .catch(err => {
        // ONLY drop the session if the token is actually rejected (401).
        // A network error (offline) must keep the user logged in.
        if (err && err.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setUser(null)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function loginUser(token, u) {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  function refreshUser() {
    return getMe().then(u => {
      setUser(u)
      localStorage.setItem('user', JSON.stringify(u))
      return u
    })
  }

  return (
    <Ctx.Provider value={{ user, loading, loginUser, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
