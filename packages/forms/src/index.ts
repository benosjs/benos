import {
  batch,
  computed,
  createUniqueId,
  onCleanup,
  signal,
  untrack,
} from '@benosjs/core'
import type { ReadonlySignal, Signal } from '@benosjs/core'
import { jsx, mergeProps, Show, splitProps } from '@benosjs/dom'
import type { Child, Component, JSX } from '@benosjs/dom'
import type { Mutation } from '@benosjs/query'
import { blockNavigation } from '@benosjs/router'

const development = process.env.NODE_ENV !== 'production'

/** Standard Schema v1 (https://standardschema.dev), vendored as types. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>
}
export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown,
  ) => StandardResult<Output> | Promise<StandardResult<Output>>
  readonly types?: StandardTypes<Input, Output> | undefined
}
export interface StandardTypes<Input = unknown, Output = Input> {
  readonly input: Input
  readonly output: Output
}
export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly StandardIssue[] }
export interface StandardIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | StandardPathSegment)[] | undefined
}
export interface StandardPathSegment {
  readonly key: PropertyKey
}
export type InferInput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['input']
export type InferOutput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['output']

type Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7]
type Leaf =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | ((...args: never[]) => unknown)
type Branch<V, D extends number, Prefix extends string> =
  NonNullable<V> extends Leaf
    ? never
    : `${Prefix}.${FieldPath<NonNullable<V>, D>}`

/** Dotted paths of a form's values, up to eight levels deep. */
export type FieldPath<T, D extends number = 8> = [D] extends [never]
  ? never
  : T extends Leaf
    ? never
    : T extends readonly (infer E)[]
      ? `${number}` | Branch<E, Depth[D], `${number}`>
      : {
          [K in keyof T & string]-?: K | Branch<T[K], Depth[D], K>
        }[keyof T & string]

type Step<T, K extends string> = T extends readonly (infer E)[]
  ? K extends `${number}`
    ? E
    : undefined
  : K extends keyof T
    ? T[K]
    : undefined
/** The value type at a dotted path. */
export type PathValue<T, P extends string> = P extends `${infer H}.${infer R}`
  ? PathValue<Step<T, H>, R>
  : Step<T, P>

/** The data a source carries: a query entry's value, or the data itself. */
export type SourceData<D> = D extends {
  readonly value: () => infer T
  readonly refresh: () => unknown
}
  ? T
  : D

type Value<V, M extends boolean> = M extends true ? V | undefined : V

export interface FieldHandle<V, M extends boolean = false> {
  readonly name: string
  /** The id `<form.Field>` gives the control: the form's prefix and the path. */
  readonly id: string
  readonly errorId: string
  /** The error id while an error is visible, for `aria-describedby`. */
  describedBy: ReadonlySignal<string | undefined>
  /** The edit for the current record, or the server value when there is none. */
  value: ReadonlySignal<Value<V, M>>
  set(value: V): void
  /** Marks the field touched. */
  blur(): void
  dirty: ReadonlySignal<boolean>
  touched: ReadonlySignal<boolean>
  /** The latest server value at this path. */
  remote: ReadonlySignal<Value<V, M>>
  /** The server changed this field after the user started editing it. */
  remoteChanged: ReadonlySignal<boolean>
  /** The first issue message, once the field is touched or a submit was attempted. */
  error: ReadonlySignal<string | undefined>
  invalid: ReadonlySignal<boolean>
}

/** A validation issue with its path normalized to a dotted string; '' is the root. */
export interface FormIssue {
  readonly path: string
  readonly message: string
}

export type FormSubmitResult<O> =
  | { ok: true; value: O }
  | { ok: false; reason: 'busy' | 'invalid' | 'no-source' }
  | { ok: false; reason: 'failed'; error: unknown; cancelled: boolean }

/** Props `<form.Field>` sets on every control. */
export interface FieldControl {
  id: string
  name: string
  invalid: boolean
  'aria-describedby'?: string
}
/** Binds a field to a kind of control. */
export interface FieldAdapter<V, A extends object> {
  /** Where the label goes: a `<label>` element when omitted, else the control's children or `label` prop. */
  readonly label?: 'children' | 'prop'
  props(field: FieldHandle<V, boolean>): A
}
export interface TextControl {
  value: string
  onInput(event: { currentTarget: { value: string } }): void
  onBlur(): void
}
export interface CheckedControl {
  checked: boolean
  onCheckedChange(details: { checked: boolean | 'indeterminate' }): void
  children: string
}
export interface ChoiceControl {
  value: string | null
  onValueChange(details: { value: string | null }): void
  label: string
}
export interface SelectControl {
  value: string[]
  onValueChange(details: { value: string[] }): void
  label: string
}

