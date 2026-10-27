import React from 'react'

// Botón flotante de WhatsApp: abre un chat con EG Music.
// Se coloca encima del reproductor y de la barra inferior del móvil.
const PHONE = '240555901453'
const MESSAGE = 'Hola EG Music, quiero hablar con vosotros sobre...'

export default function WhatsAppButton() {
  const href = `https://wa.me/${PHONE}?text=${encodeURIComponent(MESSAGE)}`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       aria-label="Escríbenos por WhatsApp" title="Escríbenos por WhatsApp"
       className="wa-float">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" fill="#fff">
        <path d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.54 1.74 6.52L3 29l6.65-1.74A12.94 12.94 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3zm0 23.62c-2 0-3.95-.54-5.65-1.55l-.4-.24-3.95 1.03 1.05-3.85-.26-.4a10.58 10.58 0 0 1-1.63-5.6c0-5.86 4.78-10.63 10.66-10.63 5.86 0 10.62 4.77 10.62 10.63 0 5.85-4.77 10.61-10.44 10.61zm5.83-7.95c-.32-.16-1.9-.94-2.19-1.04-.3-.11-.5-.16-.72.16-.21.32-.83 1.04-1.01 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.5.14-.66.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.3.32-1.12 1.09-1.12 2.66s1.15 3.09 1.31 3.3c.16.21 2.26 3.45 5.47 4.84.76.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.9-.78 2.17-1.53.27-.75.27-1.39.19-1.53-.08-.13-.29-.21-.61-.37z"/>
      </svg>
    </a>
  )
}
