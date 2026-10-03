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
        await button.press('Tab')
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
        await page.locator('#batch-label-control').press('Tab')
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

test('WebKit full keyboard mode traverses native buttons and links', async ({
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
