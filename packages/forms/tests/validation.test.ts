import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, signal } from '@benosjs/core'
import { mutation } from '@benosjs/query'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { formModel } from '../src/index.js'
import type { StandardIssue, StandardSchemaV1 } from '../src/index.js'

interface Signup {
  name: string
  email: string
  address: { city: string }
  tags: string[]
}
const blank = (): Signup => ({
  name: '',
  email: 'not-an-email',
  address: { city: '' },
  tags: ['ok', ''],
})

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  vi.restoreAllMocks()
})
function owned<T>(fn: () => T): T {
  return createRoot((dispose) => {
    roots.push(dispose)
    return fn()
  })
}
function recorder<I>(run?: (input: I) => unknown) {
  const inputs: I[] = []
  const save = mutation({
    run: (input: I) => {
      inputs.push(input)
      return run ? run(input) : input
    },
  })
  return { inputs, save }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}
/** A hand-written schema with full control over results and timing. */
function manual<T>(
  validate: StandardSchemaV1<T>['~standard']['validate'],
): StandardSchemaV1<T> {
  return { '~standard': { version: 1, vendor: 'test', validate } }
}

const libraries = {
  zod: z.object({
    name: z.string().min(2, 'Name is too short.'),
    email: z.email('Email is invalid.'),
    address: z.object({ city: z.string().min(1, 'City is required.') }),
    tags: z.array(z.string().min(1, 'Tag is empty.')),
  }),
  valibot: v.object({
    name: v.pipe(v.string(), v.minLength(2, 'Name is too short.')),
    email: v.pipe(v.string(), v.email('Email is invalid.')),
    address: v.object({
      city: v.pipe(v.string(), v.minLength(1, 'City is required.')),
    }),
    tags: v.array(v.pipe(v.string(), v.minLength(1, 'Tag is empty.'))),
  }),
  arktype: type({
    name: 'string >= 2',
    email: 'string.email',
    address: { city: 'string >= 1' },
    tags: 'string >= 1 []',
  }),
}

describe.each(Object.entries(libraries))('%s schemas', (_, schema) => {
  it('block invalid input and map nested and array issues to fields', async () => {
    const { inputs, save } = recorder<Signup>()
    const form = owned(
      formModel({ initial: blank, schema, save, message: () => 'x' }),
    )
    const fields = {
      name: form.field('name'),
      email: form.field('email'),
      city: form.field('address.city'),
      tag: form.field('tags.1'),
      first: form.field('tags.0'),
    }
    await expect(form.submit()).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(inputs).toEqual([])
    expect(form.issues().map((i) => i.path)).toEqual(
      expect.arrayContaining(['name', 'email', 'address.city', 'tags.1']),
    )
    expect(fields.name.invalid()).toBe(true)
    expect(fields.email.error()).toEqual(expect.any(String))
    expect(fields.city.invalid()).toBe(true)
    expect(fields.tag.invalid()).toBe(true)
    expect(fields.first.invalid()).toBe(false)
    expect(form.error()).toBeUndefined()

    fields.name.set('Ada')
    fields.email.set('ada@example.com')
    fields.city.set('London')
    fields.tag.set('math')
    expect(form.issues()).toEqual([])
    await expect(form.submit()).resolves.toMatchObject({ ok: true })
    expect(inputs).toEqual([
      {
        name: 'Ada',
        email: 'ada@example.com',
        address: { city: 'London' },
        tags: ['ok', 'math'],
      },
    ])
  })
})