type FieldOwnProps<N, V, A extends object> = {
  name: N
  label: string
  description?: string
  bind?: FieldAdapter<V, A>
  'aria-describedby'?: string
}
type Rest<P, A> = Omit<
  P,
  keyof A | keyof FieldControl | 'label' | 'children' | 'component'
>
/** The default `text` adapter needs a string field; others must be passed. */
type NeedsBind<V, A extends object> = [A] extends [TextControl]
  ? [V] extends [string]
    ? unknown
    : { bind: FieldAdapter<V, A> }
  : unknown
/** The component must accept the controlled props. */
type Accepts<P, A> = [Rest<P, A> & A & FieldControl] extends [P]
  ? unknown
  : { component: never }

/** Renders a label, the control, an optional description, and the field error. */
export type FieldComponent<In> = <
  N extends FieldPath<In>,
  P extends object,
  A extends object = TextControl,
>(
  props: FieldOwnProps<N, PathValue<In, N>, A> & {
    component: (props: P) => Child
  } & Rest<P, A> &
    NeedsBind<PathValue<In, N>, A> &
    Accepts<P, A>,
) => JSX.Element

export interface Form<In, Out, O, M extends boolean = false> {
  /** Validates and saves; never rejects. Pass it to `onSubmit`. */
  submit(event?: Event): Promise<FormSubmitResult<O>>
  Field: FieldComponent<In>
  field<N extends FieldPath<In>>(name: N): FieldHandle<PathValue<In, N>, M>
  /** Server values with the current edits applied. */
  values: ReadonlySignal<Value<In, M>>
  dirty: ReadonlySignal<boolean>
  remoteChanged: ReadonlySignal<boolean>
  submitting: ReadonlySignal<boolean>
  /** True while an async validation is running. */
  validating: ReadonlySignal<boolean>
  /** Every issue of the latest validation for the current record. */
  issues: ReadonlySignal<readonly FormIssue[]>
  /** The first root issue after a submit attempt, or else the last save failure. */
  error: ReadonlySignal<string | undefined>
  /** Drops the edit of one field, or of every field, in favor of the server value. */
  acceptRemote(name?: FieldPath<In>): void
  reset(): void
  /** Phantom: the validated output type that reaches the mutation. */
  readonly '~output'?: Out
}

export type FormModel<In, Out, O, M extends boolean = false> = () => Form<
  In,
  Out,
  O,
  M
>

interface Common<S extends StandardSchemaV1, I, O> {
  schema: S
  save: Mutation<I, O>
  /** Text for `form.error()` after a failed save. */
  message?: (error: unknown) => string
  /** When to validate before the first submit; afterwards every change validates. */
  validate?: 'submit' | 'blur' | 'change'
}
/**
 * What a route-bound form does when the user navigates away with unsaved
 * changes: ask with `window.confirm` (the default), let the edits go, or ask
 * through an app dialog that resolves true to leave.
 */
export type LeavePolicy =
  | 'confirm'
  | 'discard'
  | ((destination: { location: string }) => boolean | Promise<boolean>)
interface RouteSource<P, D> {
  match(): { params: ReadonlySignal<P>; data: ReadonlySignal<D> }
}
type InputOption<Default, Out, I, C> = [Default] extends [I]
  ? { input?: (values: Out, context: C) => I }
  : { input: (values: Out, context: C) => I }

/** A form bound to a route: it follows the committed `match.data()`. */
export function formModel<
  S extends StandardSchemaV1,
  P extends object,
  D,
  I,
  O,
