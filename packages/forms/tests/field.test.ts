// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { jsx, render } from '@benosjs/dom'
import type { Child, JSX } from '@benosjs/dom'
import { mutation } from '@benosjs/query'
import { z } from 'zod'
import { checked, choice, formModel, select } from '../src/index.js'
import type { Form } from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})

/** Stand-ins with the registry controls' prop shapes. */
function TextInput(props: {
  id?: string
  name?: string
  value?: string
  invalid?: boolean
  placeholder?: string
  'aria-describedby'?: string | undefined
  onInput?: (event: { currentTarget: { value: string } }) => void
  onBlur?: () => void
}): JSX.Element {
  return jsx('input', {
    get id() {
      return props.id
    },
    get name() {
      return props.name
    },
    get value() {
      return props.value
    },
    get placeholder() {
      return props.placeholder
    },
    get 'aria-invalid'() {
      return props.invalid ? 'true' : 'false'
    },
    get 'aria-describedby'() {
      return props['aria-describedby']
    },
    onInput: (event: Event) =>
      props.onInput?.(event as unknown as { currentTarget: { value: string } }),
    onBlur: () => props.onBlur?.(),
  })
}
function Toggle(props: {
  id?: string
  checked?: boolean
  invalid?: boolean
  children?: Child
  onCheckedChange?: (details: { checked: boolean | 'indeterminate' }) => void
}): JSX.Element {
  return jsx('button', {
    type: 'button',
    get id() {
      return props.id
    },
    get 'aria-pressed'() {
      return String(props.checked)
    },
    onClick: () => props.onCheckedChange?.({ checked: !props.checked }),
    get children() {
      return props.children
    },
  })
}
function Radios(props: {
  id?: string
  label: string
  value?: string | null
  onValueChange?: (details: { value: string | null }) => void
}): JSX.Element {
  return jsx('div', {
    get id() {
      return props.id
    },
    get 'data-label'() {
      return props.label
    },
    get 'data-value'() {
      return props.value ?? ''
    },
    children: jsx('button', {
      type: 'button',
      onClick: () => props.onValueChange?.({ value: 'b' }),
      children: 'pick b',
    }),
  })
}
function Picker(props: {
  id?: string
  label: string
  value?: string[]
  onValueChange?: (details: { value: string[] }) => void
}): JSX.Element {
  return jsx('div', {
    get id() {
      return props.id
    },
    get 'data-value'() {
      return (props.value ?? []).join(',')
    },
    children: jsx('button', {
      type: 'button',
      onClick: () => props.onValueChange?.({ value: ['x'] }),
      children: 'pick x',
    }),
  })
}

const schema = z.object({
  name: z.string().min(2, 'Name is too short.'),
  email: z.email('Email is invalid.'),
  archived: z.boolean(),
  tier: z.string().nullable(),
  region: z.string().nullable(),
})
type Values = z.input<typeof schema>

