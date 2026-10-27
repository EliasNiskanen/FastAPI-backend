// Local development: an empty apiUrl means "same origin"; Vite proxies /api
// to the backend. In production the container overwrites this file with the
// real backend address (see docker-entrypoint.d/40-runtime-config.sh).
window.__APP_CONFIG__ = { apiUrl: '' }