>(
  options: Common<S, I, O> & {
    route: RouteSource<P, D>
    from: (data: SourceData<D>) => InferInput<S>
    leave?: LeavePolicy
  } & InputOption<
      P & { values: InferOutput<S> },
      InferOutput<S>,
      I,
      { params: P }
    >,
): FormModel<InferInput<S>, InferOutput<S>, O>
/** A form bound to a tracked source; a missing value means no record yet. */
export function formModel<S extends StandardSchemaV1, D, I, O>(
  options: Common<S, I, O> & {
    source: () => D | false | null | undefined
    from: (data: SourceData<D>) => InferInput<S>
  } & InputOption<InferOutput<S>, InferOutput<S>, I, { params: undefined }>,
): FormModel<InferInput<S>, InferOutput<S>, O, true>
/** A create form whose identity never changes. */
export function formModel<S extends StandardSchemaV1, I, O>(
  options: Common<S, I, O> & {
    initial: () => InferInput<S>
  } & InputOption<InferOutput<S>, InferOutput<S>, I, { params: undefined }>,
): FormModel<InferInput<S>, InferOutput<S>, O>
export function formModel(o: {
  schema: StandardSchemaV1
  save: Mutation<unknown, unknown>
  message?: (error: unknown) => string
  validate?: 'submit' | 'blur' | 'change'
  route?: RouteSource<object, unknown>
  leave?: LeavePolicy
  source?: () => unknown
  from?(data: unknown): unknown
  initial?: () => unknown
  input?(values: unknown, context: { params: object | undefined }): unknown
}): () => unknown {
  return (): AnyForm => {
    const handle = o.save()
    const match = o.route?.match()
    const read = match ? match.data : (o.source ?? (() => o))
    // Hydration-stable: under a server or hydrating root this is path based.
    const prefix = `${createUniqueId()}-`
    let disposed = false
    onCleanup(() => (disposed = true))

    /**
     * A fresh token each time the record's identity changes, so A → B → A
     * does not bring back A's earlier edits; undefined while there is none.
     */
    let last: { d: unknown } | undefined
    const epoch = computed(() => {
      const d = read()
      return d === false || d == null
        ? (last = undefined)
        : last?.d === d
          ? last
          : (last = { d })
    })
    /** The server values projected into form fields. */
    const server = computed(() => {
      const d = epoch()?.d
      return d === undefined
        ? undefined
        : o.initial
          ? o.initial()
          : o.from?.(isEntry(d) ? d.value() : d)
    })
    const fields = new Map<string, Rec>()
    const edited = signal(0)
    const each = (): Rec[] => (edited(), [...fields.values()])
    /** The value of a tagged signal, if it belongs to the current record. */
    const ours = <T extends { e: unknown }>(
      s: ReadonlySignal<T | undefined>,
    ): T | undefined => {
      const v = s()
      return v && v.e === epoch() ? v : undefined
    }
    /** Whether a signal holds the current record's token. */
    const now = (s: ReadonlySignal<unknown>) => {
      const v = s()
      return v !== undefined && v === epoch()
    }
    const current = (r: Rec) => ours(r.x)

    // Validation results, tagged with their record like edits.
    const report = signal<Report | undefined>(undefined)
    const attempted = signal<unknown>(undefined)
    const checking = signal<unknown>(undefined)
    let generation = 0
    const warned = new Set<string>()
    const issues = () => ours(report)?.i ?? NONE
    const tried = () => now(attempted)
    /** The field an issue belongs to: its own, the nearest ancestor with a handle, or '' for the root. */
    const owner = (path: string): string => {
      while (path && !fields.has(path))
        path = path.slice(0, Math.max(path.lastIndexOf('.'), 0))
      return path
    }
    /** Validates `value` for record `e`; only the latest run may write issues. */
    const check = (
      e: unknown,
      value: unknown,
    ): StandardResult<unknown> | Promise<StandardResult<unknown>> => {
      const g = ++generation
      const apply = (result: StandardResult<unknown>) => {
        if (g === generation && !disposed) {
          const list = result.issues ? result.issues.map(issue) : NONE
          if (development)
            for (const { path } of list)
              if (path && !owner(path) && !warned.has(path)) {
                warned.add(path)
                console.warn(
                  `Form issue at "${path}" has no field; it is shown as a form error.`,
                )
              }
          batch(() => {
            report.set({ e, i: list })
            checking.set(undefined)
          })
        }
        return result
      }
      let result: StandardResult<unknown> | Promise<StandardResult<unknown>>
      try {
        result = o.schema['~standard'].validate(value)
      } catch (error) {
        result = invalid(error)
      }
      if (!('then' in result)) return apply(result)
      checking.set(e)
      return result.then(apply, (error: unknown) => apply(invalid(error)))
    }
    const revalidate = (e: unknown) => void check(e, values())

    const field = (name: string): Handle => {
      const known = fields.get(name)
      if (known) return known.h
      const path = name.split('.')
      const remote = () => get(server(), path)
      const dirty = () => {
        const x = current(r)
        return !!x && !equal(x.v, remote())
      }
      const touched = () => now(r.t)
      const error = () =>
        touched() || tried()
          ? issues().find((i) => owner(i.path) === name)?.message
          : undefined
      const id = prefix + name.replace(/\./g, '-')
      const r: Rec = {
        p: path,
        s: false,
        x: signal<Edit | undefined>(undefined),
        t: signal<unknown>(undefined),
        h: {
          name,
          id,
          errorId: id + '-error',
          describedBy: () => (error() ? id + '-error' : undefined),
          value: () => {
            const x = current(r)
            return x ? x.v : remote()
          },
          set: (v) =>
            untrack(() => {
              const e = epoch()
              if (e === undefined) return
              const x = current(r)
              batch(() => {
                if (!r.s) {
                  r.s = true
                  edited.update((n) => n + 1)
                }
                r.x.set(
                  equal(v, remote())
                    ? undefined
                    : { e, v, b: x ? x.b : remote() },
                )
              })
              // In 'change' mode an edit counts as touching the field, so its error shows at once.
              if (o.validate === 'change') r.t.set(e)
              if (o.validate === 'change' || tried()) revalidate(e)
            }),
          blur: () =>
            untrack(() => {
              const e = epoch()
              r.t.set(e)
              if (e !== undefined && o.validate === 'blur') revalidate(e)
            }),
          dirty,
          touched,
          error,
          invalid: () => !!error(),
          remote,
          remoteChanged: () => {
            const x = current(r)
            return !!x && dirty() && !equal(remote(), x.b)
          },
        },
      }
      fields.set(name, r)
      return r.h
    }

    const values = computed(() => {
      let out = server()
      for (const r of each()) {
        const x = current(r)
        if (x) out = put(out, r.p, 0, x.v)
      }
      return out
    })
    const submission = signal<Submission | undefined>(undefined)
    const mine = () => ours(submission)
    const dirty = () => each().some((r) => r.h.dirty())
    const submitting = () => !!mine()?.p
    const leave = o.leave ?? 'confirm'
    if (match && leave !== 'discard')
      blockNavigation({
        when: () => dirty() && !submitting(),
        confirm:
          leave === 'confirm'
            ? () => confirm('Discard unsaved changes?')
            : leave,
      })
    const clear = (r: Rec | undefined) => r?.x.set(undefined)
    /**
     * Moves focus to the first invalid control. Fields register in setup
     * order, which is their JSX order; headless fields without an element are skipped.
     */
    const focusFirst = () => {
      for (const { h } of fields.values()) {
        const el =
          h.invalid() && typeof document === 'object'
            ? document.getElementById(h.id)
            : null
        if (el)
          return (
            (el.matches(FOCUSABLE)
              ? el
              : el.querySelector(FOCUSABLE)) as HTMLElement | null
          )?.focus()
      }
    }
    return {
      Field: (props) => FieldView(field, props),
      field,
      values,
      dirty,
      remoteChanged: () => each().some((r) => r.h.remoteChanged()),
      submitting,
      validating: () => now(checking),
      issues,
      error: () => {
        const root = tried() && issues().find((i) => !owner(i.path))
        if (root) return root.message
        const failure = mine()?.f
        return failure && (o.message ?? message)(failure.error)
      },
      acceptRemote: (name) =>
        batch(() => {
          if (name !== undefined) clear(fields.get(name))
          else fields.forEach(clear)
        }),
      reset: () =>
        batch(() => {
          fields.forEach((r) => {
            clear(r)
            r.t.set(undefined)
          })
          generation++
          report.set(undefined)
          attempted.set(undefined)
          checking.set(undefined)
          if (!untrack(mine)?.p) submission.set(undefined)
        }),
      submit: (event) => {
        event?.preventDefault()
        return untrack((): Promise<FormSubmitResult<unknown>> => {
          const e = epoch()
          if (e === undefined) return Promise.resolve(NO_SOURCE)
          if (mine()?.p) return Promise.resolve(BUSY)
          const snapshot = values()
          const params = match?.params()
          const token: Submission = { e, p: true }
          batch(() => {
            submission.set(token)
            attempted.set(e)
          })
          const finish = (
            next: Submission,
            saved?: boolean,
            found?: Report,
          ) => {
            if (disposed || submission() !== token) return
            batch(() => {
              if (saved && epoch() === e) {
                fields.forEach((r) => {
                  const x = current(r)
                  if (x && equal(x.v, get(snapshot, r.p))) clear(r)
                  r.t.set(undefined)
                })
                attempted.set(undefined)
                report.set(undefined)
              }
              if (found) {
                generation++
                report.set(found)
              }
              submission.set(next)
            })
          }
          const fail = (error: unknown, cancelled: boolean) => {
            // A server error that carries Standard Schema issues maps to fields.
            const list = (error as { issues?: unknown } | null)?.issues
            if (
              Array.isArray(list) &&
              list.every(
                (i) => typeof (i as StandardIssue | null)?.message === 'string',
              )
            )
              finish({ e, p: false }, false, {
                e,
                i: (list as StandardIssue[]).map(issue),
              })
            else finish({ e, p: false, f: { error } })
            return { ok: false, reason: 'failed', error, cancelled } as const
          }
          return Promise.resolve(check(e, snapshot))
            .then(
              (
                checked,
              ):
                | FormSubmitResult<unknown>
                | Promise<FormSubmitResult<unknown>> => {
                if (checked.issues) {
                  finish({ e, p: false })
                  focusFirst()
                  return INVALID
                }
                const output = checked.value
                return handle
                  .run(
                    o.input
                      ? o.input(output, { params })
                      : match
                        ? { ...params, values: output }
                        : output,
                  )
                  .then((result): FormSubmitResult<unknown> => {
                    if (!result.ok) return fail(result.error, result.cancelled)
                    finish({ e, p: false }, true)
                    return { ok: true, value: result.value } as const
                  })
              },
            )
            .catch((error: unknown) => fail(error, false))
        })
      },
    }
  }
}

