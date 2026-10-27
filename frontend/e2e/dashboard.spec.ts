import { expect, test, type Page } from '@playwright/test'

import { mockApi } from './fixtures.ts'

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

/** The chart popup. */
const dialog = (page: Page) => page.getByRole('dialog')

/** A row in the market lists (the ticker ribbon also has buttons, but it moves). */
const listRow = (page: Page, name: RegExp) =>
  page.locator('#markets').getByRole('button', { name }).first()

test('the front page shows all markets and leads with the biggest move', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'all')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Intel Corporation is down 10.3% today.',
  )
  await expect(listRow(page, /SOL/)).toBeVisible()
  await expect(listRow(page, /NVDA/)).toBeVisible()
})

test('the market switch changes lists, colours and the URL', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Crypto' }).first().click()
  await expect(page).toHaveURL(/m=crypto/)
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'crypto')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solana is up 8.4% today.')
  await expect(page.locator('#markets').getByRole('button', { name: /NVDA/ })).toHaveCount(0)

  await page.getByRole('radio', { name: 'Stocks' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stock')
  await expect(listRow(page, /NVDA/)).toBeVisible()
})

test('the theme toggle switches light and dark and is remembered', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  const before = await html.getAttribute('data-theme')
  await page.getByRole('button', { name: /Switch to (light|dark) theme/ }).click()
  await expect(html).not.toHaveAttribute('data-theme', before!)
  await page.reload()
  await expect(html).not.toHaveAttribute('data-theme', before!)
})

test('clicking a row opens the chart in a popup, Esc closes it', async ({ page }) => {
  await page.goto('/')
  await listRow(page, /INJ/).click()
  await expect(dialog(page)).toBeVisible()
  await expect(page).toHaveURL(/a=crypto(%3A|:)INJ-USDT/)
  await expect(dialog(page).getByRole('heading', { name: /INJ\/USDT/ })).toBeVisible()
  await expect(dialog(page).getByText('$21.00').first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page).not.toHaveURL(/a=/)
})

test('the time range buttons change the candles', async ({ page }) => {
  await page.goto('/?a=stock:AAPL')
  const ranges = dialog(page).getByRole('radiogroup', { name: 'Time range' })
  await expect(ranges.getByRole('radio', { name: '1M' })).toBeChecked()
  for (const label of ['15M', '1D', '1Y', 'All']) {
    const request = page.waitForRequest(/\/api\/stocks\/AAPL/)
    await ranges.getByRole('radio', { name: label }).click()
    await request
    await expect(ranges.getByRole('radio', { name: label })).toBeChecked()
  }
  await expect(dialog(page).getByText('over all available history')).toBeVisible()
})

test('search finds a stock and opens its chart', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').first().fill('apple')
  await page.getByRole('option', { name: /AAPL/ }).click()
  await expect(dialog(page).getByRole('heading', { name: /AAPL/ })).toBeVisible()
  await expect(dialog(page).getByText('$228.00').first()).toBeVisible()
})

test('two assets can be compared on one chart', async ({ page }) => {
  await page.goto('/?a=stock:AAPL')
  await dialog(page)
    .getByRole('combobox', { name: /Compare/ })
    .fill('sol')
  await page.getByRole('option', { name: /SOL/ }).click()
  await expect(dialog(page).getByText('Compared with')).toBeVisible()
  const legend = dialog(page).getByRole('list', { name: 'Legend' })
  await expect(legend).toContainText('AAPL')
  await expect(legend).toContainText('SOL/USDT')

  await dialog(page).getByRole('button', { name: 'Stop comparing' }).click()
  await expect(legend).toBeHidden()
})

test('watchlist changes are kept after a reload', async ({ page }) => {
  await page.goto('/?a=stock:NVDA')
  await dialog(page).getByRole('button', { name: 'Add to watchlist' }).first().click()
  await page.keyboard.press('Escape')
  const watchlist = page.locator('#watchlist')
  await expect(watchlist.getByText('NVDA', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('#watchlist').getByText('NVDA', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove NVDA from watchlist' }).click()
  await expect(page.locator('#watchlist').getByText('NVDA', { exact: true })).toHaveCount(0)
})

test('an unknown ticker explains what happened', async ({ page }) => {
  await page.goto('/?a=stock:ZZZZ')
  await expect(dialog(page).getByText('No prices found for this symbol.')).toBeVisible()
})

test('the page never scrolls sideways', async ({ page }) => {
  for (const mode of ['all', 'crypto', 'stock']) {
    await page.goto(`/?m=${mode}`)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  }
})
