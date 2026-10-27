// Runtime settings. Empty apiUrl means "use the build-time VITE_API_URL, or
// the same origin in development". The Cloud Run nginx image overwrites this
// file at startup (see deploy/40-runtime-config.sh).
window.__APP_CONFIG__ = { apiUrl: '' }