interface Edit {
  /** The record this edit belongs to. */
  e: unknown
  v: unknown
  /** The server value when the edit started. */
  b: unknown
}
type Handle = FieldHandle<unknown, boolean>
interface AnyFieldProps extends Record<string, unknown> {
  name: string
  label: string
  description?: string
  bind?: FieldAdapter<unknown, object>
  component: (props: object) => Child
  'aria-describedby'?: string
}
interface AnyForm {
  Field(props: AnyFieldProps): JSX.Element
  submit(event?: Event): Promise<FormSubmitResult<unknown>>
  field(name: string): Handle
  values: ReadonlySignal<unknown>
  dirty: ReadonlySignal<boolean>
  remoteChanged: ReadonlySignal<boolean>
  submitting: ReadonlySignal<boolean>
  validating: ReadonlySignal<boolean>
  issues: ReadonlySignal<readonly FormIssue[]>
  error: ReadonlySignal<string | undefined>
  acceptRemote(name?: string): void
  reset(): void
}
interface Rec {
  p: string[]
  /** Whether the field has ever been edited. */
  s: boolean
  /** The edit, tagged with its record. */
  x: Signal<Edit | undefined>
  /** The record in which the field was last touched. */
  t: Signal<unknown>
  h: Handle
}
interface Submission {
  e: unknown
  /** Whether the save is in flight. */
  p: boolean
  /** The failed save's error. */
  f?: { error: unknown }
}

