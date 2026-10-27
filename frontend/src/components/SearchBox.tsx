import clsx from 'clsx'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { SearchResult } from '../api/client'
import { useSearch } from '../api/hooks'
import { DEFAULT_QUOTE, type Asset } from '../lib/asset'
import { rememberName } from '../lib/names'
import { useDebounced } from '../lib/state'

const TICKER = /^[A-Za-z][A-Za-z0-9.-]{0,9}$/

interface Option {
  id: string
  asset: Asset
  symbol: string
  name: string
  detail: string
}

/** Convert a search hit into a selectable option. */
function toOption(r: SearchResult): Option {
  const asset: Asset =
    r.asset_class === 'stock'
      ? { kind: 'stock', symbol: r.symbol }
      : { kind: 'crypto', symbol: r.symbol, quote: r.quote ?? DEFAULT_QUOTE }
  return {
    id: `${r.asset_class}:${r.symbol}`,
    asset,
    symbol: r.symbol,
    name: r.name,
    detail: r.asset_class === 'stock' ? (r.exchange ?? 'Stock') : 'Crypto',
  }
}

/**
 * Search for stocks and coins by ticker or name (an ARIA combobox).
 * Type, use the arrow keys, press Enter. "/" focuses the box from anywhere.
 */
export function SearchBox({
  onSelect,
  size = 'large',
  shortcut = false,
  kinds = ['crypto'],
  placeholder,
  label = 'Search stocks and crypto',
}: {
  onSelect: (asset: Asset) => void
  size?: 'large' | 'compact'
  shortcut?: boolean
  /** Which markets to show results for (follows the page's market mode). */
  kinds?: Asset['kind'][]
  placeholder?: string
  label?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const query = useDebounced(text, 180)
  const search = useSearch(query)

  const options = useMemo(() => {
    const found = (search.data?.results ?? [])
      .filter((r) => kinds.includes(r.asset_class))
      .map(toOption)
    // If the stock list is unavailable (or a ticker isn't listed), still let
    // people open an exact ticker as a stock.
    const typed = query.trim().toUpperCase()
    if (kinds.includes('stock') && TICKER.test(typed) && !found.some((o) => o.symbol === typed)) {
      found.push({
        id: `stock:${typed}:direct`,
        asset: { kind: 'stock', symbol: typed },
        symbol: typed,
        name: `Open ${typed} as a US stock ticker`,
        detail: 'Ticker',
      })
    }
    return found
  }, [search.data, query, kinds])

  useEffect(() => {
    search.data?.results.forEach((r) => {
      const o = toOption(r)
      rememberName(o.asset, r.name)
    })
  }, [search.data])

  // "/" focuses the search from anywhere, like many developer tools.
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA'].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  function choose(option: Option | undefined) {
    if (!option) return
    onSelect(option.asset)
    setText('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && text.trim().length > 0
  const large = size === 'large'

  return (
    <div className="relative w-full">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div
        className={clsx(
          'tone flex items-center gap-3 border border-line bg-panel focus-within:border-accent',
          large ? 'float-shadow h-16 rounded-full px-6' : 'h-10 rounded-full px-4',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={clsx('shrink-0 text-ink-3', large ? 'size-5' : 'size-4')}
        >
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? (large ? 'Search a company, ticker or coin' : 'Search')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={clsx(
            'min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3',
            large ? 'text-lg' : 'text-sm',
          )}
        />
        {shortcut && (
          <kbd className="hidden rounded-md border border-line px-1.5 text-xs text-ink-3 sm:block">
            /
          </kbd>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="float-shadow absolute inset-x-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-line bg-panel py-2"
        >
          {options.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-3" role="presentation">
              {search.isFetching || query !== text
                ? 'Searching…'
                : `No matches for “${text.trim()}”.`}
            </li>
          )}
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                'relative flex cursor-pointer items-center gap-4 px-4 py-2.5',
                i === active &&
                  'bg-raised before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent',
              )}
            >
              <span className="w-20 shrink-0 font-semibold font-wide text-ink">{o.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{o.name}</span>
              <span className="shrink-0 text-xs text-ink-3">{o.detail}</span>
            </li>
          ))}
          {search.data?.partial && (
            <li
              role="presentation"
              className="border-t border-line px-4 pt-2.5 pb-1.5 text-xs text-ink-3"
            >
              Some results may be missing: the stock list is temporarily unavailable.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
