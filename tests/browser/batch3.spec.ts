import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const componentNames = [
  'dialog',
  'popover',
  'tooltip',
  'dropdown-menu',
  'toast',
] as const
type ComponentName = (typeof componentNames)[number]
const modes = ['light', 'dark', 'rtl', 'dark-rtl'] as const
type Mode = (typeof modes)[number]
const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')

declare global {
  interface Window {
    __benosBatchThree: {
      dispose: () => void
    }
  }
}

async function renderComponent(
  page: Page,
  component: ComponentName,
  mode: Mode = 'light',
  callerDir?: 'ltr' | 'rtl',
  scope?: 'rtl',
  controlled = false,
  scopeTheme?: 'light' | 'dark',
): Promise<void> {
  const parameters = new URLSearchParams({ component, mode })
  if (callerDir) parameters.set('callerDir', callerDir)
  if (scope) parameters.set('scope', scope)
  if (controlled) parameters.set('controlled', 'true')
  if (scopeTheme) parameters.set('scopeTheme', scopeTheme)
  await page.goto(`/tests/browser/batch3-fixture.html?${parameters}`)
  await page.waitForFunction(() => Boolean(window.__benosBatchThree))
}

async function openComponent(
  page: Page,
  component: ComponentName,
): Promise<void> {
  if (component === 'dialog')
    await page.getByRole('button', { name: 'Open dialog' }).click()
  if (component === 'popover')
    await page.getByRole('button', { name: 'Open details' }).click()
  if (component === 'dropdown-menu') {
    const trigger = page.getByRole('button', { name: 'Actions' })
    await trigger.focus()
    await trigger.press('ArrowDown')
  }
  if (component === 'tooltip') {
    const trigger = page.getByRole('button', { name: 'Help' })
    await page.keyboard.press('Tab')
    await expect(trigger).toBeFocused()
  }
  if (component === 'toast')
    await page.getByRole('button', { name: 'Show notification' }).click()
}

async function runAxe(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe?: {
          run: (context: HTMLElement) => Promise<{
            violations: Array<{
              id: string
              impact: string | null
              help: string
              nodes: Array<{ target: string[]; failureSummary?: string }>
            }>
          }>
        }
      }
    ).axe
    if (!axe) throw new Error('axe-core failed to load')
    return (await axe.run(document.body)).violations
  })
  expect(violations).toEqual([])
}

