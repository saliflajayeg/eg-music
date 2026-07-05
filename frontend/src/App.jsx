import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }   from './context/AuthContext'
import { PlayerProvider } from './context/PlayerContext'
import Navbar    from './components/Navbar'
import Player    from './components/Player'
import Home      from './pages/Home'
import Login     from './pages/Login'
import Register  from './pages/Register'
import Profile   from './pages/Profile'
import Upload    from './pages/Upload'
import Search    from './pages/Search'
import Subscribe from './pages/Subscribe'
import Admin     from './pages/Admin'
import ChangePassword from './pages/ChangePassword'

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)' }}>
          <div className="flag-bar" />
          <Navbar />
          <div style={{ flex:1, overflowY:'auto' }}>
            <Routes>
              <Route path="/"          element={<Home />} />
              <Route path="/login"     element={<Login />} />
              <Route path="/register"  element={<Register />} />
              <Route path="/search"    element={<Search />} />
              <Route path="/upload"    element={<Upload />} />
              <Route path="/subscribe" element={<Subscribe />} />
              <Route path="/password"  element={<ChangePassword />} />
              <Route path="/admin"     element={<Admin />} />
              <Route path="/user/:id"  element={<Profile />} />
              <Route path="*"          element={<Navigate to="/" />} />
            </Routes>
          </div>
          <Player />
        </div>
      </PlayerProvider>
    </AuthProvider>
  )
}
