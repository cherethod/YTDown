# Aula Offline

Aplicación web ligera para validar enlaces de vídeos educativos de YouTube, limpiarlos y abrir las opciones oficiales para verlos sin conexión o descargar contenido propio.

## Ejecutar

Necesitas Node.js 18 o posterior.

```powershell
npm start
```

Abre `http://127.0.0.1:4173`.

## Comprobar

```powershell
npm run check
```

## Backend de descarga

El contenedor incluye `yt-dlp` y `ffmpeg` y expone estas rutas:

- `GET /api/health`: comprueba que el servicio está disponible.
- `GET /api/info?url=...`: consulta el título y la duración.
- `GET /api/download?url=...`: prepara y transmite un MP4 de hasta 1080p y 750 MB.

La descarga debe utilizarse únicamente con contenido propio, de dominio público, con licencia compatible o con permiso expreso. El backend limita las descargas concurrentes y no admite listas de reproducción.

La interfaz está configurada para usar `https://ytdown-production-a68a.up.railway.app` como backend de descarga.

Para instalaciones en centros de datos donde YouTube exige comprobación anti-bot, el contenedor incluye el plugin `bgutil-ytdlp-pot-provider`. Define `POT_PROVIDER_URL` con la dirección privada del servicio proveedor, por ejemplo `http://pot-provider.railway.internal:4416`.
