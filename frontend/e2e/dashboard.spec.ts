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

test('the front page leads with the biggest coin move and says stocks are paused', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'all')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solana is up 8.4% today.')
  await expect(
    page.getByRole('status').filter({ hasText: 'Stock prices are paused' }),
  ).toBeVisible()
  await expect(listRow(page, /SOL/)).toBeVisible()
  await expect(listRow(page, /BTC/)).toBeVisible() // major coins
})

test('no stock data is requested while stocks are paused', async ({ page }) => {
  const stockCalls: string[] = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('/api/stocks/') || url.includes('asset_class=stock')) stockCalls.push(url)
  })
  await page.goto('/')
  await expect(listRow(page, /SOL/)).toBeVisible()
  await page.goto('/?a=stock:AAPL')
  await expect(dialog(page).getByText(/commercial data licence/)).toBeVisible()
  expect(stockCalls).toEqual([])
})

test('the Stocks tab explains that stock prices will be back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Stocks' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stock')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Stock prices are taking a break.',
  )
  await expect(page.getByText(/back as soon as BullBearScope has funding/)).toBeVisible()
  await page.getByRole('button', { name: 'Browse crypto' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'crypto')
  await expect(page).toHaveURL(/m=crypto/)
  // The pause banner is only on the All tab.
  await expect(page.getByText('Stock prices are paused for now.', { exact: false })).toHaveCount(0)
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
  await page.goto('/?m=crypto')
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
  await page.goto('/?a=crypto:BTC-USDT')
  const ranges = dialog(page).getByRole('radiogroup', { name: 'Time range' })
  await expect(ranges.getByRole('radio', { name: '1M' })).toBeChecked()
  for (const label of ['15M', '1D', '1Y', 'All']) {
    const request = page.waitForRequest(/\/api\/crypto\/BTC/)
    await ranges.getByRole('radio', { name: label }).click()
    await request
    await expect(ranges.getByRole('radio', { name: label })).toBeChecked()
  }
  await expect(dialog(page).getByText('over all available history')).toBeVisible()
})

test('saved daily candles stand in when intraday data is unavailable', async ({ page }) => {
  await page.goto('/?a=crypto:INJ-USDT')
  await dialog(page).getByRole('radio', { name: '1D' }).click()
  await expect(dialog(page).getByText(/closest saved prices: daily candles/)).toBeVisible()
  await expect(dialog(page).getByText(/^since /)).toBeVisible()
})

test('search finds a coin and opens its chart', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').first().fill('sol')
  await page.getByRole('option', { name: /SOL/ }).click()
  await expect(dialog(page).getByRole('heading', { name: /SOL\/USDT/ })).toBeVisible()
  await expect(dialog(page).getByText('$182.00').first()).toBeVisible()
})

test('search leaves out stocks', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox').first().fill('a')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option', { name: /AAPL/ })).toHaveCount(0)
})

test('two coins can be compared on one chart', async ({ page }) => {
  await page.goto('/?a=crypto:BTC-USDT')
  await dialog(page)
    .getByRole('combobox', { name: /Compare/ })
    .fill('sol')
  await page.getByRole('option', { name: /SOL/ }).click()
  await expect(dialog(page).getByText('Compared with')).toBeVisible()
  const legend = dialog(page).getByRole('list', { name: 'Legend' })
  await expect(legend).toContainText('BTC/USDT')
  await expect(legend).toContainText('SOL/USDT')

  await dialog(page).getByRole('button', { name: 'Stop comparing' }).click()
  await expect(legend).toBeHidden()
})

test('watchlist changes are kept after a reload', async ({ page }) => {
  await page.goto('/?a=crypto:INJ-USDT')
  await dialog(page).getByRole('button', { name: 'Add to watchlist' }).first().click()
  await dialog(page).getByRole('button', { name: 'Close chart' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page).not.toHaveURL(/a=/)
  const watchlist = page.locator('#watchlist')
  await expect(watchlist.getByText('INJ/USDT', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('#watchlist').getByText('INJ/USDT', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remove INJ/USDT from watchlist' }).click()
  await expect(page.locator('#watchlist').getByText('INJ/USDT', { exact: true })).toHaveCount(0)
})

test('an unknown coin explains what happened', async ({ page }) => {
  await page.goto('/?a=crypto:ZZZZ-USDT')
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
