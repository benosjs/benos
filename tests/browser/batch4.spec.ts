import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core')

test('gallery links every catalog component to its guide page', async ({
  page,
}) => {
  await page.goto('/examples/ui-gallery/')
  const components = [
    'button',
    'input',
    'textarea',
    'label',
    'card',
    'badge',
    'separator',
    'checkbox',
    'switch',
    'radio-group',
    'select',
    'tabs',
    'accordion',
    'dialog',
    'popover',
    'tooltip',
    'dropdown-menu',
    'toast',
    'sortable-table',
  ]
  for (const component of components) {
    await expect(
      page.locator(
        `a[href="https://github.com/benosjs/benos/blob/main/docs/ui/components/${component}.md"]`,
      ),
    ).toHaveCount(3)
  }
})

test('renders a named semantic table and cycles sort state in place', async ({
  page,
}) => {
  await page.goto('/tests/browser/batch4-fixture.html')
  const table = page.getByRole('table', { name: 'Project members' })
  const header = page.getByRole('columnheader', { name: 'Name' })
  const row = page
    .getByRole('row')
    .filter({ hasText: 'Bravo with a long display value' })
  await expect(table).toBeVisible()
  await expect(header).toHaveAttribute('aria-sort', 'none')
  await row.evaluate((element) => {
    ;(element as HTMLElement & { retainedMarker?: string }).retainedMarker =
      'same-node'
  })

  await page.getByRole('button', { name: 'Name' }).click()
  await expect(header).toHaveAttribute('aria-sort', 'ascending')
  await expect(page.locator('tbody tr').first()).toContainText('Alpha')
  await expect(row).toHaveJSProperty('retainedMarker', 'same-node')
  await expect(
    page.locator('.benos-sortable-table__indicator').first(),
  ).toHaveText('↑')

  const nameButton = page.getByRole('button', { name: 'Name' })
  await nameButton.focus()
  await nameButton.press('Enter')
  await expect(header).toHaveAttribute('aria-sort', 'descending')
  await expect(page.locator('tbody tr').first()).toContainText('Delta')
  await nameButton.press('Space')
  await expect(header).toHaveAttribute('aria-sort', 'none')
  await expect(page.locator('tbody tr').first()).toContainText('Charlie')
  await expect(row).toHaveJSProperty('retainedMarker', 'same-node')

  await page.getByRole('button', { name: 'Score' }).click()
  await expect(page.locator('tbody tr').first()).toContainText('Bravo')
})

test('shows a useful empty state and truncates long text', async ({ page }) => {
  await page.goto('/tests/browser/batch4-fixture.html?empty')
  await expect(page.getByText('No members yet.')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(1)

  await page.goto('/tests/browser/batch4-fixture.html')
  const longText = page.getByRole('cell', {
    name: 'Bravo with a long display value that should truncate cleanly',
  })
  await expect(longText).toHaveCSS('text-overflow', 'ellipsis')
  await expect(longText).toHaveCSS('white-space', 'nowrap')
})

test('mixed-direction cell text follows its own direction in RTL and LTR tables', async ({
  page,
}) => {
  await page.goto('/tests/browser/batch4-fixture.html?rtl')
  const englishInRtl = page
    .getByRole('row')
    .filter({ hasText: 'Bravo with a long display value' })
    .locator('.benos-sortable-table__text')
  await expect(englishInRtl).toHaveAttribute('dir', 'auto')
  expect(
    await englishInRtl.evaluate((cell) => getComputedStyle(cell).direction),
  ).toBe('ltr')
  await expect(englishInRtl).toHaveCSS('text-overflow', 'ellipsis')

  await page.goto('/tests/browser/batch4-fixture.html?bidi')
  const arabicInLtr = page
    .getByRole('row')
    .filter({ hasText: 'مريم خوري' })
    .locator('.benos-sortable-table__text')
  await expect(arabicInLtr).toHaveAttribute('dir', 'auto')
  expect(
    await arabicInLtr.evaluate((cell) => getComputedStyle(cell).direction),
  ).toBe('rtl')
  await expect(arabicInLtr).toHaveCSS('text-overflow', 'ellipsis')
})

test('aligns numeric columns to the reading direction', async ({ page }) => {
  await page.goto('/tests/browser/batch4-fixture.html')
  const ltrAlignment = await page
    .locator('.benos-sortable-table__number')
    .first()
    .evaluate((cell) => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      const cellRect = cell.getBoundingClientRect()
      const textRect = range.getBoundingClientRect()
      return {
        align: getComputedStyle(cell).textAlign,
        endGap: cellRect.right - textRect.right,
        startGap: textRect.left - cellRect.left,
      }
    })
  expect(ltrAlignment.align).toBe('end')
  expect(ltrAlignment.endGap).toBeLessThan(ltrAlignment.startGap)
  await page.goto('/tests/browser/batch4-fixture.html?rtl')
  await expect(page.locator('table')).toHaveCSS('direction', 'rtl')
  const rtlAlignment = await page
    .locator('.benos-sortable-table__number')
    .first()
    .evaluate((cell) => {
      const range = document.createRange()
      range.selectNodeContents(cell)
      const cellRect = cell.getBoundingClientRect()
      const textRect = range.getBoundingClientRect()
      return {
        align: getComputedStyle(cell).textAlign,
        endGap: textRect.left - cellRect.left,
        startGap: cellRect.right - textRect.right,
      }
    })
  expect(rtlAlignment.align).toBe('end')
  expect(rtlAlignment.endGap).toBeLessThan(rtlAlignment.startGap)
  const headerAlignment = await page
    .getByRole('columnheader', { name: 'Name' })
    .evaluate((cell) => getComputedStyle(cell).textAlign)
  expect(headerAlignment).toBe('start')
})

test('sortable table fixture passes axe-core', async ({ page }) => {
  await page.goto('/tests/browser/batch4-fixture.html')
  await page.addScriptTag({ path: axePath })
  const result = await page.evaluate(async () => {
    const axe = (
      window as Window & {
        axe: {
          run: (
            root: Document,
          ) => Promise<{ violations: { id: string; help: string }[] }>
        }
      }
    ).axe
    return axe.run(document)
  })
  expect(result.violations).toEqual([])
})
