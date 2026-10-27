/** Runtime configuration, read from /config.js so one build works in every environment. */
declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string }
  }
}

/** Base URL of the backend API, without a trailing slash. Empty means same origin. */
export const API_URL = (window.__APP_CONFIG__?.apiUrl ?? '').replace(/\/$/, '')
