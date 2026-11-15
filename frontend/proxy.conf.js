// Détection automatique de l'environnement backend
function getBackendTarget() {
  // Vérifier si une variable d'environnement est définie
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }

  // Vérifier le hostname pour déterminer l'environnement
  const hostname = require('os').hostname().toLowerCase();

  // Si on est sur le serveur de production (détecté par le hostname)
  // ou si BACKEND_URL est défini, utiliser l'URL appropriée
  if (hostname.includes('reconciliation') || hostname.includes('intouchgroup')) {
    return 'https://reconciliation.intouchgroup.net:8443';
  }

  // Backend local - le proxy Angular tourne sur la même machine
  return 'https://localhost:8443';
}

const backendTarget = getBackendTarget();
console.log('Proxy configuration: Backend target =', backendTarget);

const PROXY_CONFIG = {
  // Configuration du proxy API uniquement
  // Les chemins WebSocket du dev-server (sockjs-node, webpack-dev-server) ne sont PAS proxifiés
  // car ils ne commencent pas par /api
  "/api": {
    "target": backendTarget,
    "secure": false,
    "changeOrigin": true,
    "logLevel": "info",
    "timeout": 3600000, // 60 minutes pour les très gros fichiers (augmenté de 30 à 60 minutes)
    "proxyTimeout": 3600000,
    // CRITICAL: Désactiver le proxy WebSocket pour éviter les déconnexions du dev-server
    // Les WebSockets du dev-server (sockjs-node, webpack-dev-server) ne doivent pas être proxifiés
    "ws": false,
    "headers": {
      "Connection": "keep-alive"
    },
    "onError": function(err, req, res) {
      // Ignorer les erreurs WebSocket (normal pour le dev-server)
      if (req && req.headers && 
          (req.headers.upgrade === 'websocket' || 
           (req.headers.connection && req.headers.connection.toLowerCase().includes('upgrade')))) {
        return;
      }
      console.error('[Proxy Error]', err.code, err.message, 'for', req.url);
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({
          error: 'Proxy error',
          message: err.message,
          code: err.code
        }));
      }
    },
    "onProxyReq": function(proxyReq, req, res) {
      // Ignorer les requêtes WebSocket
      if (req.headers.upgrade === 'websocket' || 
          (req.headers.connection && req.headers.connection.toLowerCase().includes('upgrade'))) {
        return;
      }
      proxyReq.setTimeout(3600000); // 60 minutes
      // Log uniquement pour les requêtes importantes
      if (req.url.includes('/reconcile') || req.url.includes('/upload')) {
        console.log('[Proxy]', req.method, req.url, '->', backendTarget + req.url);
      }
    },
    "onProxyRes": function(proxyRes, req, res) {
      delete proxyRes.headers['x-powered-by'];
      if (!proxyRes.headers['access-control-allow-origin']) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
      }
    },
    "onClose": function(res, socket, head) {
      // Ignorer les fermetures WebSocket normales
      if (!socket || (socket.readyState && socket.readyState === socket.OPEN)) {
        return;
      }
      // Log uniquement en cas d'erreur réelle
      if (socket && socket.destroyed) {
        console.warn('[Proxy] Connection closed unexpectedly');
      }
    }
  }
};

module.exports = PROXY_CONFIG;

