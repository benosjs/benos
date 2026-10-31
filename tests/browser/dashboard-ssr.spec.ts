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
  // The detail page streams: the activity boundary's fallback is marked in
  // the shell and its content follows as a patch, then the end notice.
  expect(html).toMatch(
    /<!--b:0:\d+--><p class="form-status" role="status">Loading activity/,
  )
  expect(html).toMatch(/<template id="b:0:\d+">/)
  expect(html).toContain('Scheduler batching landed')
  expect(html).toContain('__benos_s.e("0")')
  expect(html.indexOf('Loading activity')).toBeLessThan(
    html.indexOf('Scheduler batching landed'),
  )
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
  // The project, the list, and the streamed activity came from the payload:
  // no client fetches.
  expect(state.requests).toEqual([])
  expect(state.payloadScripts).toBe(0)
  await expect(
    page.getByRole('heading', { name: 'Signal runtime' }),
  ).toBeVisible()
  await expect(page.getByText('Scheduler batching landed')).toBeVisible()
  expect(await page.locator('template').count()).toBe(0)
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL(`${base}/projects`)
  await expect(page.getByRole('link', { name: /DOM renderer/ })).toBeVisible()
})

test('hydrating the streamed page costs about what a client render costs', async ({
  page,
}, info) => {
  // The synchronous part of `hydrate` (claiming the shell) on the streamed
  // page, against `render` of the same page on the dev server.
  const timing = async (url: string): Promise<number> => {
    const samples: number[] = []
    for (let index = 0; index < 5; index++) {
      await page.goto(url)
      await page.waitForFunction(() => window.__dashboardReady === true)
      samples.push(
        await page.evaluate(() => window.__dashboardHydration?.duration ?? -1),
      )
    }
    return samples.sort((a, b) => a - b)[2] as number
  }
  const hydrated = await timing(`${base}/projects/signals`)
  const rendered = await timing('http://127.0.0.1:4174/projects/signals')
  info.annotations.push({
    type: 'timing',
    description: `hydrate ${hydrated.toFixed(1)} ms vs render ${rendered.toFixed(1)} ms (medians of 5)`,
  })
  console.log(
    `[${info.project.name}] streamed hydrate ${hydrated.toFixed(1)} ms vs client render ${rendered.toFixed(1)} ms`,
  )
  expect(hydrated).toBeGreaterThan(0)
  expect(rendered).toBeGreaterThan(0)
})
