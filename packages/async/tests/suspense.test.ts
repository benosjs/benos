// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { effect, onCleanup, onMount, signal } from '@benosjs/core'
import { ErrorBoundary, jsx, render } from '@benosjs/dom'
import { resource, startTransition, Suspense } from '../src/index.js'

const roots: Array<() => void> = []
async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})

describe('Suspense', () => {
  it('shows fallback until a resource settles and gates effects and mounts', async () => {
    let resolve!: (value: string) => void
    const pending = new Promise<string>((done) => {
      resolve = done
    })
    const seen: string[] = []
    function Content() {
      const data = resource(
        () => 'item',
        () => pending,
      )
      effect(() => seen.push('effect'))
      onMount(() => seen.push('mount'))
      return jsx('p', {
        get children() {
          return data.read() ?? 'preparing'
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: jsx('span', { children: 'Loading' }),
            children: jsx(Content, {}),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('Loading')
    expect(seen).toEqual([])
    resolve('Ready')
    await flushAsync()
    expect(document.body.textContent).toBe('Ready')
    expect(seen).toContain('effect')
  })

  it('retains committed content during a pending transition', async () => {
    const key = signal('A')
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const data = resource(
        key,
        (next) => new Promise<string>((resolve) => requests.set(next, resolve)),
      )
      function Content() {
        return jsx('p', {
          get children() {
            return data.read() ?? 'pending'
          },
        })
      }
      return jsx(Suspense, {
        fallback: jsx('span', { children: 'Loading' }),
        children: jsx(Content, {}),
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    expect(document.body.textContent).toBe('Loading')
    requests.get('A')?.('A')
    await flushAsync()
    expect(document.body.textContent).toBe('A')
    const transition = startTransition(() => key.set('B'))
    expect(document.body.textContent).toBe('A')
    await flushAsync()
    expect(document.body.textContent).toBe('A')
    requests.get('B')?.('B')
    await transition
    expect(document.body.textContent).toBe('B')
  })

  it('waits for all current resources and ignores duplicate reads', async () => {
    const pending = new Map<string, (value: string) => void>()
    function Content() {
      const first = resource(
        () => 'first',
        (key) => new Promise<string>((resolve) => pending.set(key, resolve)),
      )
      const second = resource(
        () => 'second',
        (key) => new Promise<string>((resolve) => pending.set(key, resolve)),
      )
      return jsx('p', {
        get children() {
          first.read()
          return `${first.read() ?? '?'}:${second.read() ?? '?'}`
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: 'wait',
            children: jsx(Content, {}),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('wait')
    pending.get('first')?.('one')
    await flushAsync()
    expect(document.body.textContent).toBe('wait')
    pending.get('second')?.('two')
    await flushAsync()
    expect(document.body.textContent).toBe('one:two')
  })

  it('keeps fallback through A → B → A request supersession', async () => {
    const key = signal('A')
    const requests: Array<{ key: string; resolve: (value: string) => void }> =
      []
    function App() {
      const data = resource(
        key,
        (next) =>
          new Promise<string>((resolve) => {
            requests.push({ key: next, resolve })
          }),
      )
      function Content() {
        return jsx('p', {
          get children() {
            return data.read()
          },
        })
      }
      return jsx(Suspense, { fallback: 'wait', children: jsx(Content, {}) })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    key.set('B')
    key.set('A')
    expect(requests.map((request) => request.key)).toEqual(['A', 'B', 'A'])
    requests[0]?.resolve('old A')
    requests[1]?.resolve('B')
    await flushAsync()
    expect(document.body.textContent).toBe('wait')
    requests[2]?.resolve('new A')
    await flushAsync()
    expect(document.body.textContent).toBe('new A')
  })

  it('releases a pending token when the staged binding stops reading it', async () => {
    const show = signal(true)
    let finish!: (value: string) => void
    function Content() {
      const data = resource(
        () => 1,
        () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      )
      return jsx('p', {
        get children() {
          return show() ? data.read() : 'skipped'
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: 'wait',
            children: jsx(Content, {}),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('wait')
    show.set(false)
    await flushAsync()
    expect(document.body.textContent).toBe('skipped')
    finish('late')
    await flushAsync()
    expect(document.body.textContent).toBe('skipped')
  })

  it('reveals an outer shell while its nested boundary remains pending', async () => {
    let finish!: (value: string) => void
    function Inner() {
      const data = resource(
        () => 1,
        () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      )
      return jsx('b', {
        get children() {
          return data.read()
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: 'outer wait',
            children: jsx('section', {
              children: [
                'shell',
                jsx(Suspense, {
                  fallback: 'inner wait',
                  children: jsx(Inner, {}),
                }),
              ],
            }),
          }),
        document.body,
      ),
    )
    await flushAsync()
    expect(document.body.textContent).toBe('shellinner wait')
    finish('done')
    await flushAsync()
    expect(document.body.textContent).toBe('shelldone')
  })

  it('reveals a directly nested boundary without a wrapper element', async () => {
    let finish!: (value: string) => void
    function Inner() {
      const data = resource(
        () => 'inner',
        () => new Promise<string>((resolve) => (finish = resolve)),
      )
      return jsx('b', {
        get children() {
          return data.read()
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: 'outer wait',
            children: jsx(Suspense, {
              fallback: 'inner wait',
              children: jsx(Inner, {}),
            }),
          }),
        document.body,
      ),
    )
    await flushAsync()
    expect(document.body.textContent).toBe('inner wait')
    finish('done')
    await flushAsync()
    expect(document.body.textContent).toBe('done')
  })

  it('does not reveal a disposed pending branch', async () => {
    let finish!: (value: string) => void
    function Content() {
      const data = resource(
        () => 1,
        () =>
          new Promise<string>((resolve) => {
            finish = resolve
          }),
      )
      return jsx('p', {
        get children() {
          return data.read()
        },
      })
    }
    const dispose = render(
      () =>
        jsx(Suspense, {
          fallback: 'wait',
          children: jsx(Content, {}),
        }),
      document.body,
    )
    expect(document.body.textContent).toBe('wait')
    dispose()
    finish('late')
    await flushAsync()
    expect(document.body.textContent).toBe('')
  })

  it('shows fallback for an ordinary pending update', async () => {
    const key = signal('A')
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const data = resource(
        key,
        (next) =>
          new Promise<string>((resolve) => {
            requests.set(next, resolve)
          }),
      )
      function Content() {
        return jsx('p', {
          get children() {
            return data.read() ?? 'stale'
          },
        })
      }
      return jsx(Suspense, { fallback: 'wait', children: jsx(Content, {}) })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    requests.get('A')?.('A')
    await flushAsync()
    expect(document.body.textContent).toBe('A')
    key.set('B')
    await flushAsync()
    expect(document.body.textContent).toBe('wait')
    requests.get('B')?.('B')
    await flushAsync()
    expect(document.body.textContent).toBe('B')
  })

  it('supersedes an older transition and ignores its late result', async () => {
    const key = signal('A')
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const data = resource(
        key,
        (next) =>
          new Promise<string>((resolve) => {
            requests.set(next, resolve)
          }),
      )
      function Content() {
        return jsx('p', {
          get children() {
            return data.read()
          },
        })
      }
      return jsx(Suspense, { fallback: 'wait', children: jsx(Content, {}) })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    requests.get('A')?.('A')
    await flushAsync()
    const older = startTransition(() => key.set('B'))
    expect(document.body.textContent).toBe('A')
    const newer = startTransition(() => key.set('C'))
    await older
    requests.get('B')?.('late B')
    await flushAsync()
    expect(document.body.textContent).toBe('A')
    requests.get('C')?.('C')
    await newer
    expect(document.body.textContent).toBe('C')
  })

  it('ungates the retained branch when transition setup throws', async () => {
    const value = signal('A')
    roots.push(
      render(
        () =>
          jsx(Suspense, {
            fallback: 'wait',
            children: jsx('p', {
              get children() {
                return value()
              },
            }),
          }),
        document.body,
      ),
    )
    await flushAsync()
    expect(() =>
      startTransition(() => {
        value.set('B')
        throw new Error('setup failed')
      }),
    ).toThrow('setup failed')
    expect(document.body.textContent).toBe('B')
  })

  it('routes a failed resource read through the nearest error boundary', async () => {
    let reject!: (error: unknown) => void
    function Content() {
      const data = resource(
        () => 1,
        () =>
          new Promise<string>((_resolve, fail) => {
            reject = fail
          }),
      )
      return jsx('p', {
        get children() {
          return data.read()
        },
      })
    }
    roots.push(
      render(
        () =>
          jsx(ErrorBoundary, {
            fallback: 'failed',
            children: jsx(Suspense, {
              fallback: 'wait',
              children: jsx(Content, {}),
            }),
          }),
        document.body,
      ),
    )
    expect(document.body.textContent).toBe('wait')
    reject(new Error('fetch failed'))
    await flushAsync()
    expect(document.body.textContent).toBe('failed')
  })

  it('commits error recovery when a staged transition fails', async () => {
    const key = signal('A')
    const requests = new Map<
      string,
      {
        resolve: (value: string) => void
        reject: (error: unknown) => void
      }
    >()
    function App() {
      const data = resource(
        key,
        (next) =>
          new Promise<string>((resolve, reject) => {
            requests.set(next, { resolve, reject })
          }),
      )
      function Content() {
        return jsx('p', {
          get children() {
            return data.read()
          },
        })
      }
      return jsx(ErrorBoundary, {
        fallback: 'recovered',
        children: jsx(Suspense, {
          fallback: 'wait',
          children: jsx(Content, {}),
        }),
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    requests.get('A')?.resolve('A')
    await flushAsync()
    const transition = startTransition(() => key.set('B'))
    expect(document.body.textContent).toBe('A')
    requests.get('B')?.reject(new Error('bad B'))
    await transition
    expect(document.body.textContent).toBe('recovered')
  })

  it('allows fallback content to read without self-suspending', async () => {
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const fallbackData = resource(
        () => 'fallback',
        (key) => new Promise<string>((resolve) => requests.set(key, resolve)),
      )
      const innerData = resource(
        () => 'inner',
        (key) => new Promise<string>((resolve) => requests.set(key, resolve)),
      )
      return jsx(Suspense, {
        fallback: jsx('i', {
          get children() {
            return fallbackData.read() ?? 'stale'
          },
        }),
        children: jsx('p', {
          get children() {
            return innerData.read()
          },
        }),
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    await flushAsync()
    expect(document.body.textContent).toBe('stale')
    requests.get('fallback')?.('fallback ready')
    await flushAsync()
    expect(document.body.textContent).toBe('fallback ready')
    requests.get('inner')?.('inner ready')
    await flushAsync()
    expect(document.body.textContent).toBe('inner ready')
  })

  it('lets a nested fallback suspend its outer boundary', async () => {
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const fallbackData = resource(
        () => 'fallback',
        (key) => new Promise<string>((resolve) => requests.set(key, resolve)),
      )
      const innerData = resource(
        () => 'inner',
        (key) => new Promise<string>((resolve) => requests.set(key, resolve)),
      )
      return jsx(Suspense, {
        fallback: 'outer wait',
        children: jsx(Suspense, {
          fallback: jsx('i', {
            get children() {
              return fallbackData.read() ?? 'stale'
            },
          }),
          children: jsx('p', {
            get children() {
              return innerData.read()
            },
          }),
        }),
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    await flushAsync()
    expect(document.body.textContent).toBe('outer wait')
    requests.get('fallback')?.('fallback ready')
    await flushAsync()
    expect(document.body.textContent).toBe('fallback ready')
    requests.get('inner')?.('inner ready')
    await flushAsync()
    expect(document.body.textContent).toBe('inner ready')
  })

  it('retains the old owner until a transition commits', async () => {
    const key = signal('A')
    const requests = new Map<string, (value: string) => void>()
    const cleanups: string[] = []
    function App() {
      const data = resource(
        key,
        (next) => new Promise<string>((resolve) => requests.set(next, resolve)),
      )
      function Content() {
        const rendered = key()
        onCleanup(() => cleanups.push(rendered))
        return jsx('p', {
          get children() {
            return data.read()
          },
        })
      }
      return jsx(Suspense, { fallback: 'wait', children: jsx(Content, {}) })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    requests.get('A')?.('A')
    await flushAsync()
    const transition = startTransition(() => key.set('B'))
    expect(document.body.textContent).toBe('A')
    expect(cleanups).toEqual([])
    requests.get('B')?.('B')
    await transition
    expect(document.body.textContent).toBe('B')
    expect(cleanups).toContain('A')
  })

  it('does not extend transition scope across an await', async () => {
    const key = signal('A')
    const requests = new Map<string, (value: string) => void>()
    function App() {
      const data = resource(
        key,
        (next) => new Promise<string>((resolve) => requests.set(next, resolve)),
      )
      return jsx(Suspense, {
        fallback: 'wait',
        children: jsx('p', {
          get children() {
            return data.read()
          },
        }),
      })
    }
    roots.push(render(() => jsx(App, {}), document.body))
    requests.get('A')?.('A')
    await flushAsync()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const transition = startTransition(() => {
      key.set('B')
      void gate.then(() => key.set('C'))
    })
    expect(document.body.textContent).toBe('A')
    release()
    await flushAsync()
    requests.get('C')?.('C')
    await transition
    await flushAsync()
    expect(document.body.textContent).toBe('C')
    requests.get('B')?.('late B')
    await flushAsync()
    expect(document.body.textContent).toBe('C')
  })
})
