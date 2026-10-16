const resolveApiUrl = (): string => {
    if (typeof window === 'undefined') {
        return '/api';
    }

    const globalApiUrl = (window as any).__API_URL__;
    if (globalApiUrl) {
        return String(globalApiUrl);
    }

    const { protocol, hostname, port } = window.location;
    if (port && port !== '80' && port !== '443') {
        if (port === '4200') {
            return '/api';
        }
        return `${protocol}//${hostname}:${port}/api`;
    }
    return `${protocol}//${hostname}/api`;
};

export const environment = {
    production: true,
    apiUrl: resolveApiUrl()
};
