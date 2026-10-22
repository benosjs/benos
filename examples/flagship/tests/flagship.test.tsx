import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditProject } from '../src/shared/project.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.doUnmock('../src/shared/schema.js')
  vi.resetModules()
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

/** Mounts the flagship slice with fresh query and form definitions. */
async function mount(initial = '/projects/atlas') {
  // Fresh modules give each test its own query definitions and default cache;
  // the DOM and router come from the same fresh graph as the app.
  vi.resetModules()
  const { render } = await import('@benosjs/dom')
  const { memoryHistory, RouterOutlet } = await import('@benosjs/router')
  const { queryCache } = await import('@benosjs/query')
  const { createAppRouter } = await import('../src/benos/routes/manifest.js')
  const { projectQuery } = await import('../src/benos/data.js')
  const { projectRoute } = await import('../src/benos/routes/refs.js')
  const { api } = await import('../src/shared/project.js')
  api.delay = 0
  const history = memoryHistory({ initialEntries: [initial] })
  const router = createAppRouter(history)
  roots.push(render(() => <RouterOutlet router={router} />, document.body))
  const input = (label: string) => {
    const element = [...document.querySelectorAll('label')].find(
      (candidate) => candidate.textContent === label,
    )
    const control = element && document.getElementById(element.htmlFor)
    if (!(control instanceof HTMLInputElement))
      throw new Error(`No input labelled ${label}`)
    return control
  }
  const type = (label: string, value: string) => {
    const control = input(label)
    control.value = value
    control.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const save = () =>
    document
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  const alert = () => document.querySelector('[role="alert"]')?.textContent
  const describedBy = (label: string) =>
    (input(label).getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ')
  await vi.waitFor(() => expect(document.querySelector('form')).not.toBeNull())
  /** Changes a record on the server, as another user would. */
  const change = (id: string, values: Partial<EditProject>) => {
    const project = api.projects.get(id)
    if (!project) throw new Error(`No project ${id}`)
    api.projects.set(id, { ...project, ...values })
  }
  return {
    api,
    change,
    router,
    history,
    projectQuery,
    input,
    type,
    save,
    alert,
    describedBy,
    refetch: (projectId: string) =>
      queryCache().invalidate(projectQuery.key(projectId)),
    go: (projectId: string) =>
      router.navigate({ to: projectRoute, params: { projectId } }),
    form: () => document.querySelector('form'),
  }
}

describe('flagship editor', () => {
  it('renders the committed record through the registry Input', async () => {
    const app = await mount()
    expect(app.input('Name').value).toBe('Atlas')
    expect(app.input('Owner email').value).toBe('ada@example.com')
    expect(app.input('Name').classList).toContain('benos-input')
  })

  it('changes data only at the commit of B, in the same editor', async () => {
    vi.stubGlobal('confirm', () => true)
    const app = await mount()
    const form = app.form()
    app.type('Name', 'Atlas edited')
    const hold = deferred()
    app.api.hold = hold.promise
    const navigation = app.go('beacon')
    await vi.waitFor(() =>
      expect(app.api.log).toContain('GET /projects/beacon'),
    )
    // B is loading: the editor still shows A and A's edit.
    expect(app.input('Name').value).toBe('Atlas edited')
    expect(app.router.location()).toBe('/projects/atlas')
    hold.resolve()
    app.api.hold = undefined
    await navigation
    expect(app.router.location()).toBe('/projects/beacon')
    expect(app.input('Name').value).toBe('Beacon')
    expect(app.form()).toBe(form)
  })

  it('ignores a background result for A after B committed', async () => {
    const app = await mount()
    const hold = deferred()
    app.api.hold = hold.promise
    const stale = app.refetch('atlas')
    app.api.hold = undefined
    await app.go('beacon')
    app.change('atlas', { name: 'Atlas from the server' })
    hold.resolve()
    await stale
    expect(app.input('Name').value).toBe('Beacon')
  })

  it('updates pristine fields on a same-record refetch and keeps dirty ones', async () => {
    const app = await mount()
    app.type('Owner email', 'me@example.com')
    app.change('atlas', {
      name: 'Atlas renamed',
      ownerEmail: 'other@example.com',
    })
    await app.refetch('atlas')
    await vi.waitFor(() =>
      expect(app.input('Name').value).toBe('Atlas renamed'),
    )
    expect(app.input('Owner email').value).toBe('me@example.com')
  })

  it('refreshes the saved record when the save finishes after navigating away', async () => {
    vi.stubGlobal('confirm', () => true)
    const app = await mount()
    app.type('Name', 'Atlas saved')
    const hold = deferred()
    app.api.hold = hold.promise
    app.save()
    await vi.waitFor(() => expect(app.api.log).toContain('PUT /projects/atlas'))
    app.api.hold = undefined
    await app.go('beacon')
    expect(app.input('Name').value).toBe('Beacon')
    hold.resolve()
    await vi.waitFor(() =>
      expect(app.api.projects.get('atlas')?.name).toBe('Atlas saved'),
    )
    // B is untouched, and revisiting A shows the saved record from a new fetch.
    expect(app.input('Name').value).toBe('Beacon')
    await app.go('atlas')
    expect(
      app.api.log.filter((request) => request === 'GET /projects/atlas'),
    ).toHaveLength(2)
    expect(app.input('Name').value).toBe('Atlas saved')
  })

  it('links schema errors to their fields and focuses the first one', async () => {
    const app = await mount()
    app.type('Name', 'A')
    app.type('Owner email', 'not an email')
    app.save()
    await vi.waitFor(() =>
      expect(app.describedBy('Name')).toBe(
        'Names need at least two characters.',
      ),
    )
    expect(app.describedBy('Owner email')).toBe('Enter a valid email address.')
    expect(app.input('Name').getAttribute('aria-invalid')).toBeDefined()
    expect(document.activeElement).toBe(app.input('Name'))
    expect(app.api.log).not.toContain('PUT /projects/atlas')
    app.type('Name', 'Atlas 2')
    expect(app.describedBy('Name')).toBe('')
  })

  it('awaits an async validator and shows root issues in the alert', async () => {
    vi.doMock('../src/shared/schema.js', async () => {
      const { z } = await import('zod')
      return {
        editSchema: z
          .object({ name: z.string(), ownerEmail: z.string() })
          .refine(
            async (value) => {
              await new Promise((done) => setTimeout(done, 5))
              return value.name !== value.ownerEmail
            },
            { message: 'Name and owner email must differ.' },
          ),
      }
    })
    const app = await mount()
    app.type('Name', 'same@example.com')
    app.type('Owner email', 'same@example.com')
    app.save()
    await vi.waitFor(() =>
      expect(app.alert()).toBe('Name and owner email must differ.'),
    )
    expect(app.api.log).not.toContain('PUT /projects/atlas')
  })

  it.each(['valibot', 'arktype'] as const)(
    'validates the same editor with %s',
    async (library) => {
      vi.doMock('../src/shared/schema.js', async () => {
        if (library === 'valibot') {
          const v = await import('valibot')
          return {
            editSchema: v.object({
              name: v.pipe(
                v.string(),
                v.minLength(2, 'Names need at least two characters.'),
              ),
              ownerEmail: v.pipe(
                v.string(),
                v.email('Enter a valid email address.'),
              ),
            }),
          }
        }
        const { type } = await import('arktype')
        return {
          editSchema: type({ name: 'string >= 2', ownerEmail: 'string.email' }),
        }
      })
      const app = await mount()
      app.type('Name', 'A')
      app.save()
      await vi.waitFor(() => expect(app.describedBy('Name')).not.toBe(''))
      expect(app.describedBy('Owner email')).toBe('')
      app.type('Name', 'Atlas 3')
      app.save()
      await vi.waitFor(() =>
        expect(app.api.log).toContain('PUT /projects/atlas'),
      )
    },
  )

  it('keeps a failed save in form state without reporting it, and retry clears it', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const app = await mount()
    app.type('Name', 'Locked')
    app.save()
    await vi.waitFor(() => expect(app.alert()).toBe('This project is locked.'))
    expect(app.input('Name').value).toBe('Locked')
    app.type('Name', 'Unlocked')
    app.save()
    await vi.waitFor(() => expect(app.alert()).toBe(''))
    await vi.waitFor(() =>
      expect(app.api.projects.get('atlas')?.name).toBe('Unlocked'),
    )
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('asks before leaving unsaved changes', async () => {
    const ask = vi.fn(() => false)
    vi.stubGlobal('confirm', ask)
    const app = await mount()
    app.type('Name', 'Atlas edited')
    await expect(app.go('beacon')).resolves.toEqual({ status: 'blocked' })
    expect(ask).toHaveBeenCalledWith('Discard unsaved changes?')
    expect(app.api.log).not.toContain('GET /projects/beacon')
    expect(app.input('Name').value).toBe('Atlas edited')
  })
})
