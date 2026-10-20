import { batch, computed, onCleanup, signal, untrack } from '@benosjs/core'
import type { ReadonlySignal, Signal } from '@benosjs/core'
import type { Mutation } from '@benosjs/query'

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
}

export type FormSubmitResult<O> =
  | { ok: true; value: O }
  | { ok: false; reason: 'busy' | 'invalid' | 'no-source' }
  | { ok: false; reason: 'failed'; error: unknown; cancelled: boolean }

export interface Form<In, Out, O, M extends boolean = false> {
  /** Validates and saves; never rejects. Pass it to `onSubmit`. */
  submit(event?: Event): Promise<FormSubmitResult<O>>
  field<N extends FieldPath<In>>(name: N): FieldHandle<PathValue<In, N>, M>
  /** Server values with the current edits applied. */
  values: ReadonlySignal<Value<In, M>>
  dirty: ReadonlySignal<boolean>
  remoteChanged: ReadonlySignal<boolean>
  submitting: ReadonlySignal<boolean>
  /** The last save failure for the current record. */
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
}
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
  save: Mutation<unknown, unknown>
  message?: (error: unknown) => string
  route?: RouteSource<object, unknown>
  source?: () => unknown
  from?(data: unknown): unknown
  initial?: () => unknown
  input?(values: unknown, context: { params: object | undefined }): unknown
}): () => unknown {
  return (): AnyForm => {
    const handle = o.save()
    const match = o.route?.match()
    const read = match ? match.data : (o.source ?? (() => o))
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
    const current = (r: Rec): Edit | undefined => {
      const x = r.x()
      return x && x.e === epoch() ? x : undefined
    }

    const field = (name: string): Handle => {
      const known = fields.get(name)
      if (known) return known.h
      const path = name.split('.')
      const remote = () => get(server(), path)
      const dirty = () => {
        const x = current(r)
        return !!x && !equal(x.v, remote())
      }
      const r: Rec = {
        p: path,
        s: false,
        x: signal<Edit | undefined>(undefined),
        t: signal<unknown>(undefined),
        h: {
          name,
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
            }),
          blur: () => untrack(() => r.t.set(epoch())),
          dirty,
          touched: () => {
            const t = r.t()
            return t !== undefined && t === epoch()
          },
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
    const mine = () => {
      const s = submission()
      return s && s.e === epoch() ? s : undefined
    }
    const clear = (r: Rec | undefined) => r?.x.set(undefined)

    return {
      field,
      values,
      dirty: () => each().some((r) => r.h.dirty()),
      remoteChanged: () => each().some((r) => r.h.remoteChanged()),
      submitting: () => !!mine()?.p,
      error: () => {
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
          submission.set(token)
          const finish = (next: Submission, saved: boolean) => {
            if (disposed || submission() !== token) return
            batch(() => {
              if (saved && epoch() === e)
                fields.forEach((r) => {
                  const x = current(r)
                  if (x && equal(x.v, get(snapshot, r.p))) clear(r)
                  r.t.set(undefined)
                })
              submission.set(next)
            })
          }
          const fail = (error: unknown, cancelled: boolean) => {
            finish({ e, p: false, f: { error } }, false)
            return { ok: false, reason: 'failed', error, cancelled } as const
          }
          // F3 validates the snapshot here; until then it passes through.
          return Promise.resolve(snapshot)
            .then((output) =>
              handle.run(
                o.input
                  ? o.input(output, { params })
                  : match
                    ? { ...params, values: output }
                    : output,
              ),
            )
            .then(
              (result) => {
                if (!result.ok) return fail(result.error, result.cancelled)
                finish({ e, p: false }, true)
                return { ok: true, value: result.value } as const
              },
              (error: unknown) => fail(error, false),
            )
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
interface AnyForm {
  submit(event?: Event): Promise<FormSubmitResult<unknown>>
  field(name: string): Handle
  values: ReadonlySignal<unknown>
  dirty: ReadonlySignal<boolean>
  remoteChanged: ReadonlySignal<boolean>
  submitting: ReadonlySignal<boolean>
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

const NO_SOURCE = { ok: false, reason: 'no-source' } as const
const BUSY = { ok: false, reason: 'busy' } as const

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

const message = (error: unknown): string => {
  const text = (error as { message?: unknown } | null | undefined)?.message
  return typeof text === 'string' && text ? text : 'Could not save.'
}
