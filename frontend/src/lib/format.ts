/** Number formatting for prices, changes and volumes. All output is en-US. */

const FIAT = new Set(['USD', 'EUR', 'GBP'])
const STABLE_AS_USD = new Set(['USDT', 'USDC', 'FDUSD'])

/** Decimal places that keep ~5 significant digits for small prices (e.g. 0.00001823). */
function priceDigits(value: number): number {
  const abs = Math.abs(value)
  if (abs >= 1000) return 2
  if (abs >= 1) return abs >= 100 ? 2 : 3
  if (abs === 0) return 2
  return Math.min(10, Math.max(4, -Math.floor(Math.log10(abs)) + 3))
}

/** A price with a currency sign where one is standard: $228.00, €90,390.00, 0.000018 BTC. */
export function formatPrice(value: number, currency = 'USD'): string {
  const digits = priceDigits(value)
  const number = value.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  })
  if (currency === 'USD' || STABLE_AS_USD.has(currency)) return `$${number}`
  if (currency === 'EUR') return `€${number}`
  if (FIAT.has(currency)) return `${number} ${currency}`
  return `${number} ${currency}`
}

/** A signed percentage with a real minus sign: +8.40%, −4.45%. */
export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(digits)}%`
}

/** A signed absolute change in the asset's price precision: +17.08, −0.0042. */
export function formatChange(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const digits = priceDigits(value)
  return `${sign}${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  })}`
}

/** Large numbers in compact form: 1.9B, 58.4M, 912K. */
export function formatCompact(value: number): string {
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
}

/** Direction of a change, for colour and arrow. */
export function direction(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
}
