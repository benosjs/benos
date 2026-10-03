import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const componentNames = [
  'checkbox',
  'switch',
  'radio-group',
  'select',
  'tabs',
  'accordion',
] as const
type ComponentName = (typeof componentNames)[number]
type Mode = 'light' | 'dark' | 'rtl' | 'dark-rtl'

declare global {
  interface Window {
    __benosBatchTwo: {
      rootId: () => string | undefined
      hasRef: () => boolean
      dispose: () => void
    }
  }
}

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')
test('gallery shows all six primitives with selected and open states', async ({
  page,
}) => {
  await page.goto('/examples/ui-gallery/')
  const panels = page.locator('.mode-panel')
  await expect(panels).toHaveCount(3)
  await expect(
    page.getByLabel('Components in batches 1 and 2').locator('span'),
  ).toHaveCount(13)

  for (let index = 0; index < 3; index += 1) {
    const panel = panels.nth(index)
    await expect(panel.locator('.benos-checkbox input')).toBeChecked()
    await expect(
      panel.locator('.benos-switch input[role="switch"]'),
    ).toBeChecked()
    await expect(
      panel.locator('.benos-radio-group input[type="radio"]').first(),
    ).toBeChecked()
    await expect(panel.locator('.benos-select__content')).toBeVisible()
    await expect(panel.locator('.benos-select__trigger')).toContainText(
      index === 2 ? 'الشمال' : 'North',
    )
    await expect(
      panel.locator('.benos-tabs__trigger[aria-selected="true"]'),
    ).toHaveCount(1)
    await expect(
      panel.locator('.benos-accordion__trigger').first(),
    ).toHaveAttribute('aria-expanded', 'true')
  }
})

const ids: Record<ComponentName, string> = {
  checkbox: 'fixture-checkbox',
  switch: 'fixture-switch',
  'radio-group': 'fixture-radio',
  select: 'fixture-select',
  tabs: 'fixture-tabs',
  accordion: 'fixture-accordion',
}

