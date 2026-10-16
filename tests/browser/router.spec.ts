import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __routerR4?: {
      count(id: string): number
      complete(id: string, value: string): void
    }
  }
}

test('typed links, same-route params, and browser back/forward', async ({
  page,
}) => {
  await page.goto('/tests/browser/router-fixture.html')
  await expect(page.locator('#home')).toHaveText('Home')
  const link = page.locator('#item-link')
  await expect(link).toHaveAttribute('href', '/router/items/a')
  await link.click()
  await expect(page.locator('#item-id')).toHaveText('a')
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#root-link')).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.evaluate(() => window.__benosRouter?.go('b'))
  await expect(page.locator('#item-id')).toHaveText('b')
  await expect(link).not.toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => window.__benosRouter?.counts())).toEqual({
    layouts: 1,
    items: 1,
  })
  await page.goBack()
  await expect(page.locator('#item-id')).toHaveText('a')
  await page.goForward()
  await expect(page.locator('#item-id')).toHaveText('b')
})

test('modified and target links keep native browser handling', async ({
  page,
}) => {
  await page.goto('/tests/browser/router-fixture.html')
  await expect(page.locator('#home')).toHaveText('Home')
  const result = await page.evaluate(() => {
    const dispatch = (
      selector: string,
      options: MouseEventInit,
      prevented = false,
    ) => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...options,
      })
      if (prevented) event.preventDefault()
      document.querySelector(selector)?.dispatchEvent(event)
      return event.defaultPrevented
    }
    return {
      ctrl: dispatch('#item-link', { ctrlKey: true }),
      meta: dispatch('#item-link', { metaKey: true }),
      shift: dispatch('#item-link', { shiftKey: true }),
      alt: dispatch('#item-link', { altKey: true }),
      middle: dispatch('#item-link', { button: 1 }),
      targeted: dispatch('#target-link', {}),
      download: dispatch('#download-link', {}),
      alreadyPrevented: dispatch('#item-link', {}, true),
      path: location.pathname,
    }
  })
  expect(result).toEqual({
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
    middle: false,
    targeted: false,
    download: false,
    alreadyPrevented: true,
    path: '/tests/browser/router-fixture.html',
  })
})

test('pending navigation, focus announcements, and browser scroll restoration', async ({
  page,
}) => {
  await page.goto('/tests/browser/router-r4-fixture.html')
  await expect(page.locator('#home-heading')).toBeVisible()
  await page.evaluate(() => {
    document.documentElement.dir = 'rtl'
    window.scrollTo(0, 500)
  })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const link = document.querySelector('#item-link')
        return link
          ? link.getBoundingClientRect().right > innerWidth - 30
          : false
      }),
    )
    .toBe(true)
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.scrollY - 500) < 1))
    .toBe(true)

  await page.locator('#item-link').click()
  await expect(page.locator('[data-router-status]')).toHaveText('Loading page')
  await expect(page.locator('#home-heading')).toBeVisible()
  await expect(page.locator('#item-heading')).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => window.__routerR4?.count('a')))
    .toBe(1)
  await page.evaluate(() => window.__routerR4?.complete('a', 'Item data'))
  await expect(page.locator('#item-heading')).toHaveText('Item a')
  await expect(page.locator('#item-data')).toHaveText('Item data')
  await expect(page.locator('[data-router-status]')).toHaveText('Item a')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('item-heading')
  await expect.poll(() => page.evaluate(() => window.scrollY < 1)).toBe(true)

  await page.evaluate(() => window.scrollTo(0, 420))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = history.state as {
          __benosjs_router?: { y?: number }
        } | null
        return Math.abs((state?.__benosjs_router?.y ?? 0) - window.scrollY) < 1
      }),
    )
    .toBe(true)
  await page.goBack()
  await expect(page.locator('#home-heading')).toHaveText('Home page')
  await expect(page.locator('[data-router-status]')).toHaveText('Home page')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('home-heading')
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.scrollY - 500) < 1))
    .toBe(true)

  await page.goForward()
  await expect(page.locator('[data-router-status]')).toHaveText('Loading page')
  await expect
    .poll(() => page.evaluate(() => window.__routerR4?.count('a')))
    .toBe(2)
  await page.evaluate(() => window.__routerR4?.complete('a', 'Item data again'))
  await expect(page.locator('#item-data')).toHaveText('Item data again')
  await expect(page.locator('[data-router-status]')).toHaveText('Item a')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('item-heading')
  await expect
    .poll(() => page.evaluate(() => Math.round(window.scrollY)))
    .toBe(420)
})
