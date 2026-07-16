import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initBackend } from './api'
import './index.css'

// Find out where the backend is before anything renders, so no component ever
// fires a request at a stale address. No-op on the website; on the Android app
// it asks the permanent Worker (and falls back to the cached address offline).
initBackend().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
})
