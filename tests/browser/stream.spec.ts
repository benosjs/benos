import { expect, test, type Page } from '@playwright/test'

async function open(page: Page): Promise<void> {
  await page.goto('/tests/browser/stream-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosStream))
}

test('a streamed page applies its patches as parsed and hydrates through the 0.6.0 code', async ({
  page,
}) => {
  await open(page)
  const state = await page.evaluate(() => window.__benosStream.run('end'))
  // shell, patch, end notice
  expect(state.chunks).toBe(3)
  expect(state.shellText).toContain('loading')
  expect(state.shellText).not.toContain('Ada')
  // The invariant: the applied document equals renderToString's output.
  expect(state.streamedHtml).toBe(state.reference)
  expect(state.streamedHtml).not.toContain('b:0:')
  expect(state.templates).toBe(0)
  expect(state.scripts).toBe(0)
  // Hydration claimed the streamed content: no mismatch, no refetch.
  expect(state.mismatches).toEqual([])
  expect(state.clientFetches).toBe(0)
  expect(state.finalText).toContain('Ada')
  expect(state.count).toBe('Count: 2')
})

test('a boundary the server could not settle is handed to the client', async ({
  page,
}) => {
  await open(page)
  const state = await page.evaluate(() => window.__benosStream.run('fail'))
  // shell, end notice
  expect(state.chunks).toBe(2)
  expect(state.streamedHtml).toContain('loading')
  expect(state.mismatches).toEqual([])
  expect(state.clientFetches).toBe(1)
  expect(state.finalText).toContain('Client')
  expect(state.count).toBe('Count: 2')
})
