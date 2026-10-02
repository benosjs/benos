// @vitest-environment happy-dom
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'
import { describe, expect, it } from 'vitest'
import { signal } from '../../dom/node_modules/@benosjs/core'
import { For, Show, render, type Child } from '../../dom/src/index.js'
import * as domRuntime from '../../dom/src/index.js'
import { jsx as untransformedJsx } from '../../dom/src/jsx-runtime.js'
import { jsxDEV as untransformedJsxDEV } from '../../dom/src/jsx-dev-runtime.js'
import { transformJsx } from '../src/index.js'

function evaluate(
  code: string,
  runtime: Record<string, unknown>,
  bindings: Record<string, unknown> = {},
): Record<string, unknown> {
  const importLine = code.match(
    /^import \{ ([\s\S]*?) \} from "@benosjs\/dom\/internal";\n/m,
  )
  const importBindings = importLine
    ? (importLine[1] ?? '')
        .split(', ')
        .map((item) => {
          const [exported, local] = item.split(' as ')
          return `${exported}: ${local ?? exported}`
        })
        .join(', ')
    : ''
  const body = code
    .replace(importLine?.[0] ?? '', `const { ${importBindings} } = runtime\n`)
    .replace(/export function /g, 'function ')
    .replace(/export const /g, 'const ')
  const exports: Record<string, unknown> = {}
  const names = [...body.matchAll(/(?:function|const) (App|Badge)\b/g)].map(
    (match) => match[1],
  )
  const moduleBody = `${body}\n${[...new Set(names)]
    .map((name) => `exports.${name} = ${name}`)
    .join('\n')}`
  const bindingNames = Object.keys(bindings)
  new Function(
    'exports',
    'runtime',
    'Show',
    'For',
    ...bindingNames,
    moduleBody,
  )(exports, runtime, Show, For, ...bindingNames.map((name) => bindings[name]))
  return exports
}

const behaviorFixture = `
function Badge(props: { label: () => string; onClick: () => void; ref: (node: HTMLButtonElement) => void }) {
  return <button ref={props.ref} onClick={props.onClick}>{props.label()}</button>
}
export function App(props: { label: () => string; show: () => boolean; items: () => { id: number; name: string }[]; onClick: () => void; ref: (node: HTMLButtonElement) => void }) {
  return <main><Badge label={props.label} onClick={props.onClick} ref={props.ref} /><Show when={props.show()} fallback={<span>off</span>}><span>on</span></Show><For each={props.items()} by={(item) => item.id}>{(item) => <p>{item().name}</p>}</For></main>
}
`

const fixtureMatrix = [
  ['static DOM', 'export const App = () => <div><span>static</span></div>'],
  [
    'dynamic text, attributes, and properties',
    'export const App = (props) => <input title={props.title()} value={props.value()} />',
  ],
  [
    'component props',
    'function Card(props) { return <article>{props.title()}</article> } export const App = (props) => <Card title={props.title} />',
  ],
  [
    'lazy children',
    'export const App = (props) => <Show when={props.ready()}>{() => <span>ready</span>}</Show>',
  ],
  ['fragments', 'export const App = () => <><i>one</i><b>two</b></>'],
  [
    'spreads',
    'export const App = (props) => <div {...props.first()} id={props.id()} {...props.second()} />',
  ],
  [
    'nested control flow',
    'export const App = (props) => <Show when={props.show()}><For each={props.items()}>{(item) => <p>{item()}</p>}</For></Show>',
  ],
  [
    'events',
    'export const App = (props) => <button onClick={props.onClick}>save</button>',
  ],
  ['refs', 'export const App = (props) => <input ref={props.ref} />'],
  [
    'SVG and MathML namespaces',
    'export const App = () => <><svg><circle cx="2" /></svg><math><mi>x</mi></math></>',
  ],
  [
    'errors',
    'export const App = (props) => <ErrorBoundary fallback={(error) => <p>{error.message}</p>}><div>{props.fail()}</div></ErrorBoundary>',
  ],
] as const

interface FixtureSnapshot {
  initial: string
  updated: string
  reads: number[]
  clicked: number
  clickedAfterDispose: number
  detached: boolean
  disposedDom: string
}

