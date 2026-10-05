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
    page.getByLabel('Components in batches 1, 2, 3, and 4').locator('span'),
  ).toHaveCount(19)

  for (let index = 0; index < 3; index += 1) {
    const panel = panels.nth(index)
    await expect(panel.locator('.benos-checkbox input')).toBeChecked()
    await expect(
      panel.locator('.benos-switch input[role="switch"]'),
    ).toBeChecked()
    await expect(
      panel.locator('.benos-radio-group input[type="radio"]').first(),
    ).toBeChecked()
    const selectTrigger = panel.locator('.benos-select__trigger')
    await expect(selectTrigger).toContainText(index === 2 ? 'الشمال' : 'North')
    await expect(panel.locator('.benos-select__content')).toBeHidden()
    await expect(panel.locator('.benos-select__chevron')).toHaveCount(1)
    await expect(
      panel.locator('.benos-select__control .benos-select__clear'),
    ).toHaveCount(1)
    const radioBottom = await panel
      .locator('.benos-radio-group')
      .evaluate((element) => element.getBoundingClientRect().bottom)
    const selectTop = await panel
      .locator('.benos-select')
      .evaluate((element) => element.getBoundingClientRect().top)
    expect(selectTop - radioBottom).toBeGreaterThan(0)
    expect(selectTop - radioBottom).toBeLessThan(20)
    await selectTrigger.click()
    await expect(panel.locator('.benos-select__content')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel.locator('.benos-select__content')).toBeHidden()
    const selectWidth = await panel
      .locator('.benos-select')
      .evaluate((element) => element.getBoundingClientRect().width)
    for (const selector of ['.benos-tabs', '.benos-accordion']) {
      const width = await panel
        .locator(selector)
        .evaluate((element) => element.getBoundingClientRect().width)
      expect(width).toBeCloseTo(selectWidth, 1)
    }
    await expect(
      panel.locator('.benos-tabs__trigger[aria-selected="true"]'),
    ).toHaveCount(1)
    await expect(
      panel.locator('.benos-accordion__trigger').first(),
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(
      panel
        .locator('.benos-accordion__trigger')
        .first()
        .locator('.benos-accordion__indicator'),
    ).toHaveAttribute('data-state', 'open')
    await expect(
      panel
        .locator('.benos-accordion__trigger')
        .nth(1)
        .locator('.benos-accordion__indicator'),
    ).toHaveAttribute('data-state', 'closed')
    if (index === 2) {
      await expect(panel.locator('.mode-hint')).toHaveAttribute('dir', 'ltr')
      const rtlTabs = panel.locator('.benos-tabs')
      const rtlLayout = await rtlTabs.evaluate((tabs) => {
        const label = tabs.querySelector('.benos-tabs__label')
        const list = tabs.querySelector('.benos-tabs__list')
        const selected = tabs.querySelector<HTMLElement>(
          '.benos-tabs__trigger[aria-selected="true"]',
        )
        const unselected = tabs.querySelector<HTMLElement>(
          '.benos-tabs__trigger[aria-selected="false"]',
        )
        const panel = tabs.querySelector('.benos-tabs__panel')
        if (!label || !list || !selected || !unselected || !panel)
          throw new Error('RTL tabs fixture is incomplete')
        return {
          direction: getComputedStyle(tabs).direction,
          labelAlignment: getComputedStyle(label).textAlign,
          panelDirection: getComputedStyle(panel).direction,
          panelAlignment: getComputedStyle(panel).textAlign,
          selectedLeft: selected.getBoundingClientRect().left,
          unselectedLeft: unselected.getBoundingClientRect().left,
          panelText: panel.textContent,
        }
      })
      expect(rtlLayout.direction).toBe('rtl')
      expect(rtlLayout.labelAlignment).toBe('start')
      expect(rtlLayout.panelDirection).toBe('rtl')
      expect(rtlLayout.panelAlignment).toBe('start')
      expect(rtlLayout.selectedLeft).toBeGreaterThan(rtlLayout.unselectedLeft)
      expect(rtlLayout.panelText?.trim().endsWith('.')).toBe(true)
    }
  }

  const darkPanel = panels.nth(1)
  const surfaceColors = await darkPanel.evaluate((panel) => {
    const baseCard = panel.querySelector('.card-grid .benos-card')
    const raisedCard = panel.querySelector('.benos-card--raised')
    if (!baseCard || !raisedCard)
      throw new Error('Gallery card samples are missing')
    return {
      base: getComputedStyle(baseCard).backgroundColor,
      raised: getComputedStyle(raisedCard).backgroundColor,
    }
  })
  expect(surfaceColors.raised).not.toBe(surfaceColors.base)

  const typeSizes = await panels.first().evaluate((panel) => {
    const selectors = [
      '.button-row .benos-button',
      '.field .benos-input',
      '.benos-checkbox',
      '.benos-switch',
      '.benos-radio-group__label',
      '.benos-select__trigger',
      '.benos-tabs__panel',
      '.benos-accordion__content',
    ]
    return selectors.map((selector) => {
      const element = panel.querySelector(selector)
      if (!element) throw new Error(`Gallery sample ${selector} is missing`)
      return getComputedStyle(element).fontSize
    })
  })
  expect(new Set(typeSizes).size).toBe(1)
})

