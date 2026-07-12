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
- `GET /api/download?url=...`: transmite un MP4 de hasta 720p y 500 MB.

La descarga debe utilizarse únicamente con contenido propio, de dominio público, con licencia compatible o con permiso expreso. El backend limita las descargas concurrentes y no admite listas de reproducción.
