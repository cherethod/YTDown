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

La aplicación no extrae archivos de vídeo ni evita las protecciones de YouTube. El procesamiento del enlace se realiza en el navegador. La descarga offline depende de la disponibilidad de la función oficial de YouTube; los vídeos propios pueden descargarse desde YouTube Studio.
