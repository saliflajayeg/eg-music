# EG Music 🎵

Plataforma de música para **Guinea Ecuatorial**: los usuarios escuchan gratis y, con un plan de pago, suben y comparten su propia música. Pensada para funcionar en local y en red local (LAN), con pagos por **Muni Dinero** (dinero móvil): el usuario paga, sube la foto de su recibo y el administrador aprueba la solicitud.

La interfaz usa los colores de la bandera de Guinea Ecuatorial (verde, blanco, rojo, azul y dorado) y está en español.

---

## Planes

| Plan | Precio (editable) | Puede subir música | Insignia |
|------|-------------------|--------------------|----------|
| **Free** | Gratis | No — solo escuchar, dar like y seguir | — |
| **Pro** | 3000 XAF / mes | Sí, hasta un límite (por defecto 15 canciones) | Azul |
| **Legend** | 7000 XAF / mes | Sí, subidas ilimitadas | Dorada |

Los precios y el límite de subidas del plan Pro se editan desde el panel de administración (no están fijos en el código).

## Funciones

- 🎧 Reproductor con barra de progreso, control de volumen y streaming por rangos HTTP (seek).
- ⬆️ Subida de canciones (MP3, FLAC, WAV, OGG, M4A) con portada y metadatos.
- 👤 Cuentas de usuario con JWT, perfiles públicos, seguir artistas y feed "Siguiendo".
- ❤️ Likes y búsqueda de canciones y artistas.
- 💳 Solicitud de plan Pro/Legend: instrucciones de pago con Muni Dinero + subida de la foto del recibo; el admin ve el recibo y aprueba o rechaza.
- 🛠️ Panel de administración: estadísticas, gestión de planes de usuarios, revisión de solicitudes y configuración (precios, límite de subidas, instrucciones de pago, nombre del sitio).

## Tecnologías

- **Backend:** Python · FastAPI · SQLite · mutagen (metadatos de audio) · bcrypt + JWT (auth)
- **Frontend:** React 18 · Vite · React Router
- **Escritorio (opcional):** pywebview para abrir la app en una ventana nativa de Windows

---

## Puesta en marcha (Windows)

Requisitos: **Python 3.11+** y **Node.js 18+**.

### Opción rápida (scripts incluidos)

```bat
install.bat          :: crea el entorno virtual, instala dependencias y compila el frontend
start.bat            :: arranca la app en http://localhost:8001 (local / LAN)
start-online.bat     :: arranca la app, la publica en internet y avisa a la app Android
get-online-url.bat   :: ¿olvidaste la dirección pública actual? este script te la recuerda
```

### Dirección fija para la app de Android

La app **no** lleva dentro la dirección del túnel (que cambia en cada arranque). En su lugar pregunta a un Cloudflare Worker permanente dónde está el backend hoy:

```
https://eg-music.xalif-lajay-eg.workers.dev/config   ->  { "backend": "https://….trycloudflare.com" }
```

`start-online.bat` publica la dirección nueva automáticamente (`publish-url.ps1`), así que **al reiniciar el túnel no hay que recompilar ni reinstalar la app**. El código del Worker está en [`worker/`](worker/); se despliega con `npx wrangler deploy` y sólo mueve un JSON diminuto por arranque de la app (la música nunca pasa por él).

**Publicar en internet desde tu propio PC:** instala [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`winget install Cloudflare.cloudflared`) y ejecuta `start-online.bat`. Te dará una dirección pública `https://….trycloudflare.com`, la copiará automáticamente al portapapeles, y podrás pegarla donde quieras compartirla — no requiere cuenta ni tarjeta.

⚠️ Dos cosas importantes de este modo gratuito:
- La dirección **cambia cada vez que reinicias** el túnel. Si la olvidas, ejecuta `get-online-url.bat` para verla y copiarla de nuevo sin reiniciar nada.
- El sitio solo está online mientras el PC esté encendido y las ventanas **"Servidor"** y **"Túnel público"** sigan abiertas.

Para una dirección que nunca cambie, hace falta un dominio propio (~$9-10/año) conectado a Cloudflare — pregúntame cuando quieras dar ese paso.

### Manual

```bash
# 1. Backend
python -m venv venv
venv\Scripts\pip install -r backend/requirements.txt

# 2. Frontend
cd frontend
npm install
npm run build        # genera frontend/dist, que el backend sirve en producción
cd ..

# 3. Arrancar
venv\Scripts\python backend/main.py
```

Abre **http://localhost:8001**. En la red local, otros dispositivos pueden entrar en `http://TU-IP:8001` (el backend escucha en `0.0.0.0`).

### Desarrollo (con recarga en caliente)

Dos terminales:

```bash
# Terminal 1 — API en el puerto 8001
venv\Scripts\python -m uvicorn main:app --reload --app-dir backend --port 8001

# Terminal 2 — frontend en el puerto 5174 (proxy /api -> 8001)
cd frontend
npm run dev -- --port 5174
```

---

## Configuración

Copia `.env.example` a `.env` y define `SECRET_KEY` (firma los tokens de sesión):

```bash
SECRET_KEY=una-cadena-larga-y-aleatoria
```

> **El primer usuario que se registra se convierte automáticamente en administrador** con el plan Legend. A partir de ahí, gestiona el resto de usuarios desde el panel de administración.

## Estructura del proyecto

```
soundup/                 (nombre de carpeta heredado; la app se llama EG Music)
├── backend/
│   ├── main.py          # rutas FastAPI, streaming, arranque
│   ├── database.py      # esquema SQLite y consultas
│   ├── auth.py          # hash de contraseñas (bcrypt) y JWT
│   ├── requirements.txt
│   └── uploads/         # audio, portadas y avatares subidos (no se versiona)
├── frontend/
│   ├── src/             # componentes y páginas React
│   ├── index.html
│   └── vite.config.js
├── install.bat / start.bat
├── .env.example
└── .gitignore
```

## Notas

- La base de datos (`backend/soundup.db`) y los archivos subidos (`backend/uploads/`) son datos en tiempo de ejecución y **no** se suben al repositorio; se crean solos al arrancar.
- Los pagos son manuales (transferencia bancaria + aprobación del admin); no hay pasarela de pago integrada.