const FOCUSABLE = 'input,select,textarea,button,[tabindex]'

/** `<form.Field>`: the label, the bound control, the description, and the error. */
const FieldView = (
  field: (name: string) => Handle,
  props: AnyFieldProps,
): JSX.Element => {
  const f = field(props.name)
  const bind = props.bind ?? (text as FieldAdapter<unknown, object>)
  const where = bind.label
  const id = f.id
  const description = props.description && id + '-description'
  const [, rest] = splitProps(props, [
    'name',
    'component',
    'label',
    'description',
    'bind',
    'aria-describedby',
  ])
  return jsx('div', {
    class: 'benos-field',
    get 'data-invalid'() {
      return String(f.invalid())
    },
    children: [
      !where &&
        jsx('label', { class: 'benos-label', for: id, children: props.label }),
      jsx(
        props.component,
        mergeProps(rest, bind.props(f), {
          id,
          name: props.name,
          get invalid() {
            return f.invalid()
          },
          get 'aria-describedby'() {
            return (
              [description, f.describedBy(), props['aria-describedby']]
                .filter(Boolean)
                .join(' ') || undefined
            )
          },
          [where === 'children' ? 'children' : 'label']: where && props.label,
        }),
      ),
      description &&
        jsx('p', {
          class: 'benos-field-description',
          id: description,
          children: props.description,
        }),
      jsx(Show as unknown as Component, {
        get when() {
          return f.error()
        },
        children: (message: () => string) =>
          jsx('p', {
            class: 'benos-field-error',
            id: f.errorId,
            get children() {
              return message()
            },
          }),
      }),
    ],
  })
}

