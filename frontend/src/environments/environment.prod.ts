const DEFAULT_API_PORT = '8443';

const resolveApiUrl = (): string => {
    if (typeof window === 'undefined') {
        return `/api`;
    }

    const globalApiUrl = (window as any).__API_URL__;
    if (globalApiUrl) {
        return String(globalApiUrl);
    }

    const { protocol, hostname, port } = window.location;

    // En production, utiliser l'URL relative pour passer par le proxy nginx
    if (port && port !== '80' && port !== '443') {
        return `${protocol}//${hostname}:${port}/api`;
    }

    return `${protocol}//${hostname}/api`;
};

export const environment = {
    // IMPORTANT : En production, tous les logs de debug sont désactivés
    production: true,
    apiUrl: resolveApiUrl()
};