function runBehaviorFixture(code: string): FixtureSnapshot {
  document.body.replaceChildren()
  const module = evaluate(code, domRuntime as Record<string, unknown>)
  const label = signal('A')
  const show = signal(true)
  const items = signal([{ id: 1, name: 'one' }])
  const reads = [0, 0, 0]
  let clicked = 0
  let ref: HTMLButtonElement | undefined
  const dispose = render(
    () =>
      (module.App as (props: Record<string, unknown>) => Child)({
        label: () => {
          reads[0] = (reads[0] ?? 0) + 1
          return label()
        },
        show: () => {
          reads[1] = (reads[1] ?? 0) + 1
          return show()
        },
        items: () => {
          reads[2] = (reads[2] ?? 0) + 1
          return items()
        },
        onClick: () => clicked++,
        ref: (node: HTMLButtonElement) => {
          ref = node
        },
      }),
    document.body,
  )
  const initial = document.body.innerHTML
  ref?.click()
  label.set('B')
  show.set(false)
  items.set([{ id: 2, name: 'two' }])
  const updated = document.body.innerHTML
  const clickedBeforeDispose = clicked
  const node = ref
  dispose()
  node?.click()
  return {
    initial,
    updated,
    reads,
    clicked: clickedBeforeDispose,
    clickedAfterDispose: clicked,
    detached: node ? !node.isConnected : false,
    disposedDom: document.body.innerHTML,
  }
}

interface MatrixSnapshot {
  initial: string
  updated: string
  disposed: string
  reads: number
  events: number
  refs: number
  spreadOrder: string[]
  namespaces: string[]
}

function runMatrixFixture(
  name: (typeof fixtureMatrix)[number][0],
  code: string,
  optimization: 'none' | 'safe',
): MatrixSnapshot {
  void optimization
  document.body.replaceChildren()
  const module = evaluate(code, domRuntime as Record<string, unknown>, {
    ErrorBoundary: domRuntime.ErrorBoundary,
  })
  let dispose = (): void => undefined
  let update = (): void => undefined
  let reads = 0
  let events = 0
  let refs = 0
  const spreadOrder: string[] = []
  let props: Record<string, unknown> = {}

  if (name === 'static DOM' || name === 'fragments') {
    // These cases intentionally have no reactive inputs.
  } else if (name === 'dynamic text, attributes, and properties') {
    const title = signal('first')
    const value = signal('one')
    props = {
      title: () => {
        reads++
        return title()
      },
      value: () => {
        reads++
        return value()
      },
    }
    update = () => {
      title.set('second')
      value.set('two')
    }
  } else if (name === 'component props') {
    const title = signal('first')
    props = {
      title: () => {
        reads++
        return title()
      },
    }
    update = () => title.set('second')
  } else if (name === 'lazy children') {
    const ready = signal(false)
    props = {
      ready: () => {
        reads++
        return ready()
      },
    }
    update = () => ready.set(true)
  } else if (name === 'spreads') {
    const id = signal('one')
    props = {
      first: () => {
        spreadOrder.push('first')
        return { title: 'first', class: 'first' }
      },
      id: () => {
        reads++
        return id()
      },
      second: () => {
        spreadOrder.push('second')
        return { title: 'second' }
      },
    }
    update = () => id.set('two')
  } else if (name === 'nested control flow') {
    const show = signal(false)
    const items = signal([1])
    props = {
      show: () => {
        reads++
        return show()
      },
      items: () => {
        reads++
        return items()
      },
    }
    update = () => {
      show.set(true)
      items.set([2, 3])
    }
  } else if (name === 'events') {
    props = { onClick: () => (events += 1) }
  } else if (name === 'refs') {
    props = {
      ref: (node: HTMLInputElement) => {
        if (node) refs++
      },
    }
  } else if (name === 'SVG and MathML namespaces') {
    // Namespace creation is observed from the rendered DOM below.
  } else if (name === 'errors') {
    props = {
      fail: () => {
        throw new Error('fixture failure')
      },
    }
  }

  dispose = render(
    () => (module.App as (nextProps: Record<string, unknown>) => Child)(props),
    document.body,
  )
  const initial = document.body.innerHTML
  if (name === 'events')
    document
      .querySelector('button')
      ?.dispatchEvent(new Event('click', { bubbles: true }))
  update()
  const updated = document.body.innerHTML
  const namespaces = [
    document.querySelector('svg')?.namespaceURI ?? '',
    document.querySelector('math')?.namespaceURI ?? '',
  ]
  dispose()
  return {
    initial,
    updated,
    disposed: document.body.innerHTML,
    reads,
    events,
    refs,
    spreadOrder,
    namespaces,
  }
}

