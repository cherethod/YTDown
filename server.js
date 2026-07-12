const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { extractVideoId } = require('./logic');

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';
const root = __dirname;
const maxConcurrentDownloads = Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 2;
const downloadTimeoutMs = Number(process.env.DOWNLOAD_TIMEOUT_MS) || 10 * 60 * 1000;
const potProviderUrl = String(process.env.POT_PROVIDER_URL || '').replace(/\/$/, '');
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

function runYtDlp(args, timeoutMs = 45_000, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('Descarga cancelada.')));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('La operación tardó demasiado.')));
    }, timeoutMs);

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      finish(() => reject(error));
    });
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `yt-dlp terminó con código ${code}`));
      });
    });
  });
}

function canonicalYoutubeUrl(value) {
  const id = extractVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function youtubeRuntimeArgs() {
  const args = ['--js-runtimes', 'node'];
  if (potProviderUrl) {
    args.push(
      '--extractor-args', `youtubepot-bgutilhttp:base_url=${potProviderUrl}`,
      '--extractor-args', 'youtube:player_client=mweb;player_skip=webpage'
    );
  }
  return args;
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
      ...youtubeRuntimeArgs(),
      '--skip-download',
      '--dump-single-json',
      youtubeUrl
    ]);
    const info = JSON.parse(output);
    const availableResolutions = [...new Set(
      (info.formats || [])
        .filter((format) => format.vcodec && format.vcodec !== 'none' && Number.isFinite(format.height))
        .map((format) => format.height)
    )].sort((a, b) => b - a);
    sendJson(response, 200, {
      title: info.title,
      duration: info.duration_string,
      availableResolutions,
      maxResolution: availableResolutions[0] ? `${availableResolutions[0]}p` : null,
      url: youtubeUrl
    });
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
  const abortController = new AbortController();
  let tempDir;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    activeDownloads = Math.max(0, activeDownloads - 1);
  };
  const cleanup = async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
    }
    finish();
  };

  request.on('aborted', () => abortController.abort());
  response.on('close', () => {
    if (!response.writableEnded) abortController.abort();
  });

  try {
    let title = 'video';
    try {
      title = (await runYtDlp([
        '--no-playlist', '--no-warnings', ...youtubeRuntimeArgs(),
        '--print', '%(title)s', '--skip-download', youtubeUrl
      ])).trim().split(/\r?\n/)[0];
    } catch {
      // La descarga todavía puede funcionar aunque falle la consulta del título.
    }

    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdown-'));
    const output = await runYtDlp([
      '--no-playlist',
      '--no-warnings',
      '--no-progress',
      ...youtubeRuntimeArgs(),
      '--max-filesize', '750M',
      '--format', 'bv[height=1080]+ba[ext=m4a]/bv[height=1080]+ba/bv[height<=1080]+ba[ext=m4a]/bv[height<=1080]+ba/b[height<=1080]',
      '--merge-output-format', 'mp4',
      '--remux-video', 'mp4',
      '--output', path.join(tempDir, '%(id)s.%(ext)s'),
      '--print', 'after_move:RESOLUTION:%(height)sp',
      '--print', 'after_move:filepath',
      youtubeUrl
    ], downloadTimeoutMs, abortController.signal);

    const outputLines = output.trim().split(/\r?\n/).filter(Boolean);
    const outputPath = outputLines.find((line) => path.resolve(line).startsWith(path.resolve(tempDir)));
    const resolution = outputLines.find((line) => line.startsWith('RESOLUTION:'))?.slice('RESOLUTION:'.length) || 'video';
    if (!outputPath || !path.resolve(outputPath).startsWith(path.resolve(tempDir))) {
      throw new Error('yt-dlp no devolvió un archivo válido.');
    }
    const stats = await fs.promises.stat(outputPath);
    console.log(`Descarga preparada: ${resolution}, ${stats.size} bytes`);

    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${safeFilename(title)} [${safeFilename(resolution)}].mp4"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });

    const fileStream = fs.createReadStream(outputPath);
    fileStream.on('error', (error) => response.destroy(error));
    response.on('finish', cleanup);
    response.on('close', cleanup);
    fileStream.pipe(response);
  } catch (error) {
    console.error('Error preparando la descarga:', error.message);
    if (!response.headersSent) sendJson(response, 500, { error: 'No se pudo preparar la descarga.' });
    else response.destroy(error);
    await cleanup();
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
