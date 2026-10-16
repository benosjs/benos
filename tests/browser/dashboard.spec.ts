import { expect, test } from '@playwright/test'

const dashboardUrl = 'http://127.0.0.1:4174'

test('loads the overview and navigates through loader-backed project routes', async ({
  page,
}) => {
  await page.goto(dashboardUrl)
  await expect(
    page.getByRole('heading', { name: 'Good morning, Ada' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Projects' }).click()
  await expect(page).toHaveURL(`${dashboardUrl}/projects`)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Signal runtime/ })).toBeVisible()

  await page.getByRole('link', { name: /Signal runtime/ }).click()
  await expect(page).toHaveURL(`${dashboardUrl}/projects/signals`)
  await expect(
    page.getByText('Project ID: signals', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Signal runtime' }),
  ).toBeVisible()
  await expect(page.getByText('Ada Lovelace', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(`${dashboardUrl}/projects`)
  await expect(page.getByRole('link', { name: /Signal runtime/ })).toBeVisible()
})

test('renders the not-found view for an unknown route', async ({ page }) => {
  await page.goto(`${dashboardUrl}/no-such-page`)
  await expect(
    page.getByRole('heading', { name: 'This route does not exist' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Back to overview' }),
  ).toHaveAttribute('href', '/')
})