for (const component of componentNames) {
  test(`${component}: axe in light, dark, RTL, and dark RTL`, async ({
    page,
  }) => {
    for (const mode of modes) {
      await renderComponent(page, component, mode)
      await openComponent(page, component)
      await runAxe(page)
    }
  })

  test(`${component}: portal theme, direction, and layer`, async ({ page }) => {
    for (const mode of modes) {
      await renderComponent(page, component, mode)
      await openComponent(page, component)
      const host = page.locator('[data-benos-overlay-host]')
      await expect(host).toHaveCount(1)
      expect(
        await host.evaluate((element) =>
          Boolean(element.closest('#overlay-background')),
        ),
      ).toBe(false)
      await expect(host).toHaveAttribute(
        'data-theme',
        mode === 'dark' || mode === 'dark-rtl' ? 'dark' : 'light',
      )
      if (mode === 'rtl' || mode === 'dark-rtl') {
        await expect(page.locator('[dir="ltr"]')).toHaveCount(0)
        await expect(host).toHaveAttribute('dir', 'rtl')
      }

      const selector =
        component === 'dialog'
          ? '.benos-dialog__positioner'
          : component === 'popover'
            ? '.benos-popover__positioner'
            : component === 'tooltip'
              ? '.benos-tooltip__positioner'
              : component === 'dropdown-menu'
                ? '.benos-dropdown-menu__positioner'
                : '.benos-toast__viewport'
      const layer = page.locator(selector)
      await expect(layer).toBeVisible()
      const idTarget =
        component === 'toast' ? page.locator('.benos-toast__item') : layer
      const generatedId = await idTarget.getAttribute('id')
      expect(generatedId).toContain(
        {
          dialog: 'fixture-dialog',
          popover: 'fixture-popover',
          tooltip: 'fixture-tooltip',
          'dropdown-menu': 'fixture-menu',
          toast: 'fixture-toast',
        }[component],
      )
      const zIndex = await layer.evaluate(
        (element) => getComputedStyle(element).zIndex,
      )
      const expected = {
        dialog: '30',
        popover: '20',
        tooltip: '20',
        'dropdown-menu': '10',
        toast: '40',
      }[component]
      expect(zIndex).toBe(expected)
      const themeColor = await layer.evaluate(
        (element) =>
          getComputedStyle(element.firstElementChild ?? element).color,
      )
      expect(themeColor).toBe(
        component === 'tooltip'
          ? mode === 'dark' || mode === 'dark-rtl'
            ? 'rgb(23, 34, 56)'
            : 'rgb(255, 255, 255)'
          : mode === 'dark' || mode === 'dark-rtl'
            ? 'rgb(243, 246, 252)'
            : 'rgb(23, 32, 51)',
      )
    }
  })

  test(`${component}: themed owner scope is copied to its external portal`, async ({
    page,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      await renderComponent(
        page,
        component,
        theme === 'dark' ? 'light' : 'dark',
        undefined,
        undefined,
        false,
        theme,
      )
      await openComponent(page, component)
      const portal = page.locator('[data-benos-overlay-host]')
      await expect(portal).toHaveAttribute('data-theme', theme)
      expect(
        await portal.evaluate((element) =>
          Boolean(element.closest('#batch3-app')),
        ),
      ).toBe(false)
      const surface = page.locator(
        component === 'dialog'
          ? '.benos-dialog__content'
          : component === 'popover'
            ? '.benos-popover__content'
            : component === 'tooltip'
              ? '.benos-tooltip__content'
              : component === 'dropdown-menu'
                ? '.benos-dropdown-menu__content'
                : '.benos-toast__item',
      )
      await expect(surface).toHaveCSS(
        'background-color',
        theme === 'dark'
          ? component === 'tooltip'
            ? 'rgb(243, 246, 252)'
            : 'rgb(32, 46, 71)'
          : component === 'tooltip'
            ? 'rgb(23, 32, 51)'
            : 'rgb(255, 255, 255)',
      )
      await expect(surface).toHaveCSS(
        'color',
        component === 'tooltip'
          ? theme === 'dark'
            ? 'rgb(23, 34, 56)'
            : 'rgb(255, 255, 255)'
          : theme === 'dark'
            ? 'rgb(243, 246, 252)'
            : 'rgb(23, 32, 51)',
      )
    }
  })

  test(`${component}: keyboard behavior, dismissal, and focus`, async ({
    page,
  }) => {
    await renderComponent(page, component)
    if (component === 'dialog') {
      const trigger = page.getByRole('button', { name: 'Open dialog' })
      await trigger.focus()
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Edit profile' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Update your display name.')
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true)
      await expect
        .poll(() =>
          page
            .locator('#batch3-app')
            .evaluate(
              (element) =>
                element.getAttribute('aria-hidden') === 'true' ||
                element.hasAttribute('inert'),
            ),
        )
        .toBe(true)

      await page.evaluate(() => window.scrollTo(0, 300))
      const beforeWheel = await page.evaluate(() => window.scrollY)
      await page.mouse.move(5, 5)
      await page.mouse.wheel(0, 500)
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBe(beforeWheel)

      await page.keyboard.press('Tab')
      await expect(dialog).toContainText('Save')
      await page.keyboard.press('Tab')
      await expect(dialog).toContainText('Close dialog')
      await page.keyboard.press('Tab')
      await expect
        .poll(() =>
          dialog.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        )
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }
    if (component === 'popover') {
      const trigger = page.getByRole('button', { name: 'Open details' })
      await trigger.click()
      const content = page.getByRole('dialog', { name: 'More details' })
      await expect(content).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(content).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }
    if (component === 'tooltip') {
      const trigger = page.getByRole('button', { name: 'Help' })
      await page.keyboard.press('Tab')
      await expect(trigger).toBeFocused()
      const tooltip = page.getByRole('tooltip')
      await expect(tooltip).toBeVisible()
      await expect(page.locator('#essential-information')).toBeVisible()
      const tooltipId = await tooltip.getAttribute('id')
      if (!tooltipId) throw new Error('Tooltip content has no generated ID')
      await expect(trigger).toHaveAttribute('aria-describedby', tooltipId)
      await page.keyboard.press('Escape')
      await expect(tooltip).toBeHidden()
      await trigger.hover()
      await expect(tooltip).toBeVisible()
      return
    }
    if (component === 'dropdown-menu') {
      const trigger = page.getByRole('button', { name: 'Actions' })
      await trigger.focus()
      await trigger.press('ArrowDown')
      const menu = page.getByRole('menu', { name: 'Actions' })
      await expect(menu).toBeVisible()
      await menu.focus()
      await expect(menu).toBeFocused()
      await menu.press('End')
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/archive',
      )
      await menu.press('Home')
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/rename',
      )
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }

    const trigger = page.getByRole('button', { name: 'Show notification' })
    await trigger.focus()
    await trigger.evaluate((element: HTMLButtonElement) => element.click())
    const toast = page.getByRole('status')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('aria-live', 'polite')
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('#background-action')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Dismiss notification' }),
    ).toBeFocused()
  })

  test(`${component}: reduced motion and owner disposal`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await renderComponent(page, component)
    await openComponent(page, component)
    const overlay =
      component === 'dialog'
        ? page.locator('.benos-dialog__content')
        : component === 'popover'
          ? page.locator('.benos-popover__content')
          : component === 'tooltip'
            ? page.locator('.benos-tooltip__content')
            : component === 'dropdown-menu'
              ? page.locator('.benos-dropdown-menu__content')
              : page.locator('.benos-toast__item')
    await expect(overlay).toBeVisible()
    await expect(overlay).toHaveCSS('animation-name', 'none')
    await page.evaluate(() => window.__benosBatchThree.dispose())
    await expect(page.locator('[data-benos-overlay-host]')).toHaveCount(0)
  })
}