describe('validation timing', () => {
  const schema = libraries.zod

  it("does not validate before the first submit in 'submit' mode", () => {
    const form = owned(
      formModel({ initial: blank, schema, save: recorder<Signup>().save }),
    )
    const name = form.field('name')
    name.set('A')
    name.blur()
    expect(form.issues()).toEqual([])
    expect(name.error()).toBeUndefined()
  })

  it('revalidates on every change after a failed submit, in the same call', async () => {
    const form = owned(
      formModel({ initial: blank, schema, save: recorder<Signup>().save }),
    )
    const name = form.field('name')
    await form.submit()
    expect(name.error()).toBe('Name is too short.')
    name.set('Ad')
    expect(name.error()).toBeUndefined()
    name.set('A')
    expect(name.error()).toBe('Name is too short.')
  })

  it("validates on blur in 'blur' mode and shows errors for touched fields only", () => {
    const form = owned(
      formModel({
        initial: blank,
        schema,
        save: recorder<Signup>().save,
        validate: 'blur',
      }),
    )
    const name = form.field('name')
    const email = form.field('email')
    name.set('A')
    expect(form.issues()).toEqual([])
    name.blur()
    expect(name.error()).toBe('Name is too short.')
    expect(form.issues().some((i) => i.path === 'email')).toBe(true)
    expect(email.error()).toBeUndefined()
  })

  it("validates and shows errors on every change in 'change' mode", () => {
    const form = owned(
      formModel({
        initial: blank,
        schema,
        save: recorder<Signup>().save,
        validate: 'change',
      }),
    )
    const name = form.field('name')
    const email = form.field('email')
    name.set('A')
    expect(name.touched()).toBe(true)
    expect(name.error()).toBe('Name is too short.')
    expect(email.error()).toBeUndefined()
    name.set('Ada')
    expect(name.error()).toBeUndefined()
  })

  it('clears issues and the attempt after a successful save, and on reset', async () => {
    const form = owned(
      formModel({ initial: blank, schema, save: recorder<Signup>().save }),
    )
    const name = form.field('name')
    await form.submit()
    expect(name.invalid()).toBe(true)
    form.reset()
    expect(form.issues()).toEqual([])
    expect(name.invalid()).toBe(false)
    // After reset, editing does not validate until the next submit.
    name.set('A')
    expect(form.issues()).toEqual([])
  })
})

describe('async validation', () => {
  it('drops a result superseded by a newer edit and tracks validating()', async () => {
    const pending: Array<{
      value: { name: string }
      done: ReturnType<typeof deferred<{ issues: StandardIssue[] }>>
    }> = []
    const schema = manual<{ name: string }>((value) => {
      const done = deferred<{ issues: StandardIssue[] }>()
      pending.push({ value: value as { name: string }, done })
      return done.promise
    })
    const form = owned(
      formModel({
        initial: () => ({ name: '' }),
        schema,
        save: recorder<{ name: string }>().save,
        validate: 'change',
      }),
    )
    const name = form.field('name')
    name.set('a')
    name.set('ab')
    expect(form.validating()).toBe(true)
    pending[1]?.done.resolve({ issues: [] })
    await Promise.resolve()
    await Promise.resolve()
    expect(form.validating()).toBe(false)
    pending[0]?.done.resolve({
      issues: [{ message: 'stale', path: ['name'] }],
    })
    await new Promise((done) => setTimeout(done, 0))
    expect(form.issues()).toEqual([])
    expect(name.error()).toBeUndefined()
  })

  it('makes submit wait for the async result', async () => {
    const gate = deferred<undefined>()
    const schema = manual<{ name: string }>(async (value) => {
      await gate.promise
      return { value: value as { name: string } }
    })
    const { inputs, save } = recorder<{ name: string }>()
    const form = owned(
      formModel({ initial: () => ({ name: 'x' }), schema, save }),
    )
    const result = form.submit()
    expect(form.submitting()).toBe(true)
    expect(form.validating()).toBe(true)
    await Promise.resolve()
    expect(inputs).toEqual([])
    gate.resolve(undefined)
    await expect(result).resolves.toMatchObject({ ok: true })
    expect(inputs).toEqual([{ name: 'x' }])
  })

  it('turns a throwing or rejecting validator into a root issue', async () => {
    for (const validate of [
      () => {
        throw new Error('Validator crashed.')
      },
      () => Promise.reject(new Error('Validator crashed.')),
    ]) {
      const form = owned(
        formModel({
          initial: () => ({ name: 'x' }),
          schema: manual<{ name: string }>(validate),
          save: recorder<{ name: string }>().save,
        }),
      )
      await expect(form.submit()).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      })
      expect(form.error()).toBe('Validator crashed.')
      expect(form.issues()).toEqual([
        { path: '', message: 'Validator crashed.' },
      ])
    }
  })
})

