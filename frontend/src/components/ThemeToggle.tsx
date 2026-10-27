import { setTheme, useTheme } from '../lib/prefs'

/** Switch between the dark and light versions of the current mode's colours. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="tone grid size-9 shrink-0 place-items-center rounded-full bg-raised text-ink-2 hover:text-ink"
    >
      {theme === 'dark' ? (
        // Sun: the light theme
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4.5">
          <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Moon: the dark theme
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4.5">
          <path
            d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
