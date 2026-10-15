import { expect, test } from '@playwright/test'

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
