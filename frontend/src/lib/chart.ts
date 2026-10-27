/** Small numeric helpers shared by the charts. */

/** Axis precision: more decimals for cheap coins. */
export function precisionFor(price: number): { precision: number; minMove: number } {
  const p = Math.abs(price) || 1
  const precision =
    p >= 100 ? 2 : p >= 1 ? 3 : Math.min(8, Math.max(4, -Math.floor(Math.log10(p)) + 3))
  return { precision, minMove: 1 / 10 ** precision }
}

/** Round axis ticks (e.g. −10%, −5%, 0%, 5%) that always include 0 and cover the data. */
export function percentTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1)
  const raw = span / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let i = Math.floor(min / step); i <= Math.ceil(max / step); i++)
    ticks.push(+(i * step).toFixed(6))
  // A price can't fall more than 100%, so never label the axis below that.
  if (ticks[0] < -100) ticks[0] = -100
  return ticks
}
