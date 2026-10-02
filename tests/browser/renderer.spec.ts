import { expect, test } from '@playwright/test'

type BrowserResult = Record<string, unknown>

async function fixture(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/tests/browser/fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosBrowser))
}

async function run(
  page: import('@playwright/test').Page,
  name: string,
  ...args: unknown[]
): Promise<BrowserResult> {
  return page.evaluate(
    ({ name: method, args }) =>
      (
        window.__benosBrowser?.[method] as (
          ...values: unknown[]
        ) => BrowserResult
      )(...args),
    { name, args },
  )
}

test.describe('live-document attachment and ownership', () => {
  test('mount-after-connected-commit', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'mountInitial')
    expect(result.events).toEqual(['mounted-after-insert'])
    expect(result.html).toContain('initial')
  })

  test('later-branch-mount', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'mountLaterBranch')
    expect(result.before).toEqual([])
    expect(result.after).toEqual(['mounted-after-insert'])
    expect(result.html).toContain('later')
  })

  test('portal-mount-after-connected-commit', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'mountPortal')
    expect(result.events).toEqual(['mounted-after-insert'])
    expect(result.targetHtml).toContain('portal')
    expect(result.appHtml).not.toContain('portal')
  })

  test('detached-host-observer-lifetime', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'detachedObserver', false)
    expect((result.before as BrowserResult).observes).toBe(1)
    expect((result.before as BrowserResult).disconnects).toBe(0)
    expect((result.after as BrowserResult).events).toEqual(['mounted'])
    expect((result.after as BrowserResult).disconnects).toBe(1)
  })

  test('dispose-disconnects-detached-observer', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'detachedObserver', true)
    expect((result.after as BrowserResult).events).toEqual(['cleaned'])
    expect((result.after as BrowserResult).disconnects).toBe(1)
  })
})

test.describe('focus, parser, accessibility, and RTL', () => {
  test('native-focus-order', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'focusOrder')
    await expect(page.locator('#focus-second')).toBeFocused()
    expect(result.events).toEqual([
      'focus:first',
      'focusin:first',
      'focusout:first',
      'focus:second',
      'focusin:second',
    ])
  })

  test('parser-sensitive-tables-selects-and-svg', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'parserFixtures')
    expect(result.tableCell).toBe('cell')
    expect(result.tableParent).toBe('TBODY')
    expect(result.optionCount).toBe(2)
    expect(result.selected).toBe('second')
    expect(result.svgNamespace).toBe('http://www.w3.org/2000/svg')
    expect(result.circleNamespace).toBe('http://www.w3.org/2000/svg')
  })

  test('accessibility-semantics-and-keyboard-activation', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'accessibilityFixture')
    expect(result.buttonName).toBe('Save record')
    expect(result.labelledInput).toBe('accessible-name')
    await expect(
      page.getByRole('button', { name: 'Save record' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Save record' }).press('Enter')
    await expect(page.locator('#accessible-status')).toHaveText('saved 1')
  })

  test('keyboard-navigation', async ({ page }) => {
    await fixture(page)
    await run(page, 'keyboardFixture')
    await page.locator('#keyboard-first').focus()
    await page.locator('#keyboard-first').press('ArrowRight')
    await expect(page.locator('#keyboard-second')).toBeFocused()
  })

  test('rtl-layout-direction-and-dom-order', async ({ page }) => {
    await fixture(page)
    const result = await run(page, 'rtlFixture')
    expect(result.dir).toBe('rtl')
    expect(result.computedDirection).toBe('rtl')
    expect(result.order).toEqual(['rtl-first', 'rtl-second'])
  })
})
