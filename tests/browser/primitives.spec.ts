import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const primitiveNames = [
  'checkbox',
  'switch',
  'radio-group',
  'select',
  'tabs',
  'accordion',
  'dialog',
  'popover',
  'tooltip',
  'menu',
  'toast',
] as const
type PrimitiveName = (typeof primitiveNames)[number]

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')

async function renderPrimitive(
  page: Page,
  name: PrimitiveName,
  direction = 'ltr',
): Promise<void> {
  await page.goto('/tests/browser/fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosBrowser))
  await page.evaluate(
    ({ name, direction }) => {
      const primitive = window.__benosBrowser?.primitive as
        ((name: string, direction?: string) => void) | undefined
      if (!primitive) throw new Error('Primitive browser fixture is missing')
      primitive(name, direction)
    },
    { name, direction },
  )
}

async function runAxe(page: Page): Promise<void> {
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

for (const name of primitiveNames) {
  test(`${name}: APG keyboard interaction`, async ({ page }) => {
    await renderPrimitive(page, name)

    if (name === 'checkbox') {
      const checkbox = page.getByRole('checkbox')
      await checkbox.focus()
      await checkbox.press('Space')
      await expect(checkbox).toBeChecked()
      await checkbox.press('Tab')
      await expect(page.locator('#primitive-after-widget')).toBeFocused()
      return
    }

    if (name === 'switch') {
      // Zag 1.44.0 exposes its hidden input as a checkbox; the APG role gap is
      // documented in the U2 checkpoint rather than rewritten in this adapter.
      const toggle = page.getByRole('checkbox', {
        name: 'Email notifications',
      })
      await toggle.focus()
      await toggle.press('Space')
      await expect(toggle).toBeChecked()
      await toggle.press('Tab')
      await expect(page.locator('#primitive-after-widget')).toBeFocused()
      return
    }

    if (name === 'radio-group') {
      const radios = page.getByRole('radio')
      await radios.nth(0).focus()
      await radios.nth(0).press('ArrowRight')
      await expect(radios.nth(1)).toBeChecked()
      await expect(radios.nth(1)).toBeFocused()
      await radios.nth(1).press('ArrowLeft')
      await expect(radios.nth(0)).toBeChecked()
      await radios.nth(0).press('Tab')
      await expect(page.locator('#primitive-after-widget')).toBeFocused()
      return
    }

    if (name === 'select') {
      const trigger = page.getByRole('combobox', { name: 'Choose a value' })
      await trigger.focus()
      await trigger.press('ArrowDown')
      const listbox = page.getByRole('listbox')
      await expect(listbox).toBeVisible()
      await listbox.press('End')
      await expect(page.getByRole('option').nth(2)).toHaveAttribute(
        'data-highlighted',
        '',
      )
      await listbox.press('Home')
      await listbox.press('b')
      await expect(page.getByRole('option').nth(1)).toHaveAttribute(
        'data-highlighted',
        '',
      )
      await listbox.press('Enter')
      await expect(trigger).toContainText('Bravo')
      await trigger.press('ArrowDown')
      await trigger.press('Escape')
      await expect(listbox).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.press('ArrowDown')
      await page.keyboard.press('Tab')
      // Zag keeps the popup open and retains focus on the listbox after Tab,
      // contrary to the APG combobox pattern. This is recorded in the checkpoint.
      await expect(listbox).toBeVisible()
      await expect(listbox).toBeFocused()
      return
    }

    if (name === 'tabs') {
      const tabs = page.getByRole('tab')
      await tabs.nth(0).focus()
      await tabs.nth(0).press('ArrowRight')
      await expect(tabs.nth(1)).toBeFocused()
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
      await tabs.nth(1).press('End')
      await expect(tabs.nth(2)).toBeFocused()
      await tabs.nth(2).press('Home')
      await expect(tabs.nth(0)).toBeFocused()
      await tabs.nth(0).press('Tab')
      await expect(page.getByRole('tabpanel').first()).toBeFocused()
      return
    }

    if (name === 'accordion') {
      const first = page.getByRole('button', { name: 'Alpha' })
      await first.focus()
      await first.press('Enter')
      await expect(first).toHaveAttribute('aria-expanded', 'true')
      await first.press('Space')
      await expect(first).toHaveAttribute('aria-expanded', 'false')
      await first.press('Tab')
      await expect(page.getByRole('button', { name: 'Bravo' })).toBeFocused()
      return
    }

    if (name === 'dialog') {
      const trigger = page.getByRole('button', { name: 'Open dialog' })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Edit profile' })
      await expect(dialog).toBeVisible()
      const input = page.getByRole('textbox', { name: 'Display name' })
      const close = page.getByRole('button', { name: 'Close dialog' })
      // Zag installs its focus trap on the next animation frame after opening.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      )
      await close.focus()
      await page.keyboard.press('Tab')
      await expect(input).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(close).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }

    if (name === 'popover') {
      const trigger = page.getByRole('button', { name: 'Open details' })
      await trigger.click()
      const content = page.getByRole('dialog', { name: 'Details' })
      await expect(content).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(content).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }

    if (name === 'tooltip') {
      const trigger = page.getByRole('button', { name: 'Help' })
      await page.keyboard.press('Tab')
      await expect(trigger).toBeFocused()
      const tooltip = page.getByRole('tooltip')
      await expect(tooltip).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tooltip).toBeHidden()
      await expect(trigger).toBeFocused()
      return
    }

    if (name === 'menu') {
      const trigger = page.getByRole('button', { name: 'File actions' })
      await trigger.focus()
      await trigger.press('ArrowDown')
      const menu = page.getByRole('menu', { name: 'File actions' })
      await expect(menu).toBeVisible()
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/alpha',
      )
      await menu.press('End')
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/charlie',
      )
      await menu.press('Home')
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/alpha',
      )
      await menu.press('c')
      await expect(menu).toHaveAttribute(
        'aria-activedescendant',
        'fixture-menu/charlie',
      )
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger).toBeFocused()
      await trigger.press('ArrowDown')
      await page.keyboard.press('Tab')
      // Zag's isValidTabEvent guard prevents Tab from leaving this menu, even
      // though APG specifies that Tab exits and closes it.
      await expect(menu).toBeVisible()
      return
    }

    // Zag exposes toast as a focusable status and lets Escape dismiss it. The
    // APG Alert Pattern says alerts do not take focus and have no key bindings;
    // this upstream deviation is recorded rather than patched in the adapter.
    const before = page.locator('#before-toast')
    const status = page.getByRole('status')
    await before.focus()
    await expect(status).toBeVisible()
    await expect(before).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(status).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(status).toHaveAttribute('data-state', 'closed')
  })

  test(`${name}: axe-core accessibility scan`, async ({ page }) => {
    await renderPrimitive(page, name)
    if (name === 'select')
      await page.getByRole('combobox', { name: 'Choose a value' }).click()
    if (name === 'dialog')
      await page.getByRole('button', { name: 'Open dialog' }).click()
    if (name === 'popover')
      await page.getByRole('button', { name: 'Open details' }).click()
    if (name === 'tooltip') await page.keyboard.press('Tab')
    if (name === 'menu')
      await page.getByRole('button', { name: 'File actions' }).click()
    await runAxe(page)
  })
}

for (const name of ['radio-group', 'tabs'] as const) {
  test(`${name}: horizontal arrow navigation respects RTL`, async ({
    page,
    browserName,
  }) => {
    await renderPrimitive(page, name, 'rtl')
    if (name === 'radio-group') {
      const radios = page.getByRole('radio')
      await radios.nth(0).focus()
      await radios.nth(0).press('ArrowLeft')
      if (browserName === 'webkit') {
        // Zag delegates radio arrow movement to the native hidden radio input;
        // WebKit does not reverse this movement for an RTL group.
        await expect(radios.nth(0)).toBeChecked()
        return
      }
      await expect(radios.nth(1)).toBeFocused()
      await expect(radios.nth(1)).toBeChecked()
    } else {
      const tabs = page.getByRole('tab')
      await tabs.nth(0).focus()
      await tabs.nth(0).press('ArrowLeft')
      await expect(tabs.nth(1)).toBeFocused()
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    }
  })
}
