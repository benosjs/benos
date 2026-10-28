import { expect, test } from '@playwright/test'

// The built dashboard served by examples/dashboard/scripts/serve.mjs.
const base = 'http://127.0.0.1:4175'

test('serves rendered pages with status codes and a data payload', async ({
  request,
}) => {
  const detail = await request.get(`${base}/projects/signals`)
  expect(detail.status()).toBe(200)
  const html = await detail.text()
  expect(html).toContain('<!--benos:0:1-->')
  expect(html).toContain('Signal runtime')
  expect(html).toContain('data-benos="0"')
  const missing = await request.get(`${base}/nowhere`)
  expect(missing.status()).toBe(404)
  expect(await missing.text()).toContain('This route does not exist')
})

test('hydrates the server page in place, without refetching, and stays interactive', async ({
  page,
}) => {
  await page.goto(`${base}/projects/signals`)
  await page.waitForFunction(() => window.__dashboardReady === true)
  // Hydration ends once the router's loaders settle and the markers go.
  await page.waitForFunction(
    () => !document.querySelector('#app')?.innerHTML.includes('<!--benos'),
  )
  const state = await page.evaluate(() => ({
    serverRendered: window.__dashboardHydration?.serverRendered,
    mismatches: window.__dashboardHydration?.mismatches.length,
    requests: [...(window.__dashboardRequests ?? [])],
    payloadScripts: document.querySelectorAll('script[data-benos]').length,
  }))
  expect(state.serverRendered).toBe(true)
  expect(state.mismatches).toBe(0)
  // The project and the list came from the payload: no client fetches.
  expect(state.requests).toEqual([])
  expect(state.payloadScripts).toBe(0)
  await expect(
    page.getByRole('heading', { name: 'Signal runtime' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL(`${base}/projects`)
  await expect(page.getByRole('link', { name: /DOM renderer/ })).toBeVisible()
})
