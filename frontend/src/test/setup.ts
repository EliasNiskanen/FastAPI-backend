import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount rendered components between tests (Vitest has no implicit globals).
afterEach(() => cleanup())
