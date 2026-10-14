const DEFAULT_API_PORT = '8443';

const resolveApiUrl = (): string => {
    if (typeof window === 'undefined') {
        return `http://localhost:${DEFAULT_API_PORT}/api`;
    }

    const globalApiUrl = (window as any).__API_URL__;
    if (globalApiUrl) {
        return String(globalApiUrl);
    }

    const { protocol, hostname, port } = window.location;

    // En dev, préférer toujours une URL relative pour passer par le proxy Angular (/api -> backend).
    // Ça évite les soucis de TLS, CORS, et les timeouts quand :8443 n'est pas exposé sur le réseau.
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `/api`;
    }

    if (port && port !== '80' && port !== '443') {
        if (port === '4200') {
            return `/api`;
        }
        return `${protocol}//${hostname}:${port}/api`;
    }

    return `${protocol}//${hostname}/api`;
};

export const environment = {
    production: false,
    apiUrl: resolveApiUrl()
};