/** Binds a string field to `Input` and `Textarea`. The default adapter. */
export const text: FieldAdapter<string, TextControl> = {
  props: (f) => ({
    get value() {
      return (f.value() as string | undefined) ?? ''
    },
    onInput: (event) => f.set(event.currentTarget.value),
    onBlur: f.blur,
  }),
}
/** Binds a boolean field to `Checkbox` and `Switch`; the label is their content. */
export const checked: FieldAdapter<boolean, CheckedControl> = {
  label: 'children',
  props: (f) =>
    ({
      get checked() {
        return f.value() === true
      },
      onCheckedChange: (details: { checked: boolean | 'indeterminate' }) => {
        f.set(details.checked === true)
        f.blur()
      },
    }) as CheckedControl,
}
/** Binds a `string | null` field to `RadioGroup`; the label is its `label` prop. */
export const choice: FieldAdapter<string | null, ChoiceControl> = {
  label: 'prop',
  props: (f) =>
    ({
      get value() {
        return f.value() ?? null
      },
      onValueChange: (details: { value: string | null }) => {
        f.set(details.value)
        f.blur()
      },
    }) as ChoiceControl,
}
/** Binds a `string | null` field to a single-choice `Select`; the label is its `label` prop. */
export const select: FieldAdapter<string | null, SelectControl> = {
  label: 'prop',
  props: (f) =>
    ({
      get value() {
        const v = f.value()
        return v == null ? [] : [v]
      },
      onValueChange: (details: { value: string[] }) => {
        f.set(details.value[0] ?? null)
        f.blur()
      },
    }) as SelectControl,
}

interface Report {
  e: unknown
  i: readonly FormIssue[]
}

const NO_SOURCE = { ok: false, reason: 'no-source' } as const
const BUSY = { ok: false, reason: 'busy' } as const
const INVALID = { ok: false, reason: 'invalid' } as const
const NONE: readonly FormIssue[] = []

/** Normalizes a Standard Schema issue path; a symbol segment makes it a root issue. */
const issue = (i: StandardIssue): FormIssue => {
  let path = ''
  for (const segment of i.path ?? []) {
    const key = typeof segment === 'object' ? segment.key : segment
    if (typeof key === 'symbol') {
      path = ''
      break
    }
    path += (path ? '.' : '') + String(key)
  }
  return { path, message: i.message }
}

/** A thrown or rejected validator becomes a root issue. */
const invalid = (error: unknown): StandardResult<unknown> => ({
  issues: [{ message: messageOf(error, 'Could not validate.') }],
})

const isEntry = (
  d: unknown,
): d is { value: () => unknown; refresh: () => unknown } =>
  typeof (d as { refresh?: unknown }).refresh === 'function' &&
  typeof (d as { value?: unknown }).value === 'function'

const get = (value: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (v, k) => (v == null ? undefined : (v as Record<string, unknown>)[k]),
    value,
  )

/** Sets a path in a copy, sharing every branch the path does not touch. */
const put = (
  value: unknown,
  path: readonly string[],
  i: number,
  next: unknown,
): unknown => {
  if (i === path.length) return next
  const copy = (
    Array.isArray(value) ? [...(value as unknown[])] : { ...(value as object) }
  ) as Record<string, unknown>
  const k = path[i] as string
  copy[k] = put(copy[k], path, i + 1, next)
  return copy
}

const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  Object.getPrototypeOf(v) === Object.prototype

/** `Object.is`, arrays element-wise, dates by time, plain objects one level deep. */
const equal = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => Object.is(x, b[i]))
    )
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime()
  if (!plain(a) || !plain(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => k in b && Object.is(a[k], b[k]))
  )
}

const messageOf = (error: unknown, fallback: string): string => {
  const value = (error as { message?: unknown } | null | undefined)?.message
  return typeof value === 'string' && value ? value : fallback
}
const message = (error: unknown): string => messageOf(error, 'Could not save.')
