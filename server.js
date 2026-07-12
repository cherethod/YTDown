const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '0.0.0.0';
const root = __dirname;
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/logic.js': ['logic.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
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
