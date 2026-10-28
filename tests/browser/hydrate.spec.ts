import { expect, test, type Page } from '@playwright/test'

async function open(page: Page): Promise<void> {
  await page.goto('/tests/browser/hydrate-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosHydrate))
}

test('hydration reuses the parsed nodes and matches a client render', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.__benosHydrate.serve('basic'))
  await page.fill('#field', 'typed')
  await page.evaluate(() => window.__benosHydrate.run('basic'))
  const state = await page.evaluate(() => ({
    section: window.__benosHydrate.same('basic'),
    count: window.__benosHydrate.same('count'),
    field: window.__benosHydrate.same('field'),
    list: window.__benosHydrate.same('list'),
    html: window.__benosHydrate.serverHtml(),
    server: window.__benosHydrate.serverShape(),
    client: window.__benosHydrate.clientShape(),
    events: [...window.__benosHydrate.events],
    mismatches: window.__benosHydrate.mismatches.length,
    field_value: document.querySelector<HTMLInputElement>('#field')?.value,
    portal: document.querySelectorAll('#portal #portaled').length,
  }))
  expect(state.section).toBe(true)
  expect(state.count).toBe(true)
  expect(state.field).toBe(true)
  expect(state.list).toBe(true)
  expect(state.mismatches).toBe(0)
  // Both roots mounted a portal into #portal; the hydrated one came first.
  expect(state.portal).toBe(2)
  expect(state.html).not.toMatch(/benos|<!--\/?[bi]/)
  // The only difference is the input the test typed before hydration.
  expect(state.server.replace('@value="typed"', '@value="server"')).toBe(
    state.client,
  )
  // The hydrated root's events, then the client-rendered root's.
  expect(state.events).toEqual([
    'ref:count',
    'effect:true',
    'mount',
    'ref:count',
    'effect:true',
    'mount',
  ])
  expect(state.field_value).toBe('typed')
  await page.click('#server #increment')
  await expect(page.locator('#server #count')).toHaveText('Count: 2')
  await page.evaluate(() => window.__benosHydrate.setValue('next'))
  await expect(page.locator('#server #field')).toHaveValue('next')
  await page.evaluate(() => window.__benosHydrate.setItems(['c', 'a']))
  await expect(page.locator('#server #list li')).toHaveText(['c', 'a'])
})

test('tables, selects, SVG, and textarea round-trip through the parser', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.__benosHydrate.serve('parser'))
  await page.evaluate(() => window.__benosHydrate.run('parser'))
  const state = await page.evaluate(() => ({
    parser: window.__benosHydrate.same('parser'),
    select: window.__benosHydrate.same('select'),
    fo: window.__benosHydrate.same('fo'),
    area: window.__benosHydrate.same('area'),
    mismatches: window.__benosHydrate.mismatches.length,
    selected: document.querySelector<HTMLSelectElement>('#select')?.value,
    area_value: document.querySelector<HTMLTextAreaElement>('#area')?.value,
    svg: document.querySelector('circle')?.namespaceURI,
    fo_ns: document.querySelector('#fo')?.namespaceURI,
  }))
  expect(state.parser).toBe(true)
  expect(state.select).toBe(true)
  expect(state.fo).toBe(true)
  expect(state.area).toBe(true)
  expect(state.mismatches).toBe(0)
  expect(state.selected).toBe('2')
  expect(state.area_value).toBe('text area')
  expect(state.svg).toBe('http://www.w3.org/2000/svg')
  expect(state.fo_ns).toBe('http://www.w3.org/1999/xhtml')
  await page.evaluate(() => window.__benosHydrate.setValue('x'))
  await expect(page.locator('td').nth(1)).toHaveText('n1')
})

test('a payload seeds the resource without a fetch; without it the fallback shows', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => window.__benosHydrate.serve('data'))
  expect(await page.evaluate(() => window.__benosHydrate.fetches())).toBe(1)
  await page.evaluate(() => window.__benosHydrate.run('data'))
  await expect(page.locator('#name')).toHaveText('Ada')
  expect(await page.evaluate(() => window.__benosHydrate.fetches())).toBe(1)
  expect(await page.evaluate(() => window.__benosHydrate.same('name'))).toBe(
    true,
  )
  expect(await page.locator('script[data-benos]').count()).toBe(0)

  await page.evaluate(() =>
    window.__benosHydrate.serve('data', { dropPayload: true }),
  )
  await page.evaluate(() => {
    window.__benosHydrate.holdFetch()
    window.__benosHydrate.run('data')
  })
  await expect(page.locator('#loading')).toHaveText('loading')
  await expect(page.locator('#name')).toHaveCount(0)
  expect(await page.evaluate(() => window.__benosHydrate.fetches())).toBe(2)
  await page.evaluate(() => window.__benosHydrate.resolve('Grace'))
  await expect(page.locator('#name')).toHaveText('Grace')
  expect(await page.evaluate(() => window.__benosHydrate.same('name'))).toBe(
    true,
  )
})

test('a tampered range is client rendered inside its boundary', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() =>
    window.__benosHydrate.serve('basic', { tamper: true }),
  )
  await page.evaluate(() => window.__benosHydrate.run('basic'))
  const state = await page.evaluate(() => ({
    mismatches: window.__benosHydrate.mismatches.map((info) => [
      info.path,
      info.expected,
      info.actual,
      info.recovered,
    ]),
    server: window.__benosHydrate.serverShape(),
    client: window.__benosHydrate.clientShape(),
    section: window.__benosHydrate.same('basic'),
  }))
  expect(state.mismatches).toEqual([
    ['section > ul:4', 'element <li>', 'element <div>', 'boundary'],
  ])
  expect(state.section).toBe(true)
  expect(state.server).toBe(state.client)
  await page.evaluate(() => window.__benosHydrate.setItems(['z']))
  await expect(page.locator('#server #list li')).toHaveText(['z'])
})
