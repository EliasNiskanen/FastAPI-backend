/**
 * Series colours for the comparison chart. Each asset keeps its colour while
 * others are added or removed (colour follows the asset, not its position),
 * using a hash of the asset key with linear probing for collisions.
 * The five hues are validated for colour-vision deficiency on the panel colour.
 */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Assign each key (at most five) a colour slot that stays stable as the list changes. */
export function colorSlots(keys: string[]): Map<string, string> {
  const taken = new Set<number>()
  const slots = new Map<string, string>()
  for (const key of keys.slice(0, SERIES_COLORS.length)) {
    let slot = hash(key) % SERIES_COLORS.length
    while (taken.has(slot)) slot = (slot + 1) % SERIES_COLORS.length
    taken.add(slot)
    slots.set(key, SERIES_COLORS[slot])
  }
  return slots
}
