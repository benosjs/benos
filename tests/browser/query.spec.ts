import { expect, test } from '@playwright/test'

test('deduplicated query reveals Suspense content once ready', async ({
  page,
}) => {
  await page.goto('/tests/browser/query-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosQuery))
  await page.evaluate(() => window.__benosQuery?.mount())
  await expect(page.locator('#fallback')).toHaveText('Loading')
  expect(await page.evaluate(() => window.__benosQuery?.fetches())).toBe(1)
  await page.evaluate(() => window.__benosQuery?.resolve('a', 'Alpha'))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
})

test('cached entries switch without a fallback or refetch', async ({
  page,
}) => {
  await page.goto('/tests/browser/query-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosQuery))
  await page.evaluate(() => window.__benosQuery?.mount())
  await page.evaluate(() => window.__benosQuery?.resolve('a', 'Alpha'))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await page.evaluate(() => window.__benosQuery?.select('b'))
  await expect(page.locator('#fallback')).toHaveText('Loading')
  await page.evaluate(() => window.__benosQuery?.resolve('b', 'Beta'))
  await expect(page.locator('#content')).toHaveText(['Beta', 'Beta'])
  await page.evaluate(() => window.__benosQuery?.select('a'))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await expect(page.locator('#fallback')).toHaveCount(0)
  expect(await page.evaluate(() => window.__benosQuery?.fetches())).toBe(2)
})

test('a transition keeps the committed entry until the next is ready', async ({
  page,
}) => {
  await page.goto('/tests/browser/query-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosQuery))
  await page.evaluate(() => window.__benosQuery?.mount())
  await page.evaluate(() => window.__benosQuery?.resolve('a', 'Alpha'))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await page.evaluate(() => {
    void window.__benosQuery?.transition('c')
  })
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await expect(page.locator('#fallback')).toHaveCount(0)
  await page.evaluate(() => window.__benosQuery?.resolve('c', 'Gamma'))
  await expect(page.locator('#content')).toHaveText(['Gamma', 'Gamma'])
})

test('optimistic writes update the DOM and roll back on failure', async ({
  page,
}) => {
  await page.goto('/tests/browser/query-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosQuery))
  await page.evaluate(() => window.__benosQuery?.mount())
  await page.evaluate(() => window.__benosQuery?.resolve('a', 'Alpha'))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await page.evaluate(() => window.__benosQuery?.save('Renamed'))
  await expect(page.locator('#content')).toHaveText(['Renamed', 'Renamed'])
  await page.evaluate(() => window.__benosQuery?.settleSave(false))
  await expect(page.locator('#content')).toHaveText(['Alpha', 'Alpha'])
  await page.evaluate(() => window.__benosQuery?.save('Kept'))
  await page.evaluate(() => window.__benosQuery?.settleSave(true))
  await expect(page.locator('#content')).toHaveText(['Kept', 'Kept'])
})