async function renderComponent(
  page: Page,
  name: ComponentName,
  mode: Mode = 'light',
  controlled = false,
): Promise<void> {
  await page.goto(
    `/tests/browser/batch2-fixture.html?component=${name}&mode=${mode}${controlled ? '&controlled=true' : ''}`,
  )
  await page.waitForFunction(() => Boolean(window.__benosBatchTwo))
  await expect
    .poll(() => page.evaluate(() => window.__benosBatchTwo.hasRef()))
    .toBe(true)
  await expect(page.locator(`#${ids[name]}`)).toHaveCount(1)
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

for (const name of componentNames) {
  test(`${name}: axe in light, dark, RTL, and dark RTL`, async ({ page }) => {
    for (const mode of ['light', 'dark', 'rtl', 'dark-rtl'] as const) {
      await renderComponent(page, name, mode)
      if (name === 'select')
        await page.getByRole('combobox', { name: 'Choose a region' }).click()
      await runAxe(page)
    }
  })

  test(`${name}: keyboard interaction in LTR and RTL`, async ({
    page,
    browserName,
  }) => {
    for (const mode of ['light', 'dark', 'rtl', 'dark-rtl'] as const) {
      await renderComponent(page, name, mode)
      expect(await page.evaluate(() => window.__benosBatchTwo.rootId())).toBe(
        ids[name],
      )

      if (name === 'checkbox') {
        const checkbox = page.getByRole('checkbox', { name: 'Accept terms' })
        await checkbox.focus()
        await checkbox.press('Space')
        await expect(checkbox).toBeChecked()
        await checkbox.press('Tab')
        await expect(page.locator('#batch2-after')).toBeFocused()
      } else if (name === 'switch') {
        const toggle = page.getByRole('switch', { name: 'Product updates' })
        const accessibleTree = await toggle.ariaSnapshot()
        expect(accessibleTree).toContain('switch "Product updates"')
        await toggle.focus()
        await toggle.press('Space')
        await expect(toggle).not.toBeChecked()
        await toggle.press('Tab')
        await expect(page.locator('#batch2-after')).toBeFocused()
      } else if (name === 'radio-group') {
        const radios = page.getByRole('radio')
        await radios.nth(0).focus()
        const rtl = mode === 'rtl' || mode === 'dark-rtl'
        await radios.nth(0).press(rtl ? 'ArrowLeft' : 'ArrowRight')
        if (rtl && browserName === 'webkit') {
          // WebKit's native radio inputs do not reverse ArrowLeft in RTL.
          await expect(radios.nth(0)).toBeChecked()
        } else {
          await expect(radios.nth(1)).toBeFocused()
          await expect(radios.nth(1)).toBeChecked()
        }
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch2-after')).toBeFocused()
      } else if (name === 'select') {
        const trigger = page.getByRole('combobox', { name: 'Choose a region' })
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
        await listbox.press('s')
        await expect(page.getByRole('option').nth(1)).toHaveAttribute(
          'data-highlighted',
          '',
        )
        await listbox.press('Enter')
        await expect(trigger).toContainText('South')
        await trigger.press('ArrowDown')
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden()
        await expect(trigger).toBeFocused()
        await trigger.press('ArrowDown')
        await page.keyboard.press('Tab')
        // Tracked Zag 1.44.0 behavior: Tab is prevented and the popup stays open.
        await expect(listbox).toBeVisible()
        await expect(page.locator('.benos-select__list')).toBeFocused()
      } else if (name === 'tabs') {
        const tabs = page.getByRole('tab')
        await tabs.nth(0).focus()
        const rtl = mode === 'rtl' || mode === 'dark-rtl'
        await tabs.nth(0).press(rtl ? 'ArrowLeft' : 'ArrowRight')
        await expect(tabs.nth(1)).toBeFocused()
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
        await tabs.nth(1).press('End')
        await expect(tabs.nth(2)).toBeFocused()
        await tabs.nth(2).press('Home')
        await expect(tabs.nth(0)).toBeFocused()
        await tabs.nth(0).press('Tab')
        await expect(page.getByRole('tabpanel').first()).toBeFocused()
      } else {
        const triggers = page.getByRole('button', {
          name: /Shipping|Returns|Billing/,
        })
        await triggers.nth(0).focus()
        await triggers.nth(0).press('Enter')
        await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false')
        await triggers.nth(0).press('Space')
        await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'true')
        await triggers.nth(0).press('Tab')
        await expect(triggers.nth(1)).toBeFocused()
      }

      await page.evaluate(() => window.__benosBatchTwo.dispose())
      await expect
        .poll(() => page.evaluate(() => window.__benosBatchTwo.hasRef()))
        .toBe(false)
    }
  })

  test(`${name}: controlled state and ID override`, async ({ page }) => {
    await renderComponent(page, name, 'light', true)
    const id = await page.evaluate(() => window.__benosBatchTwo.rootId())
    expect(id).toBe(ids[name])

    if (name === 'checkbox') {
      const checkbox = page.getByRole('checkbox', { name: 'Accept terms' })
      await checkbox.focus()
      await checkbox.press('Space')
      await expect(checkbox).toBeChecked()
    } else if (name === 'switch') {
      const toggle = page.getByRole('switch', { name: 'Product updates' })
      await toggle.focus()
      await toggle.press('Space')
      await expect(toggle).not.toBeChecked()
    } else if (name === 'radio-group') {
      await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked()
      await page.getByRole('radio', { name: 'Standard' }).press('ArrowRight')
      await expect(page.getByRole('radio', { name: 'Express' })).toBeChecked()
    } else if (name === 'select') {
      const trigger = page.getByRole('combobox', { name: 'Choose a region' })
      await trigger.focus()
      await trigger.press('ArrowDown')
      await page.getByRole('option', { name: 'South' }).click()
      await expect(trigger).toContainText('South')
    } else if (name === 'tabs') {
      const profile = page.getByRole('tab', { name: 'Profile' })
      await profile.focus()
      await profile.press('ArrowRight')
      await expect(page.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
        'aria-selected',
        'false',
      )
      await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    } else {
      const shipping = page.getByRole('button', { name: 'Shipping' })
      await shipping.focus()
      await shipping.press('Enter')
      await expect(shipping).toHaveAttribute('aria-expanded', 'false')
    }
    await page.evaluate(() => window.__benosBatchTwo.dispose())
  })
}
