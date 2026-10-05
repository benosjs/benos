import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const componentNames = [
  'button',
  'input',
  'textarea',
  'label',
  'card',
  'badge',
  'separator',
] as const
type ComponentName = (typeof componentNames)[number]

declare global {
  interface Window {
    __benosBatchOne: {
      render: (
        name: ComponentName,
        theme: 'light' | 'dark',
        direction: 'ltr' | 'rtl',
      ) => void
      refId: () => string | undefined
      refCount: () => number
      dispose: () => void
    }
  }
}

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')

async function renderComponent(
  page: Page,
  name: ComponentName,
  theme: 'light' | 'dark' = 'light',
  direction: 'ltr' | 'rtl' = 'ltr',
): Promise<void> {
  await page.goto('/tests/browser/batch1-fixture.html')
  await page.waitForFunction(() => Boolean(window.__benosBatchOne))
  await page.evaluate(
    ({ name, theme, direction }) => {
      window.__benosBatchOne.render(name, theme, direction)
    },
    { name, theme, direction },
  )
}

async function expectNoAxeViolations(page: Page): Promise<void> {
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
  test(name + ': axe in light, dark, and RTL', async ({ page }) => {
    for (const [theme, direction] of [
      ['light', 'ltr'],
      ['dark', 'ltr'],
      ['light', 'rtl'],
      ['dark', 'rtl'],
    ] as const) {
      await renderComponent(page, name, theme, direction)
      await expectNoAxeViolations(page)
    }
  })

  test(name + ': keyboard behavior in LTR and RTL', async ({ page }) => {
    for (const direction of ['ltr', 'rtl'] as const) {
      await renderComponent(page, name, 'light', direction)
      const expectedId = {
        button: 'batch-button',
        input: 'batch-input',
        textarea: 'batch-textarea',
        label: 'batch-label',
        card: 'batch-card',
        badge: 'batch-badge',
        separator: 'batch-separator',
      }[name]
      await expect
        .poll(() => page.evaluate(() => window.__benosBatchOne.refId()))
        .toBe(expectedId)
      expect(await page.evaluate(() => window.__benosBatchOne.refCount())).toBe(
        1,
      )
      if (name === 'button') {
        const button = page.getByRole('button', { name: 'Save changes' })
        await button.focus()
        await button.press('Enter')
        await button.press('Space')
        await expect(page.locator('#batch-activations')).toHaveText('2')
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else if (name === 'input') {
        const input = page.getByRole('textbox', {
          name: 'Email address',
          exact: true,
        })
        await input.focus()
        await page.keyboard.press('Tab')
        await expect(
          page.getByRole('textbox', { name: 'Invalid email' }),
        ).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else if (name === 'textarea') {
        const textarea = page.getByRole('textbox', {
          name: 'Message',
          exact: true,
        })
        await textarea.focus()
        await page.keyboard.press('Tab')
        await expect(
          page.getByRole('textbox', { name: 'Invalid message' }),
        ).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else if (name === 'label') {
        await page.getByText('Display name').click()
        await expect(page.locator('#batch-label-control')).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else if (name === 'card') {
        await page.getByRole('button', { name: 'Edit account' }).focus()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else if (name === 'badge') {
        await page.locator('#batch-before').focus()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
      } else {
        await page.locator('#batch-before').focus()
        await page.keyboard.press('Tab')
        await expect(page.locator('#batch-after')).toBeFocused()
        await expect(page.getByRole('separator')).toHaveAttribute(
          'aria-orientation',
          'horizontal',
        )
      }
      await page.evaluate(() => window.__benosBatchOne.dispose())
      expect(await page.evaluate(() => window.__benosBatchOne.refCount())).toBe(
        1,
      )
    }
  })
}

test('WebKit traverses explicit fixture tab stops without OS setting changes', async ({
  page,
}) => {
  await page.goto('/tests/browser/keyboard-access.html')
  await page.keyboard.press('Tab')
  await expect(page.locator('#keyboard-button')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#keyboard-link')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#keyboard-input')).toBeFocused()
})

test('gallery visual scales, logical field text, and dark danger contrast', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/examples/ui-gallery/')
  await expect(page.locator('.mode-panel')).toHaveCount(3)
  const scale = await page.evaluate(() => {
    const height = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing gallery visual ${selector}`)
      return element.getBoundingClientRect().height
    }
    const style = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing gallery visual ${selector}`)
      return getComputedStyle(element)
    }
    return {
      buttonSmall: height('.mode-panel[data-theme="light"] .benos-button--sm'),
      buttonDefault: height(
        '.mode-panel[data-theme="light"] .benos-button--md',
      ),
      buttonLarge: height('.mode-panel[data-theme="light"] .benos-button--lg'),
      inputSmall: height('#small-input-light'),
      inputDefault: height('#email-light'),
      inputLarge: height('#large-input-light'),
      secondary: style(
        '.mode-panel[data-theme="light"] .benos-button--secondary',
      ).backgroundColor,
      outline: style('.mode-panel[data-theme="light"] .benos-button--outline')
        .backgroundColor,
      labelSize: Number.parseFloat(
        style('.mode-panel[data-theme="light"] .benos-label').fontSize,
      ),
      headingSize: Number.parseFloat(
        style('.mode-panel[data-theme="light"] h3').fontSize,
      ),
      invalidCursor: style('#disabled-light').cursor,
      invalidTextareaCursor: style('#disabled-notes-light').cursor,
      errorAlignment: style('#error-rtl').textAlign,
      helperAlignment: style('#notes-error-rtl').textAlign,
      darkDanger: (() => {
        const danger = style(
          '.mode-panel[data-theme="dark"] .benos-button--danger',
        )
        const channels = (color: string): [number, number, number] => {
          const values = color.match(/[\d.]+/g)
          if (!values || values.length < 3)
            throw new Error(`Cannot parse ${color}`)
          return [Number(values[0]), Number(values[1]), Number(values[2])]
        }
        const luminance = (color: string) => {
          const [red, green, blue] = channels(color)
          const linear = (channel: number) => {
            const value = channel / 255
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4
          }
          return (
            0.2126 * linear(red) +
            0.7152 * linear(green) +
            0.0722 * linear(blue)
          )
        }
        const background = luminance(danger.backgroundColor)
        const foreground = luminance(danger.color)
        return (
          (Math.max(background, foreground) + 0.05) /
          (Math.min(background, foreground) + 0.05)
        )
      })(),
    }
  })
  expect(scale.buttonSmall).toBeLessThan(scale.buttonDefault)
  expect(scale.buttonDefault).toBeLessThan(scale.buttonLarge)
  expect(scale.inputSmall).toBeLessThan(scale.inputDefault)
  expect(scale.inputDefault).toBeLessThan(scale.inputLarge)
  expect(scale.secondary).not.toBe(scale.outline)
  expect(scale.labelSize).toBeLessThan(scale.headingSize)
  expect(scale.invalidCursor).toBe('not-allowed')
  expect(scale.invalidTextareaCursor).toBe('not-allowed')
  expect(scale.errorAlignment).toBe('start')
  expect(scale.helperAlignment).toBe('start')
  expect(scale.darkDanger).toBeGreaterThanOrEqual(4.5)
})