function mount(view: (form: Form<Values, Values, Values>) => Child) {
  const save = mutation({ run: (values: Values) => values })
  const model = formModel({
    initial: (): Values => ({
      name: '',
      email: '',
      archived: false,
      tier: null,
      region: 'eu',
    }),
    schema,
    save,
  })
  let form!: Form<Values, Values, Values>
  roots.push(
    render(() => {
      form = model()
      return jsx('form', {
        onSubmit: (event: Event) => void form.submit(event),
        children: view(form),
      })
    }, document.body),
  )
  return form
}
const $ = <T extends Element>(selector: string) => {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`missing ${selector}`)
  return el
}
const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('<form.Field>', () => {
  it('wires the label, id, name, value, description, and error', async () => {
    const form = mount((form) =>
      jsx(form.Field, {
        name: 'name',
        component: TextInput,
        label: 'Name',
        description: 'Shown on invoices.',
        placeholder: 'Ada',
      }),
    )
    const field = $('.benos-field')
    const label = $<HTMLLabelElement>('label')
    const input = $<HTMLInputElement>('input')
    const id = form.field('name').id
    expect(label.textContent).toBe('Name')
    expect(label.getAttribute('for')).toBe(id)
    expect(input.id).toBe(id)
    expect(input.name).toBe('name')
    expect(input.placeholder).toBe('Ada')
    expect(input.getAttribute('aria-describedby')).toBe(`${id}-description`)
    expect($(`#${id}-description`).textContent).toBe('Shown on invoices.')
    expect(document.querySelector('.benos-field-error')).toBeNull()
    expect(field.dataset.invalid).toBe('false')

    await form.submit()
    const error = $(`#${id}-error`)
    expect(error.textContent).toBe('Name is too short.')
    expect(error.getAttribute('role')).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(
      `${id}-description ${id}-error`,
    )
    expect(field.dataset.invalid).toBe('true')

    type(input, 'Ada')
    expect(form.field('name').value()).toBe('Ada')
    expect(document.querySelector('.benos-field-error')).toBeNull()
    expect(input.getAttribute('aria-describedby')).toBe(`${id}-description`)
  })

  it('merges a user aria-describedby and marks the field touched on blur', () => {
    const form = mount((form) => [
      jsx('p', { id: 'hint', children: 'Hint' }),
      jsx(form.Field, {
        name: 'email',
        component: TextInput,
        label: 'Email',
        'aria-describedby': 'hint',
      }),
    ])
    const input = $<HTMLInputElement>('input')
    expect(input.getAttribute('aria-describedby')).toBe('hint')
    input.dispatchEvent(new Event('blur'))
    expect(form.field('email').touched()).toBe(true)
  })

  it('focuses the first invalid field in JSX order after a failed submit', async () => {
    const form = mount((form) => [
      jsx(form.Field, { name: 'name', component: TextInput, label: 'Name' }),
      jsx(form.Field, { name: 'email', component: TextInput, label: 'Email' }),
    ])
    const [name, email] = document.querySelectorAll('input')
    form.field('name').set('Ada')
    await form.submit()
    expect(document.activeElement).toBe(email)
    expect(document.activeElement).not.toBe(name)
  })

  it('gives each form instance its own ids', () => {
    const first = mount((form) =>
      jsx(form.Field, { name: 'name', component: TextInput, label: 'Name' }),
    )
    const second = mount((form) =>
      jsx(form.Field, { name: 'name', component: TextInput, label: 'Name' }),
    )
    expect(first.field('name').id).not.toBe(second.field('name').id)
    expect(
      new Set([...document.querySelectorAll('input')].map((i) => i.id)).size,
    ).toBe(2)
  })
})

describe('adapters', () => {
  it('checked: binds a boolean and puts the label in the control', () => {
    const form = mount((form) =>
      jsx(form.Field, {
        name: 'archived',
        component: Toggle,
        bind: checked,
        label: 'Archived',
      }),
    )
    const button = $<HTMLButtonElement>('button')
    expect(document.querySelector('label')).toBeNull()
    expect(button.textContent).toBe('Archived')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    button.click()
    expect(form.field('archived').value()).toBe(true)
    expect(form.field('archived').touched()).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('choice: binds a string or null through a label prop', () => {
    const form = mount((form) =>
      jsx(form.Field, {
        name: 'tier',
        component: Radios,
        bind: choice,
        label: 'Tier',
      }),
    )
    const root = $<HTMLDivElement>('.benos-field > div')
    expect(root.dataset.label).toBe('Tier')
    expect(root.dataset.value).toBe('')
    $<HTMLButtonElement>('button').click()
    expect(form.field('tier').value()).toBe('b')
    expect(root.dataset.value).toBe('b')
  })

  it('select: maps a single value to and from a one-item array', () => {
    const form = mount((form) =>
      jsx(form.Field, {
        name: 'region',
        component: Picker,
        bind: select,
        label: 'Region',
      }),
    )
    const root = $<HTMLDivElement>('.benos-field > div')
    expect(root.dataset.value).toBe('eu')
    $<HTMLButtonElement>('button').click()
    expect(form.field('region').value()).toBe('x')
    expect(root.dataset.value).toBe('x')
  })
})
