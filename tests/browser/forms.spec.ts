import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')
const modes = ['light', 'dark', 'rtl', 'dark-rtl'] as const

async function open(page: Page, mode: (typeof modes)[number] = 'light') {
  await page.goto(`/tests/browser/forms-fixture.html?mode=${mode}`)
  await page.waitForFunction(() => Boolean(window.__benosForms))
  await expect(page.locator('.benos-field')).toHaveCount(6)
}

async function runAxe(page: Page): Promise<void> {
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async () => {
    const axe = (
      window as typeof window & {
        axe?: {
          run: (context: HTMLElement) => Promise<{
            violations: Array<{ id: string; nodes: unknown[] }>
          }>
        }
      }
    ).axe
    if (!axe) throw new Error('axe-core failed to load')
    return (await axe.run(document.body)).violations.map((v) => v.id)
  })
  expect(violations).toEqual([])
}

const save = (page: Page) => page.getByRole('button', { name: 'Save' })

test('form fields: axe before and after a failed submit in light, dark, RTL, and dark RTL', async ({
  page,
}) => {
  for (const mode of modes) {
    await open(page, mode)
    await runAxe(page)
    await save(page).click()
    await expect(page.locator('.benos-field-error')).toHaveCount(5)
    await runAxe(page)
  }
})

test('form fields: labels, descriptions, and errors are linked to the controls', async ({
  page,
}) => {
  await open(page)
  const name = page.getByRole('textbox', { name: 'Display name' })
  await expect(name).toHaveAccessibleDescription('Shown to your team.')
  await expect(name).toHaveAttribute('aria-invalid', 'false')

  await save(page).click()
  await expect(name).toBeFocused()
  await expect(page.locator('.benos-field').first()).toHaveAttribute(
    'data-invalid',
    'true',
  )
  await expect(name).toHaveAccessibleDescription(
    'Shown to your team. Enter at least two characters.',
  )
  const bio = page.getByRole('textbox', { name: 'Bio' })
  await expect(bio).toHaveAccessibleDescription('Add a short bio.')
  await expect(page.getByRole('radiogroup', { name: 'Plan' })).toHaveAttribute(
    'aria-describedby',
    /-plan-error$/,
  )
  // Field errors are not live regions; focus carries the first one.
  await expect(page.locator('.benos-field-error[role]')).toHaveCount(0)
})

// Known gap, pending approval: the 0.4.0 registry Input and Textarea read
// `invalid` once during setup, so aria-invalid does not follow later changes.
// Fixing them changes immutable 0.4.0 registry payloads; it belongs to the
// 0.5.0 registry build. This test flips to passing when they are fixed.
test.fail(
  'form fields: registry Input reflects invalid after a failed submit',
  async ({ page }) => {
    await open(page)
    await save(page).click()
    await expect(
      page.getByRole('textbox', { name: 'Display name' }),
    ).toHaveAttribute('aria-invalid', 'true', { timeout: 1_000 })
  },
)

test('form fields: keyboard entry, focus on the first invalid field, and a successful save', async ({
  page,
  browserName,
}) => {
  await open(page)
  const name = page.getByRole('textbox', { name: 'Display name' })
  await name.focus()
  await page.keyboard.type('Ada')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Mathematician')
  // Enter in a text input submits; the first invalid field is now the checkbox.
  await name.press('Enter')
  const agree = page.getByRole('checkbox', { name: 'I accept the terms' })
  await expect(agree).toBeFocused()
  await page.keyboard.press('Space')
  await expect(agree).toBeChecked()
  await expect(page.locator('.benos-field-error')).toHaveCount(2)

  const notify = page.getByRole('switch', { name: 'Email notifications' })
  await expect(notify).toBeChecked()
  await notify.focus()
  await page.keyboard.press('Space')
  await expect(notify).not.toBeChecked()

  const team = page.getByRole('radio', { name: 'Team' })
  await team.focus()
  await page.keyboard.press('Space')
  await expect(team).toBeChecked()

  const region = page.getByRole('combobox', { name: 'Region' })
  await region.focus()
  await region.press('ArrowDown')
  await page.getByRole('option', { name: 'Europe' }).click()
  await expect(region).toContainText('Europe')
  await expect(page.locator('.benos-field-error')).toHaveCount(0)

  await save(page).click()
  await expect
    .poll(() => page.evaluate(() => window.__benosForms.saved()))
    .toEqual([
      {
        name: 'Ada',
        bio: 'Mathematician',
        agree: true,
        notify: false,
        plan: 'team',
        region: 'eu',
      },
    ])
  await expect(page.getByRole('alert')).toHaveText('')
  void browserName
})

test('form fields: inherit RTL direction without forcing LTR', async ({
  page,
}) => {
  await open(page, 'rtl')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('#forms-app [dir="ltr"]')).toHaveCount(0)
  const direction = await page
    .locator('.benos-field')
    .first()
    .evaluate((el) => getComputedStyle(el).direction)
  expect(direction).toBe('rtl')
})