test('Select closed and open states do not change surrounding layout', async ({
  page,
}) => {
  await renderComponent(page, 'select')
  const root = page.locator('.benos-select')
  await root.scrollIntoViewIfNeeded()

  const measure = () =>
    page.evaluate(() => {
      const select = document.querySelector('.benos-select')
      const content = document.querySelector('.benos-select__content')
      const after = document.querySelector('#batch2-after')
      if (!(select instanceof HTMLElement))
        throw new Error('Select root is missing')
      if (!(content instanceof HTMLElement))
        throw new Error('Select content is missing')
      if (!(after instanceof HTMLElement))
        throw new Error('Following button is missing')
      return {
        selectHeight: select.getBoundingClientRect().height,
        nextTop: after.getBoundingClientRect().top,
        contentHeight: content.getBoundingClientRect().height,
        hidden: content.hidden,
      }
    })

  const closed = await measure()
  expect(closed.hidden).toBe(true)
  expect(closed.contentHeight).toBe(0)

  const trigger = page.getByRole('combobox', { name: 'Choose a region' })
  await trigger.click()
  await expect(page.getByRole('listbox')).toBeVisible()
  const open = await measure()
  expect(open.hidden).toBe(false)
  expect(open.selectHeight).toBe(closed.selectHeight)
  expect(open.nextTop).toBe(closed.nextTop)

  await trigger.click()
  await expect(page.locator('.benos-select__content')).toBeHidden()
  const closedAgain = await measure()
  expect(closedAgain.selectHeight).toBe(closed.selectHeight)
  expect(closedAgain.nextTop).toBe(closed.nextTop)
})

test('checked checkbox marks have strong contrast in both color modes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/examples/ui-gallery/')
  const contrast = await page
    .locator(
      '.mode-panel[data-theme="light"][dir="ltr"], .mode-panel[data-theme="dark"][dir="ltr"]',
    )
    .evaluateAll((panels) =>
      panels.map((panel) => {
        const control = panel.querySelector(
          '.benos-checkbox__control[data-state="checked"]',
        )
        const mark = control?.querySelector('span')
        if (!control || !mark) throw new Error('Checkbox mark is missing')
        return {
          theme: panel.getAttribute('data-theme'),
          foreground: getComputedStyle(mark).color,
          background: getComputedStyle(control).backgroundColor,
        }
      }),
    )
  const ratios = await page.evaluate((colors) => {
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g)?.slice(0, 3)
      if (!values || values.length < 3)
        throw new Error(`Invalid color ${color}`)
      return values.map(Number)
    }
    const luminance = (color: string) => {
      const linear = channels(color).map((channel) => {
        const value = channel / 255
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4
      })
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
    }
    return colors.map(({ theme, foreground, background }) => {
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      )
      return {
        theme,
        foreground,
        ratio: (values[0] + 0.05) / (values[1] + 0.05),
      }
    })
  }, contrast)
  expect(ratios).toHaveLength(2)
  for (const result of ratios) {
    expect(
      result.ratio,
      `${result.theme} checkbox mark contrast`,
    ).toBeGreaterThanOrEqual(3)
  }
  const darkMark = ratios.find((result) => result.theme === 'dark')
  const darkPrimaryText = await page
    .locator('#button-primary-dark')
    .evaluate((button) => getComputedStyle(button).color)
  expect(darkMark?.foreground).toBe(darkPrimaryText)
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
      await expect(page.locator('#batch2-app [dir="ltr"]')).toHaveCount(0)
      if (mode === 'rtl' || mode === 'dark-rtl') {
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
        const directions = await page
          .locator('#batch2-app *')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).direction),
          )
        expect(directions.every((direction) => direction === 'rtl')).toBe(true)
      }

      if (name === 'checkbox') {
        const checkbox = page.getByRole('checkbox', { name: 'Accept terms' })
        await checkbox.focus()
        await checkbox.press('Space')
        await expect(checkbox).toBeChecked()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch2-after')).toBeFocused()
      } else if (name === 'switch') {
        const toggle = page.getByRole('switch', { name: 'Product updates' })
        const accessibleTree = await toggle.ariaSnapshot()
        expect(accessibleTree).toContain('switch "Product updates"')
        await toggle.focus()
        await toggle.press('Space')
        await expect(toggle).not.toBeChecked()
        await page.keyboard.press('Tab')
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
        await page.keyboard.press('End')
        await expect(page.getByRole('option').nth(2)).toHaveAttribute(
          'data-highlighted',
          '',
        )
        await page.keyboard.press('Home')
        await page.keyboard.press('s')
        await expect(page.getByRole('option').nth(1)).toHaveAttribute(
          'data-highlighted',
          '',
        )
        await page.keyboard.press('Enter')
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
        await page.keyboard.press('Tab')
        await expect(page.getByRole('tabpanel').first()).toBeFocused()
      } else {
        const triggers = page.getByRole('button', {
          name: /Shipping|Returns|Billing/,
        })
        await triggers.nth(0).focus()
        await triggers.nth(0).press('Enter')
        await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'false')
        await expect(
          triggers.nth(0).locator('.benos-accordion__indicator'),
        ).toHaveAttribute('data-state', 'closed')
        await triggers.nth(0).press('Space')
        await expect(triggers.nth(0)).toHaveAttribute('aria-expanded', 'true')
        await expect(
          triggers.nth(0).locator('.benos-accordion__indicator'),
        ).toHaveAttribute('data-state', 'open')
        await page.keyboard.press('Tab')
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
