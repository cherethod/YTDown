const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { extractVideoId } = require('./logic');

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';
const root = __dirname;
const maxConcurrentDownloads = Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 2;
const downloadTimeoutMs = Number(process.env.DOWNLOAD_TIMEOUT_MS) || 10 * 60 * 1000;
let activeDownloads = 0;
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/logic.js': ['logic.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function safeFilename(value) {
  return String(value || 'video')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'video';
}

function runYtDlp(args, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('La operación tardó demasiado.'));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp terminó con código ${code}`));
    });
  });
}

function canonicalYoutubeUrl(value) {
  const id = extractVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

async function handleInfo(requestUrl, response) {
  const youtubeUrl = canonicalYoutubeUrl(requestUrl.searchParams.get('url'));
  if (!youtubeUrl) {
    sendJson(response, 400, { error: 'Enlace de YouTube no válido.' });
    return;
  }

  try {
    const output = await runYtDlp([
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--print', '%(title)s',
      '--print', '%(duration_string)s',
      '--skip-download',
      youtubeUrl
    ]);
    const [title, duration] = output.trim().split(/\r?\n/);
    sendJson(response, 200, { title, duration, url: youtubeUrl });
  } catch (error) {
    console.error('No se pudo consultar el vídeo:', error.message);
    sendJson(response, 502, { error: 'No se pudo obtener la información del vídeo.' });
  }
}

async function handleDownload(request, requestUrl, response) {
  const youtubeUrl = canonicalYoutubeUrl(requestUrl.searchParams.get('url'));
  if (!youtubeUrl) {
    sendJson(response, 400, { error: 'Enlace de YouTube no válido.' });
    return;
  }
  if (activeDownloads >= maxConcurrentDownloads) {
    sendJson(response, 429, { error: 'El servidor está ocupado. Inténtalo de nuevo en unos minutos.' });
    return;
  }

  activeDownloads += 1;
  let child;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    activeDownloads = Math.max(0, activeDownloads - 1);
  };

  try {
    let title = 'video';
    try {
      title = (await runYtDlp([
        '--no-playlist', '--no-warnings', '--js-runtimes', 'node',
        '--print', '%(title)s', '--skip-download', youtubeUrl
      ])).trim().split(/\r?\n/)[0];
    } catch {
      // La descarga todavía puede funcionar aunque falle la consulta del título.
    }

    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${safeFilename(title)}.mp4"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });

    child = spawn('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--js-runtimes', 'node',
      '--max-filesize', '500M',
      '--format', 'best[ext=mp4][height<=720]/best[height<=720]',
      '--output', '-',
      youtubeUrl
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => child.kill('SIGKILL'), downloadTimeoutMs);
    child.stdout.pipe(response);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => console.error(chunk.trim()));
    child.on('error', (error) => {
      clearTimeout(timer);
      console.error('No se pudo iniciar yt-dlp:', error.message);
      if (!response.headersSent) sendJson(response, 500, { error: 'No se pudo iniciar la descarga.' });
      else response.destroy(error);
      finish();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !response.writableEnded) response.destroy();
      finish();
    });
    request.on('aborted', () => {
      if (child && !child.killed) child.kill('SIGTERM');
      finish();
    });
    response.on('close', () => {
      if (!response.writableEnded && child && !child.killed) child.kill('SIGTERM');
      finish();
    });
  } catch (error) {
    console.error('Error preparando la descarga:', error.message);
    if (!response.headersSent) sendJson(response, 500, { error: 'No se pudo preparar la descarga.' });
    else response.destroy(error);
    finish();
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'ytdown-backend' });
    return;
  }
  if (pathname === '/api/info') {
    handleInfo(requestUrl, response);
    return;
  }
  if (pathname === '/api/download') {
    handleDownload(request, requestUrl, response);
    return;
  }
  const asset = files[pathname];

  if (!asset) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No encontrado');
    return;
  }

  fs.readFile(path.join(root, asset[0]), (error, content) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('No se pudo cargar la aplicación');
      return;
    }

    response.writeHead(200, {
      'Content-Type': asset[1],
      'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    response.end(content);
  });
});

server.listen(port, host, () => {
  console.log(`Aula Offline disponible en http://127.0.0.1:${port}`);
});