describe('@benosjs/compiler', () => {
  it('emits readable development plans and tuple production plans', () => {
    const development = transformJsx(
      'export const App = () => <div>Hello</div>',
      {
        filename: 'src/App.tsx',
        development: true,
      },
    )
    const production = transformJsx(
      'export const App = () => <div>Hello</div>',
      {
        filename: 'src/App.tsx',
        development: false,
      },
    )
    expect(development.code).toContain('__benos_template({')
    expect(production.code).toContain('__benos_template(["src_App_tsx:')
    expect(development.map.sources).toEqual(['src/App.tsx'])
    expect(development.map.mappings).not.toBe('')
  })

  it.each(fixtureMatrix)(
    'runs the %s fixture through none and safe optimization modes',
    (_name, source) => {
      const none = transformJsx(source, {
        filename: `fixtures/${_name}.tsx`,
        development: true,
        optimization: 'none',
      })
      const safe = transformJsx(source, {
        filename: `fixtures/${_name}.tsx`,
        development: true,
        optimization: 'safe',
      })
      expect(none.map.sources).toEqual([`fixtures/${_name}.tsx`])
      expect(safe.map.sources).toEqual([`fixtures/${_name}.tsx`])
      expect(none.diagnostics).toEqual(safe.diagnostics)
      expect(none.code).toContain('__benos_')
      expect(safe.code).toContain('__benos_')
    },
  )

  it.each(fixtureMatrix)(
    'keeps %s runtime behavior identical for none and safe optimization',
    (_name, source) => {
      const name = _name as (typeof fixtureMatrix)[number][0]
      const none = transformJsx(source, {
        filename: `fixtures/${name}.tsx`,
        development: true,
        optimization: 'none',
      })
      const safe = transformJsx(source, {
        filename: `fixtures/${name}.tsx`,
        development: true,
        optimization: 'safe',
      })
      const noneSnapshot = runMatrixFixture(name, none.code, 'none')
      const safeSnapshot = runMatrixFixture(name, safe.code, 'safe')
      expect(safeSnapshot).toEqual(noneSnapshot)
      if (name === 'SVG and MathML namespaces') {
        expect(noneSnapshot.namespaces[0]).toBe('http://www.w3.org/2000/svg')
        expect(noneSnapshot.namespaces[1]).toBe(
          'http://www.w3.org/1998/Math/MathML',
        )
      }
      if (name === 'errors')
        expect(noneSnapshot.initial).toContain('fixture failure')
    },
  )

  it('maps representative bindings to their original expressions', () => {
    const source = `function App(props) {
  return <div title={props.title}>{props.value()}</div>
}`
    const result = transformJsx(source, {
      filename: 'src/App.tsx',
      development: true,
    })
    const trace = new TraceMap(result.map)
    const positionOf = (token: string) => {
      const lines = result.code.split('\n')
      const line = lines.findIndex((value) => value.includes(token))
      expect(line).toBeGreaterThanOrEqual(0)
      return originalPositionFor(trace, {
        line: line + 1,
        column: (lines[line] ?? '').indexOf(token),
      })
    }
    expect(positionOf('scope.attr')).toMatchObject({
      source: 'src/App.tsx',
      line: 2,
      column: 21,
    })
    expect(positionOf('scope.child')).toMatchObject({
      source: 'src/App.tsx',
      line: 2,
      column: 35,
    })
  })

  it('keeps none and safe behavior identical on a real TSX fixture', () => {
    const none = transformJsx(behaviorFixture, {
      filename: 'fixtures/App.tsx',
      development: true,
      optimization: 'none',
    })
    const safe = transformJsx(behaviorFixture, {
      filename: 'fixtures/App.tsx',
      development: true,
      optimization: 'safe',
    })
    expect(none.diagnostics).toEqual(safe.diagnostics)
    expect(none.map.sources).toEqual(['fixtures/App.tsx'])
    expect(safe.map.sources).toEqual(['fixtures/App.tsx'])
    expect(none.code).toContain('__benos_dynamic_child')
    expect(safe.code).toContain('__benos_dynamic_child')
    expect(runBehaviorFixture(none.code)).toEqual(runBehaviorFixture(safe.code))
  })

  it('runs a compiled component fixture on the DOM host', () => {
    const result = transformJsx(behaviorFixture, {
      filename: 'fixtures/App.tsx',
      development: true,
      optimization: 'none',
    })
    const module = evaluate(result.code, domRuntime as Record<string, unknown>)
    const label = signal('A')
    const show = signal(true)
    const items = signal([{ id: 1, name: 'one' }])
    let clicked = 0
    let ref: HTMLButtonElement | undefined
    const dispose = render(
      () =>
        (module.App as (props: Record<string, unknown>) => Child)({
          label,
          show,
          items,
          onClick: () => clicked++,
          ref: (node: HTMLButtonElement) => {
            ref = node
          },
        }),
      document.body,
    )
    expect(document.body.innerHTML).toContain('A')
    expect(document.body.innerHTML).toContain('on')
    expect(document.body.innerHTML).toContain('one')
    expect(ref).toBeInstanceOf(HTMLButtonElement)
    ref?.click()
    expect(clicked).toBe(1)
    label.set('B')
    show.set(false)
    items.set([{ id: 2, name: 'two' }])
    expect(document.body.innerHTML).toContain('B')
    expect(document.body.innerHTML).toContain('off')
    expect(document.body.innerHTML).toContain('two')
    dispose()
    expect(document.body.innerHTML).toBe('')
  })

  it('keeps prop expressions lazy until the component reads them', () => {
    const source = `
function Child(props) { return <span>{props.value}</span> }
export function App() { return <Child value={read()} /> }
`
    let reads = 0
    const result = transformJsx(source, {
      filename: 'fixtures/lazy-props.tsx',
      development: true,
    })
    const module = evaluate(
      result.code,
      domRuntime as Record<string, unknown>,
      {
        read: () => {
          reads++
          return 'value'
        },
      },
    )
    const descriptor = (module.App as () => Child)()
    expect(reads).toBe(0)
    const dispose = render(() => descriptor, document.body)
    expect(reads).toBe(1)
    dispose()
  })

  it('evaluates spreads once in source order and lets later props win', () => {
    const source = `
export function App() {
  return <div {...first()} {...second()} title={explicit()} />
}
`
    const calls: string[] = []
    const result = transformJsx(source, {
      filename: 'fixtures/spreads.tsx',
      development: true,
    })
    const module = evaluate(
      result.code,
      domRuntime as Record<string, unknown>,
      {
        first: () => {
          calls.push('first')
          return { title: 'first', id: 'first' }
        },
        second: () => {
          calls.push('second')
          return { title: 'second', class: 'second' }
        },
        explicit: () => {
          calls.push('explicit')
          return 'explicit'
        },
      },
    )
    const descriptor = (module.App as () => Child)()
    expect(calls).toEqual(['first', 'second'])
    const dispose = render(() => descriptor, document.body)
    expect(calls).toEqual(['first', 'second', 'explicit'])
    expect(document.querySelector('div')?.getAttribute('title')).toBe(
      'explicit',
    )
    expect(document.querySelector('div')?.getAttribute('class')).toBe('second')
    dispose()
  })

  it('evaluates a binding once per run and reruns only for changed sources', () => {
    const source = 'export function App() { return <p>{read()}</p> }'
    const value = signal('a')
    let runs = 0
    const result = transformJsx(source, {
      filename: 'fixtures/binding.tsx',
      development: true,
    })
    const module = evaluate(
      result.code,
      domRuntime as Record<string, unknown>,
      {
        read: () => {
          runs++
          return value()
        },
      },
    )
    const dispose = render(() => (module.App as () => Child)(), document.body)
    expect(runs).toBe(1)
    value.set('b')
    expect(runs).toBe(2)
    value.set('b')
    expect(runs).toBe(2)
    dispose()
  })

  it('reports props destructuring and unsupported prop names', () => {
    const result = transformJsx(
      'export const App = ({ value }: { value: string }) => <div className="x" htmlFor="y" />',
      { filename: 'src/Diagnostics.tsx', development: true },
    )
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'unsupported-prop-name',
        'unsupported-prop-name',
        'props-destructuring',
      ]),
    )
    expect(result.diagnostics).toHaveLength(3)
    expect(
      result.diagnostics.find((item) => item.code === 'props-destructuring')
        ?.location,
    ).toEqual({
      line: 1,
      column: 20,
    })
    expect(
      result.diagnostics.find((item) => item.code === 'unsupported-prop-name')
        ?.location,
    ).toEqual({ line: 1, column: 58 })
  })

  it('reports raw HTML attributes separately', () => {
    const result = transformJsx(
      'export const App = (props) => <div innerHTML={props.value} />',
      { filename: 'src/RawHtml.tsx', development: true },
    )
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'raw-html-attribute',
        location: { line: 1, column: 35 },
      }),
    ])
  })

  it('rejects already lowered JSX with an actionable error', () => {
    expect(() =>
      transformJsx('const value = jsx("div", {})', {
        filename: 'src/Lowered.tsx',
      }),
    ).toThrow('already-lowered JSX')
  })

  it('rejects await in JSX bindings with a source diagnostic', () => {
    const result = transformJsx(
      'async function App() { return <div>{await value}</div> }',
      { filename: 'src/Await.tsx', development: true },
    )
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'async-binding',
          severity: 'error',
          location: { line: 1, column: 36 },
        }),
      ]),
    )
  })

  it('rejects yield in JSX bindings with a source diagnostic', () => {
    const result = transformJsx(
      'function* App() { return <div>{yield value}</div> }',
      { filename: 'src/Yield.tsx', development: true },
    )
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'async-binding',
          severity: 'error',
          location: { line: 1, column: 31 },
        }),
      ]),
    )
  })

  it('guards the automatic runtime when TSX was not compiled', () => {
    expect(() => untransformedJsx('div', {})).toThrow(
      'Benos JSX transform required',
    )
    expect(() => untransformedJsxDEV('div', {})).toThrow(
      'Benos JSX transform required',
    )
  })
})
