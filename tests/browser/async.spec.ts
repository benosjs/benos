import { expect, test } from '@playwright/test'

test('Suspense fallback, reveal, and gated effects', async ({ page }) => {
  await page.goto('/tests/browser/async-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosAsync))
  await page.evaluate(() => window.__benosAsync?.mount())
  await expect(page.locator('#fallback')).toHaveText('Loading')
  expect(await page.evaluate(() => window.__benosAsync?.events)).toEqual([])
  await page.evaluate(() => window.__benosAsync?.resolve('A', 'Alpha'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  expect(await page.evaluate(() => window.__benosAsync?.events)).toContain(
    'effect:A',
  )
  expect(await page.evaluate(() => window.__benosAsync?.events)).toContain(
    'mount:A',
  )
})

test('ordinary updates show fallback and nested boundaries reveal independently', async ({
  page,
}) => {
  await page.goto('/tests/browser/async-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosAsync))
  await page.evaluate(() => window.__benosAsync?.mount())
  await page.evaluate(() => window.__benosAsync?.resolve('A', 'Alpha'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  await page.evaluate(() => window.__benosAsync?.update('B'))
  await expect(page.locator('#fallback')).toHaveText('Loading')
  await page.evaluate(() => window.__benosAsync?.resolve('B', 'Beta'))
  await expect(page.locator('#content')).toHaveText('Beta')

  await page.evaluate(() => window.__benosAsync?.mountNested())
  await expect(page.locator('section')).toContainText('shell')
  await expect(page.locator('#inner-fallback')).toHaveText('inner wait')
  await page.evaluate(() => window.__benosAsync?.resolve('inner', 'ready'))
  await expect(page.locator('#inner-content')).toHaveText('ready')
})

test('transition retains committed content until replacement is ready', async ({
  page,
}) => {
  await page.goto('/tests/browser/async-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosAsync))
  await page.evaluate(() => window.__benosAsync?.mount())
  await page.evaluate(() => window.__benosAsync?.resolve('A', 'Alpha'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  const pending = page.evaluate(() => window.__benosAsync?.transition('B'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  await page.evaluate(() => window.__benosAsync?.resolve('B', 'Beta'))
  await pending
  await expect(page.locator('#content')).toHaveText('Beta')
})

test('A → B → A ignores the old request in the DOM', async ({ page }) => {
  await page.goto('/tests/browser/async-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosAsync))
  await page.evaluate(() => window.__benosAsync?.mount())
  await page.evaluate(() => window.__benosAsync?.update('B'))
  await page.evaluate(() => window.__benosAsync?.update('A'))
  await page.evaluate(() => window.__benosAsync?.resolve('B', 'stale B'))
  await expect(page.locator('#fallback')).toHaveText('Loading')
  await page.evaluate(() => window.__benosAsync?.resolve('A', 'fresh A'))
  await expect(page.locator('#content')).toHaveText('fresh A')
})

test('superseded transition and staged failure recover the DOM', async ({
  page,
}) => {
  await page.goto('/tests/browser/async-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosAsync))
  await page.evaluate(() => window.__benosAsync?.mount())
  await page.evaluate(() => window.__benosAsync?.resolve('A', 'Alpha'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  const older = page.evaluate(() => window.__benosAsync?.transition('B'))
  const newer = page.evaluate(() => window.__benosAsync?.transition('C'))
  await older
  await page.evaluate(() => window.__benosAsync?.resolve('B', 'stale B'))
  await expect(page.locator('#content')).toHaveText('Alpha')
  await page.evaluate(() => window.__benosAsync?.resolve('C', 'Charlie'))
  await newer
  await expect(page.locator('#content')).toHaveText('Charlie')
  const failed = page.evaluate(() => window.__benosAsync?.transition('D'))
  await expect(page.locator('#content')).toHaveText('Charlie')
  await page.evaluate(() => window.__benosAsync?.reject('D'))
  await failed
  await expect(page.locator('#error')).toHaveText('Failed')
})
