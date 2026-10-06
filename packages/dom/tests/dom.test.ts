// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createContext,
  effect,
  getContext,
  onCleanup,
  onMount,
  signal,
} from '@benosjs/core'
import {
  Dynamic,
  ErrorBoundary,
  For,
  Match,
  Portal,
  Show,
  Switch,
  children,
  instantiate,
  jsx,
  mergeProps,
  render,
  splitProps,
} from '../src/index.js'

const roots: Array<() => void> = []

afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('@benosjs/dom', () => {
  it('renders fine-grained text without rerunning the component', () => {
    const value = signal(0)
    let runs = 0
    function App() {
      runs++
      return jsx('p', {
        get children() {
          return String(value())
        },
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    expect(document.body.textContent).toBe('0')
    expect(runs).toBe(1)
    value.set(1)
    expect(document.body.textContent).toBe('1')
    expect(runs).toBe(1)
  })

  it('does not track component setup reads in the parent child slot', () => {
    const value = signal(1)
    let componentRuns = 0
    function Child(): JSX.Element {
      componentRuns++
      const snapshot = value()
      return jsx('button', { children: `snapshot ${snapshot}` })
    }
    roots.push(
      render(
        () =>
          jsx('div', {
            children: jsx(Show, { when: true, children: jsx(Child, {}) }),
          }),
        document.body,
      ),
    )
    const button = document.querySelector('button')
    expect(button?.textContent).toBe('snapshot 1')
    value.set(2)
    expect(componentRuns).toBe(1)
    expect(document.querySelector('button')).toBe(button)
    expect(button?.textContent).toBe('snapshot 1')
  })

  it('reconciles Show branches and removes singleton anchors', () => {
    const visible = signal(true)
    roots.push(
      render(
        () =>
          jsx(Show, {
            get when() {
              return visible()
            },
            children: jsx('span', { children: 'shown' }),
            fallback: jsx('i', { children: 'hidden' }),
          }),
        document.body,
      ),
    )
    expect(document.body.querySelector('span')?.textContent).toBe('shown')
    expect(document.body.childNodes).toHaveLength(1)
    visible.set(false)
    expect(document.body.querySelector('i')?.textContent).toBe('hidden')
    expect(document.body.childNodes).toHaveLength(1)
  })

  it('for-swap-preserves-node-identity', () => {
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            by: (item: { id: string }) => item.id,
            children: (item: () => { id: string }) =>
              jsx('li', {
                get children() {
                  return item().id
                },
              }),
          }),
        document.body,
      ),
    )
    const before = [...document.querySelectorAll('li')]
    items.set([{ id: 'b' }, { id: 'a' }, { id: 'c' }])
    const swapped = [...document.querySelectorAll('li')]
    expect(swapped.map((node) => node.textContent)).toEqual(['b', 'a', 'c'])
    expect(swapped[0]).toBe(before[1])
    expect(swapped[1]).toBe(before[0])
  })

  it('for-reverse-preserves-node-identity', () => {
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            by: (item: { id: string }) => item.id,
            children: (item: () => { id: string }) =>
              jsx('li', {
                get children() {
                  return item().id
                },
              }),
          }),
        document.body,
      ),
    )
    const before = [...document.querySelectorAll('li')]
    items.set([{ id: 'c' }, { id: 'b' }, { id: 'a' }])
    const reversed = [...document.querySelectorAll('li')]
    expect(reversed.map((node) => node.textContent)).toEqual(['c', 'b', 'a'])
    expect(reversed[0]).toBe(before[2])
    expect(reversed[2]).toBe(before[0])
  })

  it('singleton-element-range-has-no-anchors', () => {
    const items = signal([{ id: 'only' }])
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            by: (item: { id: string }) => item.id,
            children: (item: () => { id: string }) =>
              jsx('li', {
                get children() {
                  return item().id
                },
              }),
          }),
        document.body,
      ),
    )
    expect(document.body.childNodes).toHaveLength(1)
    expect(document.body.firstChild?.nodeType).toBe(Node.ELEMENT_NODE)
  })

  it('for-trims-prefix-suffix-and-minimizes-lis-moves', () => {
    const items = signal(['a', 'b', 'c', 'd', 'e'])
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            children: (item: () => string) =>
              jsx('li', {
                get children() {
                  return item()
                },
              }),
          }),
        document.body,
      ),
    )
    const before = [...document.querySelectorAll('li')]
    items.set(['a', 'x', 'b', 'c', 'd', 'e'])
    const after = [...document.querySelectorAll('li')]
    expect(after.map((node) => node.textContent)).toEqual([
      'a',
      'x',
      'b',
      'c',
      'd',
      'e',
    ])
    expect(after[0]).toBe(before[0])
    expect(after.slice(2)).toEqual(before.slice(1))
  })

  it('warns for duplicate <For> keys and keeps the extra item unkeyed', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items = signal(['same', 'same'])
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            children: (item: () => string) =>
              jsx('li', {
                get children() {
                  return item()
                },
              }),
          }),
        document.body,
      ),
    )
    expect(document.querySelectorAll('li')).toHaveLength(2)
    expect(warning).toHaveBeenCalledWith(
      'Duplicate <For> key; treating the extra item as unkeyed.',
    )
  })

  it('batches delegated handlers and removes them on disposal', () => {
    const value = signal(0)
    const handler = vi.fn(() => {
      value.set(1)
      value.set(2)
    })
    const dispose = render(
      () =>
        jsx('button', {
          onClick: handler,
          get children() {
            return String(value())
          },
        }),
      document.body,
    )
    roots.push(dispose)
    const button = document.querySelector('button')
    expect(button).not.toBeNull()
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledOnce()
    expect(button?.textContent).toBe('2')
    dispose()
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('native-before-delegated-order', () => {
    const order: string[] = []
    roots.push(
      render(
        () => jsx('button', { onClick: () => order.push('delegated') }),
        document.body,
      ),
    )
    const button = document.querySelector('button') as HTMLButtonElement
    button.addEventListener('click', () => order.push('native'))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(order).toEqual(['native', 'delegated'])
  })

  it('native-stop-propagation-blocks-delegated', () => {
    const delegated = vi.fn()
    roots.push(
      render(() => jsx('button', { onClick: delegated }), document.body),
    )
    const button = document.querySelector('button') as HTMLButtonElement
    button.addEventListener('click', (event) => event.stopPropagation())
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(delegated).not.toHaveBeenCalled()
  })

  it('delegated-submit-focusin-focusout-dblclick', () => {
    const events: string[] = []
    roots.push(
      render(
        () =>
          jsx('form', {
            onSubmit: () => events.push('submit'),
            onFocusin: () => events.push('focusin'),
            onFocusout: () => events.push('focusout'),
            onDblClick: () => events.push('dblclick'),
          }),
        document.body,
      ),
    )
    const form = document.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true }))
    form.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    form.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    form.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(events).toEqual(['submit', 'focusin', 'focusout', 'dblclick'])
  })

  it('production-plan-tuple-matches-development-behavior', () => {
    const nodes = [
      {
        op: 'element' as const,
        tag: 'span',
        ns: 'html' as const,
        children: [{ op: 'text' as const, value: 'same' }],
      },
    ]
    roots.push(
      render(
        () => instantiate({ id: 'readable', nodes }, () => undefined),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('same')
    roots.pop()?.()
    document.body.replaceChildren()
    roots.push(
      render(
        () => instantiate(['tuple', nodes], () => undefined),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('same')
  })

  it('caches a template prototype per document and clones each instance', () => {
    const plan = {
      id: 'prototype-cache-test',
      nodes: [{ op: 'element' as const, tag: 'span', ns: 'html' as const }],
    }
    const createElement = vi.spyOn(document, 'createElement')
    const first = instantiate(plan, () => undefined)
    const second = instantiate(plan, () => undefined)
    roots.push(
      render(() => jsx('div', { children: [first, second] }), document.body),
    )
    expect(document.querySelectorAll('span')).toHaveLength(2)
    expect(document.querySelectorAll('span')[0]).not.toBe(
      document.querySelectorAll('span')[1],
    )
    expect(
      createElement.mock.calls.filter(([tag]) => tag === 'span'),
    ).toHaveLength(1)
  })

  it('reuses a text node for a fine-grained child update', () => {
    const value = signal('a')
    roots.push(
      render(
        () =>
          jsx('p', {
            get children() {
              return value()
            },
          }),
        document.body,
      ),
    )
    const text = document.querySelector('p')?.firstChild
    value.set('b')
    expect(document.querySelector('p')?.textContent).toBe('b')
    expect(document.querySelector('p')?.firstChild).toBe(text)
  })

  it('preserves provider context and portal ownership', () => {
    const Context = createContext(signal('default'))
    const contextValue = signal('provided')
    function Consumer() {
      const value = getContext(Context)
      return jsx('span', {
        get children() {
          return value()
        },
      })
    }
    const target = document.createElement('div')
    document.body.append(target)
    const dispose = render(
      () =>
        jsx(Context.Provider, {
          value: contextValue,
          children: jsx(Portal, { mount: target, children: jsx(Consumer, {}) }),
        }),
      document.body,
    )
    roots.push(dispose)
    expect(target.textContent).toBe('provided')
    contextValue.set('next')
    expect(target.textContent).toBe('next')
    dispose()
    expect(target.textContent).toBe('')
  })

  it('runs onMount only after detached-host attachment', async () => {
    const host = document.createElement('div')
    let mounted = 0
    const dispose = render(() => {
      onMount(() => {
        mounted++
      })
      return jsx('span', { children: 'mounted' })
    }, host)
    roots.push(dispose)
    expect(mounted).toBe(0)
    document.body.append(host)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mounted).toBe(1)
  })

  it('creates nested SVG elements in their namespaces and blocks unsafe URLs', () => {
    roots.push(
      render(
        () =>
          jsx('svg', {
            children: jsx('foreignObject', {
              children: jsx('div', { title: 'data:keep', children: 'x' }),
            }),
          }),
        document.body,
      ),
    )
    const svg = document.querySelector('svg')
    const foreign = svg?.firstElementChild
    const div = foreign?.firstElementChild
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(foreign?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(div?.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    expect(div?.getAttribute('title')).toBe('data:keep')
    roots.push(
      render(
        () =>
          jsx('a', { href: '  java%73cript:alert(1) ', children: 'blocked' }),
        document.body,
      ),
    )
    expect(document.querySelector('a')?.hasAttribute('href')).toBe(false)
  })

  it('reconciles Switch and Match branches in source order', () => {
    const first = signal(true)
    const second = signal(false)
    roots.push(
      render(
        () =>
          jsx(Switch, {
            children: [
              jsx(Match, {
                get when() {
                  return first()
                },
                children: jsx('span', { children: 'first' }),
              }),
              jsx(Match, {
                get when() {
                  return second()
                },
                children: jsx('span', { children: 'second' }),
              }),
            ],
            fallback: jsx('span', { children: 'fallback' }),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('first')
    first.set(false)
    second.set(true)
    expect(document.body.textContent).toBe('second')
    second.set(false)
    expect(document.body.textContent).toBe('fallback')
  })

  it('replaces Dynamic component identity while preserving reactive props', () => {
    const choice = signal<'a' | 'b'>('a')
    const label = signal('one')
    const A = (props: { label: string }) =>
      jsx('p', {
        get children() {
          return `A:${props.label}`
        },
      })
    const B = (props: { label: string }) =>
      jsx('p', {
        get children() {
          return `B:${props.label}`
        },
      })
    roots.push(
      render(
        () =>
          jsx(Dynamic, {
            get component() {
              return choice() === 'a' ? A : B
            },
            get label() {
              return label()
            },
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('A:one')
    label.set('two')
    expect(document.body.textContent).toBe('A:two')
    choice.set('b')
    expect(document.body.textContent).toBe('B:two')
  })

  it('renders ErrorBoundary fallback, supports reset, and forwards fallback failure', () => {
    const fail = signal(true)
    const Content = () => {
      if (fail()) throw new Error('content')
      return jsx('span', { children: 'content' })
    }
    roots.push(
      render(
        () =>
          jsx(ErrorBoundary, {
            children: jsx(Content, {}),
            fallback: (_error: unknown, retry: () => void) =>
              jsx('button', {
                onClick: () => {
                  fail.set(false)
                  retry()
                },
                children: 'retry',
              }),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('retry')
    document
      .querySelector('button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.body.textContent).toBe('content')

    const Bad = () => {
      throw new Error('bad')
    }
    roots.push(
      render(
        () =>
          jsx(ErrorBoundary, {
            children: jsx(ErrorBoundary, {
              children: jsx(Bad, {}),
              fallback: () => {
                throw new Error('fallback')
              },
            }),
            fallback: () => jsx('strong', { children: 'outer' }),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toContain('outer')
  })

  it('batches native handlers, reports throws and async rejection, and flushes post-await writes', async () => {
    const report = vi.fn()
    vi.stubGlobal('reportError', report)
    const value = signal(0)
    const rejected = new Error('rejected')
    const thrown = new Error('thrown')
    roots.push(
      render(
        () =>
          jsx('button', {
            onFocus: () => {
              value.set(1)
              value.set(2)
            },
            onClick: () => {
              throw thrown
            },
            onDblClick: async () => {
              throw rejected
            },
            get children() {
              return String(value())
            },
          }),
        document.body,
      ),
    )
    const button = document.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    expect(button.textContent).toBe('2')
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    expect(report).toHaveBeenCalledWith(thrown)
    expect(report).toHaveBeenCalledWith(rejected)
    expect(report).toHaveBeenCalledTimes(2)

    const later = signal(0)
    roots.push(
      render(
        () =>
          jsx('button', {
            onFocus: async () => {
              await Promise.resolve()
              later.set(1)
            },
            get children() {
              return String(later())
            },
          }),
        document.body,
      ),
    )
    const second = document.querySelectorAll('button')[1] as HTMLButtonElement
    second.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    expect(second.textContent).toBe('0')
    await Promise.resolve()
    expect(second.textContent).toBe('1')
  })

  it('runs user effects after committed DOM and keeps the same-callback caveat', () => {
    const value = signal(0)
    const entries: string[] = []
    const afterWrite: string[] = []
    function App() {
      let node: Element | undefined
      effect(() => {
        value()
        if (node) entries.push(node.textContent ?? '')
      })
      effect(() => {
        if (value() === 0) return
        value.set(2)
        afterWrite.push(node?.textContent ?? '')
      })
      return jsx('p', {
        ref: (element) => {
          node = element
        },
        get children() {
          return String(value())
        },
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    expect(entries).toEqual(['0'])
    value.set(1)
    expect(entries).toContain('1')
    expect(afterWrite[0]).toBe('1')
    expect(document.body.textContent).toBe('2')
  })

  it('keeps refs non-null and runs ref cleanup on disposal', () => {
    const seen: Element[] = []
    let cleanups = 0
    const dispose = render(
      () =>
        jsx('input', {
          ref: (element: HTMLInputElement) => {
            seen.push(element)
            onCleanup(() => {
              cleanups++
            })
          },
        }),
      document.body,
    )
    roots.push(dispose)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(HTMLInputElement)
    dispose()
    expect(cleanups).toBe(1)
    expect(seen).not.toContain(null)
  })

  it('disposes listeners and external signal bindings with the owner', () => {
    const value = signal(0)
    let reads = 0
    const clicked = vi.fn()
    const dispose = render(
      () =>
        jsx('button', {
          onClick: clicked,
          get children() {
            reads++
            return String(value())
          },
        }),
      document.body,
    )
    roots.push(dispose)
    const button = document.querySelector('button') as HTMLButtonElement
    expect(reads).toBe(1)
    dispose()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    value.set(1)
    expect(clicked).not.toHaveBeenCalled()
    expect(reads).toBe(1)
  })

  it('removes a keyed middle owner before its listener can run', () => {
    const items = signal(['a', 'b', 'c'])
    const clicks: string[] = []
    roots.push(
      render(
        () =>
          jsx(For, {
            get each() {
              return items()
            },
            children: (item: () => string) =>
              jsx('button', {
                onClick: () => clicks.push(item()),
                get children() {
                  return item()
                },
              }),
          }),
        document.body,
      ),
    )
    const before = [...document.querySelectorAll('button')]
    items.set(['a', 'c'])
    before[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(before[1]?.parentNode).toBeNull()
    expect(clicks).toEqual([])
    expect([...document.querySelectorAll('button')]).toEqual([
      before[0],
      before[2],
    ])
  })

  it('warns once when a Provider value changes without remounting its subtree', () => {
    const Context = createContext('initial')
    const next = signal('initial')
    const warning = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    function Consumer() {
      return jsx('span', { children: getContext(Context) })
    }
    roots.push(
      render(
        () =>
          jsx(Context.Provider, {
            get value() {
              return next()
            },
            children: jsx(Consumer, {}),
          }),
        document.body,
      ),
    )
    const span = document.querySelector('span')
    next.set('changed')
    next.set('changed-again')
    expect(document.querySelector('span')).toBe(span)
    expect(document.body.textContent).toBe('initial')
    expect(warning).toHaveBeenCalledOnce()
  })

  it('forwards split and merged props and memoizes children reads', () => {
    const source = { first: 1, second: 2 }
    const [picked, rest] = splitProps(source, ['first'] as const)
    source.first = 3
    expect(picked.first).toBe(3)
    expect(rest.second).toBe(2)
    expect(rest.first).toBeUndefined()
    const merged = mergeProps(
      { value: 1 },
      {
        get value() {
          return source.first
        },
        extra: true,
      },
    )
    expect(merged.value).toBe(3)
    source.first = 4
    expect(merged.value).toBe(4)

    let sourceReads = 0
    let componentRuns = 0
    const child = jsx(() => {
      componentRuns++
      return jsx('i', { children: 'child' })
    }, {})
    roots.push(
      render(() => {
        const read = children(() => {
          sourceReads++
          return child
        })
        const first = read()
        const second = read()
        expect(first).toBe(second)
        return jsx('div', { children: first })
      }, document.body),
    )
    expect(sourceReads).toBe(1)
    expect(componentRuns).toBe(1)
  })

  it('warns when one children() value is mounted twice while active', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const child = jsx('span', { children: 'shared' })
    roots.push(
      render(() => {
        const read = children(() => child)
        const value = read()
        return jsx('div', { children: [value, value] })
      }, document.body),
    )
    expect(document.body.textContent).toBe('sharedshared')
    expect(warning).toHaveBeenCalledWith(
      'A children() value was mounted more than once; create a fresh child descriptor for each location.',
    )
  })
})
