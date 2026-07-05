import React, { createContext, useContext, useState, useEffect } from 'react'
import { getMe } from '../api'

const Ctx = createContext()

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    getMe()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  function loginUser(token, u) {
    localStorage.setItem('token', token)
    setUser(u)
  }

  function logout() {
    localStorage.removeItem('token')
    setUser(null)
  }

  function refreshUser() {
    return getMe().then(u => { setUser(u); return u })
  }

  return (
    <Ctx.Provider value={{ user, loading, loginUser, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
