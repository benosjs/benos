import { afterEach, describe, expect, it } from 'vitest'
import { computed, createRoot, effect, signal } from '@benosjs/core'
import { mutation } from '@benosjs/query'
import { formModel } from '../src/index.js'
import type { StandardSchemaV1 } from '../src/index.js'

/** F2 does not validate yet; a pass-through schema supplies the types. */
const schema = <T>(): StandardSchemaV1<T> => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) => ({ value: value as T }),
  },
})

interface Profile {
  name: string
  address: { city: string; zip: string }
  tags: string[]
  born: Date
}

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
})
function owned<T>(fn: () => T): T {
  return createRoot((dispose) => {
    roots.push(dispose)
    return fn()
  })
}

const echo = <I>() => {
  const inputs: I[] = []
  const save = mutation({
    run: (input: I) => {
      inputs.push(input)
      return input
    },
  })
  return { inputs, save }
}

describe('create forms', () => {
  it('submit the values themselves by default', async () => {
    const { inputs, save } = echo<{ title: string }>()
    const model = formModel({
      initial: () => ({ title: '' }),
      schema: schema<{ title: string }>(),
      save,
    })
    const form = owned(model)
    form.field('title').set('First')
    await expect(form.submit()).resolves.toEqual({
      ok: true,
      value: { title: 'First' },
    })
    expect(inputs).toEqual([{ title: 'First' }])
    // After a successful create, the form returns to its initial values.
    expect(form.field('title').value()).toBe('')
  })

  it('maps values to the mutation input with `input`', async () => {
    const { inputs, save } = echo<{ body: { title: string } }>()
    const model = formModel({
      initial: () => ({ title: 'x' }),
      schema: schema<{ title: string }>(),
      save,
      input: (values) => ({ body: values }),
    })
    await owned(model).submit()
    expect(inputs).toEqual([{ body: { title: 'x' } }])
  })

  it('report a throwing `input` as a failed submission', async () => {
    const { save } = echo<string>()
    const model = formModel({
      initial: () => ({ title: 'x' }),
      schema: schema<{ title: string }>(),
      save,
      input: () => {
        throw new Error('bad input')
      },
      message: (error) => `Save failed: ${(error as Error).message}`,
    })
    const form = owned(model)
    await expect(form.submit()).resolves.toMatchObject({
      ok: false,
      reason: 'failed',
      cancelled: false,
    })
    expect(form.error()).toBe('Save failed: bad input')
  })

  it('use a generic message for errors without one', async () => {
    const model = formModel({
      initial: () => ({ title: 'x' }),
      schema: schema<{ title: string }>(),
      save: mutation({
        run: (input: { title: string }): string => {
          throw `plain ${input.title}`
        },
      }),
    })
    const form = owned(model)
    await form.submit()
    expect(form.error()).toBe('Could not save.')
  })
})

describe('source-bound forms', () => {
  it('have no record until the source is present', async () => {
    const record = signal<Profile | null>(null)
    const { save } = echo<{ name: string }>()
    const model = formModel({
      source: () => record(),
      schema: schema<{ name: string }>(),
      from: (p: Profile) => ({ name: p.name }),
      save,
    })
    const form = owned(model)
    const name = form.field('name')
    expect(form.values()).toBeUndefined()
    expect(name.value()).toBeUndefined()
    name.set('ignored')
    name.blur()
    expect(name.touched()).toBe(false)
    await expect(form.submit()).resolves.toEqual({
      ok: false,
      reason: 'no-source',
    })
    record.set(profile('Ada'))
    expect(name.value()).toBe('Ada')
    expect(form.dirty()).toBe(false)
  })

  it('treat a new source object as a new record', () => {
    const record = signal(profile('Ada'))
    const model = formModel({
      source: () => record(),
      schema: schema<{ name: string }>(),
      from: (p: Profile) => ({ name: p.name }),
      save: echo<{ name: string }>().save,
    })
    const form = owned(model)
    form.field('name').set('Edited')
    record.set(profile('Grace'))
    expect(form.field('name').value()).toBe('Grace')
    expect(form.dirty()).toBe(false)
  })
})

describe('paths and values', () => {
  const model = (record: () => Profile) =>
    formModel({
      source: record,
      schema: schema<Profile>(),
      from: (p: Profile) => p,
      save: echo<Profile>().save,
    })

  it('copies only the edited branches into values()', () => {
    const original = profile('Ada')
    const form = owned(model(() => original))
    form.field('address.city').set('Paris')
    form.field('tags.1').set('b2')
    const values = form.values()
    expect(values).toEqual({
      ...original,
      address: { city: 'Paris', zip: '75001' },
      tags: ['a', 'b2'],
    })
    expect(values?.born).toBe(original.born)
    expect(values?.address).not.toBe(original.address)
    expect(original.address.city).toBe('London')
    expect(original.tags).toEqual(['a', 'b'])
    expect(Array.isArray(values?.tags)).toBe(true)
  })

  it('compares arrays element-wise and dates by time', () => {
    const original = profile('Ada')
    const form = owned(model(() => original))
    form.field('tags').set(['a', 'b'])
    expect(form.field('tags').dirty()).toBe(false)
    form.field('born').set(new Date(original.born.getTime()))
    expect(form.field('born').dirty()).toBe(false)
    form.field('born').set(new Date(0))
    expect(form.field('born').dirty()).toBe(true)
  })

  it('compares plain object values one level deep', () => {
    const original = profile('Ada')
    const form = owned(model(() => original))
    form.field('address').set({ city: 'London', zip: '75001' })
    expect(form.field('address').dirty()).toBe(false)
    form.field('address').set({ city: 'London', zip: '1' })
    expect(form.dirty()).toBe(true)
  })

  it('updates bindings for one field without touching others', () => {
    const form = owned(model(() => profile('Ada')))
    const seen: string[] = []
    // field() creates signals, so it is called during setup, never inside a computed.
    const nameField = form.field('name')
    const cityField = form.field('address.city')
    owned(() => {
      const name = computed(() => nameField.value())
      effect(() => void seen.push(`name:${name()}`))
      const city = computed(() => cityField.value())
      effect(() => void seen.push(`city:${city()}`))
    })
    seen.length = 0
    form.field('address.city').set('Rome')
    expect(seen).toEqual(['city:Rome'])
  })
})

function profile(name: string): Profile {
  return {
    name,
    address: { city: 'London', zip: '75001' },
    tags: ['a', 'b'],
    born: new Date(2000, 0, 1),
  }
}
