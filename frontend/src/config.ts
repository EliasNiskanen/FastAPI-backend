/**
 * Where the backend API lives, without a trailing slash. Empty means "same
 * origin" (local development, where Vite proxies /api to the backend).
 *
 * Two sources, so one build works everywhere:
 * 1. window.__APP_CONFIG__.apiUrl from /config.js, written at container start
 *    by the nginx image (Cloud Run). A non-empty value always wins.
 * 2. VITE_API_URL baked in at build time from .env.production, used by the
 *    static Cloudflare deployment, which has no container to write config.js.
 */
declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string }
  }
}

const runtime = window.__APP_CONFIG__?.apiUrl
const buildTime = import.meta.env.VITE_API_URL as string | undefined

export const API_URL = (runtime || buildTime || '').replace(/\/$/, '')
