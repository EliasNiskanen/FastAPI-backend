import { setMode, useMode, type Mode } from '../lib/prefs'
import { Segmented } from './Segmented'

const OPTIONS: { value: Mode; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'stock', label: 'Stocks' },
]

/** Switch the whole site between all markets, crypto only and stocks only. */
export function ModeSwitch({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const mode = useMode()
  return <Segmented label="Market" value={mode} onChange={setMode} options={OPTIONS} size={size} />
}