describe('issue mapping', () => {
  const issuesOf = (issues: StandardIssue[]) =>
    manual<{ profile: { name: string; city: string } }>(() => ({ issues }))

  it('normalizes segment objects, maps to the nearest field, and falls back to the root', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const symbol = Symbol('hidden')
    const form = owned(
      formModel({
        initial: () => ({ profile: { name: '', city: '' } }),
        schema: issuesOf([
          {
            message: 'Name issue',
            path: [{ key: 'profile' }, { key: 'name' }],
          },
          { message: 'Deep issue', path: ['profile', 'city', 'line'] },
          { message: 'Unknown field', path: ['other'] },
          { message: 'Symbol path', path: [symbol] },
          { message: 'Root issue' },
        ]),
        save: recorder<{ profile: { name: string; city: string } }>().save,
      }),
    )
    const name = form.field('profile.name')
    const city = form.field('profile.city')
    await form.submit()
    expect(form.issues()).toEqual([
      { path: 'profile.name', message: 'Name issue' },
      { path: 'profile.city.line', message: 'Deep issue' },
      { path: 'other', message: 'Unknown field' },
      { path: '', message: 'Symbol path' },
      { path: '', message: 'Root issue' },
    ])
    expect(name.error()).toBe('Name issue')
    expect(city.error()).toBe('Deep issue')
    expect(form.error()).toBe('Unknown field')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('"other"')
    await form.submit()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('shows a root issue before the save error', async () => {
    const form = owned(
      formModel({
        initial: () => ({ profile: { name: '', city: '' } }),
        schema: issuesOf([{ message: 'Fix the form.' }]),
        save: recorder<{ profile: { name: string; city: string } }>().save,
      }),
    )
    expect(form.error()).toBeUndefined()
    await form.submit()
    expect(form.error()).toBe('Fix the form.')
  })
})

describe('outputs and server issues', () => {
  it('passes the schema output, not the input, to the mutation', async () => {
    const schema = z.object({
      age: z.coerce.number().int(),
      name: z.string().transform((name) => name.trim()),
    })
    const { inputs, save } = recorder<{ age: number; name: string }>()
    const form = owned(
      formModel({
        initial: () => ({ age: '42', name: ' Ada ' }),
        schema,
        save,
      }),
    )
    await form.submit()
    expect(inputs).toEqual([{ age: 42, name: 'Ada' }])
  })

  it('maps a mutation error that carries Standard Schema issues to fields', async () => {
    const { save } = recorder<{ name: string }>(() => {
      throw Object.assign(new Error('Unprocessable'), {
        status: 422,
        issues: [{ message: 'Name is taken.', path: ['name'] }],
      })
    })
    const form = owned(
      formModel({
        initial: () => ({ name: 'Ada' }),
        schema: libraries.zod.pick({ name: true }),
        save,
      }),
    )
    const name = form.field('name')
    await expect(form.submit()).resolves.toMatchObject({
      ok: false,
      reason: 'failed',
    })
    expect(name.error()).toBe('Name is taken.')
    expect(form.error()).toBeUndefined()
    // The next edit revalidates with the schema and replaces the server issue.
    name.set('Grace')
    expect(name.error()).toBeUndefined()
  })

  it('keeps a plain mutation error as the form error', async () => {
    const { save } = recorder<{ name: string }>(() => {
      throw Object.assign(new Error('Server down.'), { issues: 'not a list' })
    })
    const form = owned(
      formModel({
        initial: () => ({ name: 'Ada' }),
        schema: libraries.zod.pick({ name: true }),
        save,
      }),
    )
    await form.submit()
    expect(form.error()).toBe('Server down.')
  })
})

describe('issues follow the record', () => {
  it('hides issues and the submit attempt after the source changes record', async () => {
    const record = signal({ name: '' })
    const form = owned(
      formModel({
        source: () => record(),
        from: (data: { name: string }) => data,
        schema: libraries.zod.pick({ name: true }),
        save: recorder<{ name: string }>().save,
      }),
    )
    const name = form.field('name')
    await form.submit()
    expect(name.error()).toBe('Name is too short.')
    record.set({ name: '' })
    expect(form.issues()).toEqual([])
    expect(name.error()).toBeUndefined()
    name.set('A')
    // No submit has been attempted for this record, so editing does not validate.
    expect(form.issues()).toEqual([])
  })
})
