/**
 * Market mode (all / crypto / stock) and colour theme (dark / light).
 *
 * Both live on <html> as data attributes, which switch the CSS colour tokens
 * in index.css. The mode is kept in the URL (?m=crypto), so every visit
 * starts on "all" unless a link says otherwise. The theme is remembered in
 * this browser and otherwise follows the operating system.
 * index.html sets both before the first paint to avoid a colour flash.
 */
import { useSyncExternalStore } from 'react'

import type { Asset } from './asset'
import { STOCKS_ENABLED } from './features'

export type Mode = 'all' | 'crypto' | 'stock'
export type Theme = 'dark' | 'light'

const THEME_KEY = 'bullbearscope.theme'
const listeners = new Set<() => void>()
const root = () => document.documentElement

function notify() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Parse a mode from the URL; anything else means "all". */
export function parseMode(value: string | null | undefined): Mode {
  return value === 'crypto' || value === 'stock' ? value : 'all'
}

export function getMode(): Mode {
  return parseMode(root().dataset.mode)
}

export function getTheme(): Theme {
  return root().dataset.theme === 'light' ? 'light' : 'dark'
}

/** Switch market mode: recolours the page and updates ?m= in the URL. */
export function setMode(mode: Mode) {
  root().dataset.mode = mode
  const url = new URL(window.location.href)
  if (mode === 'all') url.searchParams.delete('m')
  else url.searchParams.set('m', mode)
  window.history.replaceState(null, '', url)
  notify()
}

/** Switch light/dark and remember the choice in this browser. */
export function setTheme(theme: Theme) {
  root().dataset.theme = theme
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage unavailable (private mode): the choice lasts for this visit.
  }
  notify()
}

/** The current market mode; re-renders when it changes. */
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getMode)
}

/** The current colour theme; re-renders when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme)
}

// Keep the mode in sync with the URL when the user goes back/forward.
window.addEventListener('popstate', () => {
  const mode = parseMode(new URLSearchParams(window.location.search).get('m'))
  if (mode !== getMode()) {
    root().dataset.mode = mode
    notify()
  }
})

/** Which markets search and lists cover in a mode. */
export function kindsFor(mode: Mode): Asset['kind'][] {
  if (!STOCKS_ENABLED) return ['crypto']
  return mode === 'all' ? ['stock', 'crypto'] : [mode]
}
