import { expect, test } from '@playwright/test'

import { mockApi } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('headline tells the biggest move of the day', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solana is up 8.4% today.')
})

test('movers switch between crypto and US stocks', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /SOL/ }).first()).toBeVisible()
  await page.getByRole('radio', { name: 'US stocks' }).click()
  await expect(page.getByRole('button', { name: /NVDA/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /INTC/ })).toBeVisible()
})

test('clicking a mover opens it on the dashboard and in the URL', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /INJ/ }).click()
  await expect(page).toHaveURL(/a=crypto%3AINJ-USDT|a=crypto:INJ-USDT/)
  await expect(page.getByRole('heading', { name: 'INJ/USDT price' })).toBeVisible()
})

test('search finds a stock and opens it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').first().fill('apple')
  await page.getByRole('option', { name: /AAPL/ }).click()
  await expect(page.getByRole('heading', { name: 'AAPL price' })).toBeVisible()
  await expect(page.locator('#desk').getByText('$228.00').first()).toBeVisible()
})

test('watchlist changes are kept after a reload', async ({ page }) => {
  await page.goto('/?a=stock:NVDA')
  await page.getByRole('button', { name: 'Add to watchlist' }).click()
  const watchlist = page.locator('#watchlist')
  await expect(watchlist.getByText('NVDA', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('#watchlist').getByText('NVDA', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove NVDA from watchlist' }).click()
  await expect(page.locator('#watchlist').getByText('NVDA', { exact: true })).toHaveCount(0)
})

test('an unknown ticker explains what happened', async ({ page }) => {
  await page.goto('/?a=stock:ZZZZ')
  await expect(page.getByText('No prices found for this symbol.')).toBeVisible()
})

test('the page never scrolls sideways', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
