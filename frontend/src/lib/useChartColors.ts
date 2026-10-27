/**
 * Colours for canvas charts. Lightweight Charts draws on a canvas and can't
 * read CSS variables, so this resolves the current mode's tokens to plain
 * colour strings and updates them whenever the mode or theme changes.
 */
import { useMemo } from 'react'

import { useMode, useTheme } from './prefs'

export interface ChartColors {
  ink3: string
  line: string
  raised: string
  accent: string
  up: string
  down: string
  upFaint: string
  downFaint: string
  seriesA: string
  seriesB: string
}

function read(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Hex colour plus alpha, e.g. ("#4cc98f", 0.3) -> "rgba(76, 201, 143, 0.3)". */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function useChartColors(): ChartColors {
  const mode = useMode()
  const theme = useTheme()
  return useMemo(() => {
    const up = read('--up') || '#4cc98f'
    const down = read('--down') || '#ff6b6b'
    return {
      ink3: read('--ink-3'),
      line: read('--line'),
      raised: read('--raised'),
      accent: read('--accent'),
      up,
      down,
      upFaint: withAlpha(up, 0.3),
      downFaint: withAlpha(down, 0.3),
      seriesA: read('--series-a'),
      seriesB: read('--series-b'),
    }
    // mode and theme decide which CSS variables are active
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, theme])
}
