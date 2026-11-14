#!/usr/bin/env node
/*
 * Serveur du frontend construit (ng build --configuration production) pour les
 * environnements TEST (4201) et PROD (4200), à la place de `ng serve`.
 *
 * Pourquoi : `ng serve` utilise la configuration "development" (bundle initial
 * ~17 Mo non minifié, JIT, recompilation de ~2-3 min à chaque démarrage). Ici les
 * fichiers sont déjà compilés/minifiés : démarrage instantané, ~5x moins d'octets
 * à transférer, compression gzip/brotli et cache navigateur longue durée.
 *
 * Aucune dépendance npm : uniquement les modules Node intégrés.
 *
 * Variables d'environnement :
 *   PORT          port d'écoute (défaut 4200)
 *   DIST_DIR      dossier du build (défaut ./dist/csv-reconciliation)
 *   BACKEND_URL   backend cible du proxy /api (défaut https://localhost:8443)
 *   SSL_KEY / SSL_CERT  certificats ; absents => HTTP simple
 *   HOST          interface d'écoute (défaut 0.0.0.0)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '4200', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, 'dist', 'csv-reconciliation'));
const BACKEND = new URL(process.env.BACKEND_URL || 'https://localhost:8443');
const SSL_KEY = process.env.SSL_KEY || '';
const SSL_CERT = process.env.SSL_CERT || '';
const PROXY_TIMEOUT_MS = 60 * 60 * 1000; // 60 min : gros fichiers de réconciliation (cf. proxy.conf.js)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.csv', '.ico', '.ttf', '.eot', '.webmanifest']);
// Fichiers nommés avec une empreinte (main.3f2a….js) : immuables, cache 1 an.
const HASHED = /\.[0-9a-f]{16,}\.(js|css|mjs)$|\.[0-9a-f]{16,}\.[a-z0-9]+$/i;

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error(`[frontend] Build introuvable : ${DIST_DIR}\\index.html. Lancer "npm run build" d'abord.`);
  process.exit(1);
}

// Cache mémoire des fichiers statiques compressés (le build est figé pendant la vie du process).
const cache = new Map();

function loadEntry(filePath) {
  let entry = cache.get(filePath);
  if (entry) return entry;
  const raw = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  entry = { raw, type: MIME[ext] || 'application/octet-stream', gzip: null, br: null };
  if (COMPRESSIBLE.has(ext) && raw.length > 1024) {
    entry.br = zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length }
    });
    entry.gzip = zlib.gzipSync(raw, { level: 9 });
  }
  const isIndex = path.basename(filePath) === 'index.html';
  entry.cacheControl = isIndex
    ? 'no-cache'
    : HASHED.test(path.basename(filePath))
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';
  entry.etag = `"${raw.length.toString(16)}-${fs.statSync(filePath).mtimeMs.toString(16)}"`;
  cache.set(filePath, entry);
  return entry;
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400); res.end(); return;
  }
  let filePath = path.normalize(path.join(DIST_DIR, urlPath));
  if (!filePath.startsWith(DIST_DIR)) { // traversée de répertoire
    res.writeHead(403); res.end(); return;
  }
  let stat = null;
  try { stat = fs.statSync(filePath); } catch { /* absent */ }
  if (!stat || stat.isDirectory()) {
    // Route Angular (SPA) : index.html. Un fichier avec extension absent reste un 404.
    if (path.extname(urlPath) && urlPath !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return;
    }
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const entry = loadEntry(filePath);
  const headers = {
    'Content-Type': entry.type,
    'Cache-Control': entry.cacheControl,
    'ETag': entry.etag,
    'Vary': 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff'
  };
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers); res.end(); return;
  }
  const accept = String(req.headers['accept-encoding'] || '');
  let body = entry.raw;
  if (entry.br && /\bbr\b/.test(accept)) {
    body = entry.br; headers['Content-Encoding'] = 'br';
  } else if (entry.gzip && /\bgzip\b/.test(accept)) {
    body = entry.gzip; headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// Proxy /api en flux (pas de mise en mémoire : uploads de plusieurs centaines de Mo).
const backendAgent = new (BACKEND.protocol === 'https:' ? https : http).Agent({
  keepAlive: true,
  maxSockets: 256,
  rejectUnauthorized: false // backend local en HTTPS avec certificat du domaine public
});
const backendClient = BACKEND.protocol === 'https:' ? https : http;

function proxyApi(req, res) {
  const headers = { ...req.headers, host: BACKEND.host };
  delete headers.expect; // « 100 Continue » déjà répondu par Node au client
  const clientIp = req.socket.remoteAddress || '';
  headers['x-forwarded-for'] = headers['x-forwarded-for'] ? `${headers['x-forwarded-for']}, ${clientIp}` : clientIp;
  headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http';
  headers['x-forwarded-host'] = req.headers.host || '';

  const upstream = backendClient.request({
    protocol: BACKEND.protocol,
    hostname: BACKEND.hostname,
    port: BACKEND.port,
    method: req.method,
    path: req.url,
    headers,
    agent: backendAgent,
    timeout: PROXY_TIMEOUT_MS
  }, (upRes) => {
    const outHeaders = { ...upRes.headers };
    delete outHeaders['x-powered-by'];
    res.writeHead(upRes.statusCode || 502, outHeaders);
    upRes.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('Délai du backend dépassé')));
  upstream.on('error', (err) => {
    console.error('[Proxy Error]', err.code || '', err.message, 'for', req.method, req.url,
      err.code === 'ECONNREFUSED' ? '(backend arrete ou en cours de demarrage)' : '');
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', message: err.message, code: err.code }));
    } else {
      res.destroy();
    }
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

function handler(req, res) {
  if (req.url === '/api' || req.url.startsWith('/api/') || req.url.startsWith('/api?')) {
    proxyApi(req, res);
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
  } else {
    res.writeHead(405); res.end();
  }
}

const server = SSL_KEY && SSL_CERT
  ? https.createServer({ key: fs.readFileSync(SSL_KEY), cert: fs.readFileSync(SSL_CERT) }, handler)
  : http.createServer(handler);
// Uploads longs : pas de coupure côté Node (le timeout est géré sur la requête backend).
server.requestTimeout = 0;
server.headersTimeout = 120000;
server.keepAliveTimeout = 65000;
server.timeout = 0;

server.listen(PORT, HOST, () => {
  const scheme = SSL_KEY && SSL_CERT ? 'https' : 'http';
  console.log(`[frontend] ${scheme}://${HOST}:${PORT}  dist=${DIST_DIR}  /api -> ${BACKEND.origin}`);
  // Préchauffage : compresse d'avance les fichiers du build pour que le premier
  // utilisateur n'attende pas la compression brotli (≈1 s pour main.js).
  setImmediate(() => {
    const t0 = Date.now();
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (COMPRESSIBLE.has(path.extname(p).toLowerCase())) {
        try { loadEntry(p); } catch (e) { console.warn('[frontend] prechauffage', p, e.message); }
      }
    });
    walk(DIST_DIR);
    console.log(`[frontend] ${cache.size} fichiers compresses en ${Date.now() - t0} ms`);
  });
});
