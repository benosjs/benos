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
  // The detail page renders inside the shared projects layout outlet.
  await expect(page.getByRole('heading', { name: 'Projects' })).toHaveCount(1)
  await expect(
    page.getByRole('link', { name: 'All projects', exact: true }),
  ).toBeVisible()

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

const requests = (page: import('@playwright/test').Page) =>
  page.evaluate(() => [...(window.__dashboardRequests ?? [])])

test('revisits projects from the query cache without new requests', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects`)
  await expect(page.getByRole('link', { name: /Signal runtime/ })).toBeVisible()
  await page.getByRole('link', { name: /Signal runtime/ }).click()
  await expect(
    page.getByText('Project ID: signals', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page.getByRole('link', { name: /Signal runtime/ })).toBeVisible()
  await page.getByRole('link', { name: /Signal runtime/ }).click()
  await expect(
    page.getByText('Project ID: signals', { exact: true }),
  ).toBeVisible()
  expect(await requests(page)).toEqual([
    'GET /projects',
    'GET /projects/signals',
  ])
})

test('saving a project updates the detail view and the cached list', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects/router`)
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  await page.getByLabel('Project name').fill('Typed router v2')
  await expect(
    page.getByRole('status').filter({ hasText: 'Unsaved changes' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Typed router v2' }),
  ).toBeVisible()
  // The saved form is pristine, so leaving does not ask.
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(
    page.getByRole('link', { name: /Typed router v2/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Typed router', exact: true }),
  ).toHaveCount(0)
  const log = await requests(page)
  expect(log.filter((entry) => entry === 'PUT /projects/router')).toHaveLength(
    1,
  )
  expect(log.filter((entry) => entry === 'GET /projects/router')).toHaveLength(
    1,
  )
})

test('rejects a short name before saving and focuses the field', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects/router`)
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  const name = page.getByLabel('Project name')
  await name.fill('x')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(name).toBeFocused()
  await expect(name).toHaveAccessibleDescription(
    'Names need at least two characters.',
  )
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  // Every change validates after a failed submit.
  await name.fill('xy')
  await expect(name).toHaveAccessibleDescription('')
  const log = await requests(page)
  expect(log).not.toContain('PUT /projects/router')
})

test('maps a server issue to its field', async ({ page }) => {
  await page.goto(`${dashboardUrl}/projects/router`)
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  const name = page.getByLabel('Project name')
  await name.fill('Signal runtime')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(name).toHaveAccessibleDescription(
    'Another project already uses this name.',
  )
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
  await expect(name).toHaveValue('Signal runtime')
})

test('asks before leaving unsaved changes and stays when refused', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects/router`)
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  await page.getByLabel('Owner').fill('Grace Hopper')
  const messages: string[] = []
  page.on('dialog', (dialog) => {
    messages.push(dialog.message())
    void dialog.dismiss()
  })
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect.poll(() => messages).toEqual(['Discard unsaved changes?'])
  await expect(page).toHaveURL(`${dashboardUrl}/projects/router`)
  await expect(page.getByLabel('Owner')).toHaveValue('Grace Hopper')
  const log = await requests(page)
  expect(log).not.toContain('GET /projects')
})

test('restores the entry when a refused back navigation is undone', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects`)
  await page.getByRole('link', { name: /Typed router/ }).click()
  await expect(page).toHaveURL(`${dashboardUrl}/projects/router`)
  await page.getByLabel('Owner').fill('Grace Hopper')
  let asked = 0
  page.on('dialog', (dialog) => {
    asked++
    void dialog.dismiss()
  })
  await page.goBack()
  await expect.poll(() => asked).toBe(1)
  await expect(page).toHaveURL(`${dashboardUrl}/projects/router`)
  await expect(page.getByLabel('Owner')).toHaveValue('Grace Hopper')
  // The restored entry is the same one: Back still leads to the list once confirmed.
  page.removeAllListeners('dialog')
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goBack()
  await expect(page).toHaveURL(`${dashboardUrl}/projects`)
  await expect(page.getByRole('link', { name: /Typed router/ })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(`${dashboardUrl}/projects/router`)
  // The discarded edit does not come back.
  await expect(page.getByLabel('Owner')).not.toHaveValue('Grace Hopper')
  expect(asked).toBe(1)
})

test('leaves and discards the edits when confirmed', async ({ page }) => {
  await page.goto(`${dashboardUrl}/projects/router`)
  await expect(
    page.getByRole('heading', { name: 'Typed router' }),
  ).toBeVisible()
  await page.getByLabel('Owner').fill('Grace Hopper')
  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(page).toHaveURL(`${dashboardUrl}/projects`)
  await page.getByRole('link', { name: /Typed router/ }).click()
  await expect(page.getByLabel('Owner')).not.toHaveValue('Grace Hopper')
})

test('stars optimistically and rolls back when the server refuses', async ({
  page,
}) => {
  await page.goto(`${dashboardUrl}/projects/renderer`)
  const star = page.getByRole('button', { name: /Star/ })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await expect(star).toHaveText('★ Starred')
  await expect(star).toBeEnabled()
  await page.getByRole('link', { name: 'All projects', exact: true }).click()
  await expect(
    page.getByRole('link', { name: /DOM renderer/ }).getByLabel('Starred'),
  ).toBeVisible()

  await page.goto(`${dashboardUrl}/projects/registry`)
  const paused = page.getByRole('button', { name: /Star/ })
  await expect(paused).toHaveAttribute('aria-pressed', 'false')
  await paused.click()
  await expect(paused).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByText('Paused projects cannot be starred.'),
  ).toBeVisible()
  await expect(paused).toHaveAttribute('aria-pressed', 'false')
})