test('dropdown menu Tab behavior remains tracked without interception', async ({
  page,
}) => {
  await renderComponent(page, 'dropdown-menu')
  await openComponent(page, 'dropdown-menu')
  const menu = page.getByRole('menu', { name: 'Actions' })
  await page.keyboard.press('Tab')
  // Zag 1.44.0 currently prevents Tab from leaving the active-descendant menu.
  await expect(menu).toBeVisible()
})

test('gallery overlay triggers open in light, dark, and RTL panels', async ({
  page,
}) => {
  await page.goto('/examples/ui-gallery/')
  const panels = page.locator('.mode-panel')
  await expect(panels).toHaveCount(3)

  for (let index = 0; index < 3; index += 1) {
    const panel = panels.nth(index)
    const dialogTrigger = panel.locator('.benos-dialog [data-part="trigger"]')
    await dialogTrigger.click()
    const dialog = page.locator('.benos-dialog__content')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    const popoverTrigger = panel.locator('.benos-popover [data-part="trigger"]')
    await popoverTrigger.click()
    const popover = page.locator('.benos-popover__content')
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(popoverTrigger).toBeFocused()

    const tooltipTrigger = panel.locator('.benos-tooltip [data-part="trigger"]')
    await page.keyboard.press('Tab')
    await expect(tooltipTrigger).toBeFocused()
    const tooltip = page.locator('.benos-tooltip__content')
    await expect(tooltip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tooltip).toBeHidden()

    const menuTrigger = panel.locator(
      '.benos-dropdown-menu [data-part="trigger"]',
    )
    await menuTrigger.focus()
    await menuTrigger.press('ArrowDown')
    const menu = page.locator('.benos-dropdown-menu__content')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    const toastTrigger = panel.locator('.toast-sample button')
    await toastTrigger.evaluate((element: HTMLButtonElement) => element.click())
    const toast = page.locator('.benos-toast__item')
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Dismiss notification' }).click()
    await expect(toast).toBeHidden()
  }
})

for (const component of ['popover', 'tooltip', 'dropdown-menu'] as const) {
  test(`${component}: popup stays inside viewport when opened at its edge`, async ({
    page,
  }) => {
    for (const mode of modes) {
      await renderComponent(page, component, mode)
      await openComponent(page, component)
      const selector =
        component === 'popover'
          ? '.benos-popover__positioner'
          : component === 'tooltip'
            ? '.benos-tooltip__positioner'
            : '.benos-dropdown-menu__positioner'
      const bounds = await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        }
      })
      expect(bounds.width).toBeGreaterThan(0)
      expect(bounds.height).toBeGreaterThan(0)
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth)
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight)
    }
  })
}

for (const component of componentNames) {
  test(`${component}: inherits scoped RTL and honors an explicit direction`, async ({
    page,
  }) => {
    await renderComponent(page, component, 'light', undefined, 'rtl')
    await openComponent(page, component)
    let host = page.locator('[data-benos-overlay-host]')
    await expect(host).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('#overlay-background [dir="ltr"]')).toHaveCount(0)
    expect(
      await host.evaluate((element) => getComputedStyle(element).direction),
    ).toBe('rtl')

    await renderComponent(page, component, 'light', 'ltr', 'rtl')
    await openComponent(page, component)
    host = page.locator('[data-benos-overlay-host]')
    await expect(host).toHaveAttribute('dir', 'ltr')
    expect(
      await host.evaluate((element) => getComputedStyle(element).direction),
    ).toBe('ltr')
  })
}

for (const component of [
  'dialog',
  'popover',
  'tooltip',
  'dropdown-menu',
] as const) {
  test(`${component}: controlled visibility follows callback updates`, async ({
    page,
  }) => {
    await renderComponent(page, component, 'light', undefined, undefined, true)
    await openComponent(page, component)
    const role = {
      dialog: 'dialog',
      popover: 'dialog',
      tooltip: 'tooltip',
      'dropdown-menu': 'menu',
    }[component]
    await expect(page.getByRole(role)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole(role)).toBeHidden()
  })
}
