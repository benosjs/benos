import { onCleanup, onMount, signal } from '@benosjs/core'
import { Portal, Show, render } from '@benosjs/dom'

type BrowserResult = Record<string, unknown>

const appHost = document.querySelector<HTMLElement>('#app')
if (!appHost) throw new Error('Browser fixture host is missing')

let disposeCurrent: (() => void) | undefined
let detachedHost: HTMLElement | undefined

function clear(): void {
  disposeCurrent?.()
  disposeCurrent = undefined
  detachedHost?.remove()
  detachedHost = undefined
  appHost.replaceChildren()
  for (const node of [...document.body.children])
    if (node !== appHost) node.remove()
}

function mount(
  app: () => JSX.Element,
  host: Element | DocumentFragment = appHost,
): void {
  disposeCurrent = render(app, host)
}

function mountInitial(): BrowserResult {
  clear()
  const events: string[] = []
  function Initial(): JSX.Element {
    onMount(() => {
      events.push(
        document.body.contains(document.querySelector('#initial-mount'))
          ? 'mounted-after-insert'
          : 'mounted-before-insert',
      )
    })
    return <button id="initial-mount">initial</button>
  }
  mount(() => <Initial />)
  return { events, html: appHost.innerHTML }
}

function mountLaterBranch(): BrowserResult {
  clear()
  const events: string[] = []
  const show = signal(false)
  function Later(): JSX.Element {
    onMount(() => {
      events.push(
        document.body.contains(document.querySelector('#later-mount'))
          ? 'mounted-after-insert'
          : 'mounted-before-insert',
      )
    })
    return <button id="later-mount">later</button>
  }
  mount(() => (
    <Show when={show()}>
      <Later />
    </Show>
  ))
  const before = [...events]
  show.set(true)
  return { before, after: events, html: appHost.innerHTML }
}

function mountPortal(): BrowserResult {
  clear()
  const events: string[] = []
  const target = document.createElement('aside')
  target.id = 'portal-target'
  document.body.append(target)
  function PortalChild(): JSX.Element {
    onMount(() => {
      events.push(
        target.contains(document.querySelector('#portal-mount'))
          ? 'mounted-after-insert'
          : 'mounted-before-insert',
      )
    })
    return <button id="portal-mount">portal</button>
  }
  mount(() => (
    <Portal mount={target}>
      <PortalChild />
    </Portal>
  ))
  return { events, targetHtml: target.innerHTML, appHtml: appHost.innerHTML }
}

async function detachedObserver(
  disposeBeforeAttach: boolean,
): Promise<BrowserResult> {
  clear()
  const OriginalObserver = window.MutationObserver
  let observes = 0
  let disconnects = 0
  class CountingObserver extends OriginalObserver {
    observe(...args: Parameters<MutationObserver['observe']>): void {
      observes++
      super.observe(...args)
    }
    disconnect(): void {
      disconnects++
      super.disconnect()
    }
  }
  window.MutationObserver = CountingObserver
  const events: string[] = []
  detachedHost = document.createElement('div')
  function Detached(): JSX.Element {
    onMount(() => events.push('mounted'))
    onCleanup(() => events.push('cleaned'))
    return <span id="detached-node">detached</span>
  }
  mount(() => <Detached />, detachedHost)
  const before = { observes, disconnects, events: [...events] }
  if (disposeBeforeAttach) disposeCurrent?.()
  document.body.append(detachedHost)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const after = { observes, disconnects, events: [...events] }
  window.MutationObserver = OriginalObserver
  return { before, after, connected: document.body.contains(detachedHost) }
}

function focusOrder(): BrowserResult {
  clear()
  const events: string[] = []
  const record = (name: string) => () => events.push(name)
  mount(() => (
    <div>
      <input
        id="focus-first"
        onFocus={record('focus:first')}
        onFocusin={record('focusin:first')}
        onFocusout={record('focusout:first')}
      />
      <input
        id="focus-second"
        onFocus={record('focus:second')}
        onFocusin={record('focusin:second')}
        onFocusout={record('focusout:second')}
      />
    </div>
  ))
  document.querySelector<HTMLElement>('#focus-first')?.focus()
  document.querySelector<HTMLElement>('#focus-second')?.focus()
  return { events, active: document.activeElement?.id }
}

function parserFixtures(): BrowserResult {
  clear()
  mount(() => (
    <div>
      <table id="parser-table">
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </table>
      <select id="parser-select" value="second">
        <option value="first">First</option>
        <option value="second" selected>
          Second
        </option>
      </select>
      <svg id="parser-svg" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" />
      </svg>
    </div>
  ))
  const table = document.querySelector<HTMLTableElement>('#parser-table')
  const select = document.querySelector<HTMLSelectElement>('#parser-select')
  const svg = document.querySelector<SVGElement>('#parser-svg')
  return {
    tableCell: table?.rows[0]?.cells[0]?.textContent,
    tableParent: table?.rows[0]?.parentElement?.tagName,
    optionCount: select?.options.length,
    selected: select?.value,
    svgNamespace: svg?.namespaceURI,
    circleNamespace: svg?.querySelector('circle')?.namespaceURI,
  }
}

function accessibilityFixture(): BrowserResult {
  clear()
  let activations = 0
  mount(() => (
    <main>
      <label for="accessible-name">Name</label>
      <input id="accessible-name" />
      <button
        id="accessible-action"
        aria-label="Save record"
        onClick={() => {
          activations++
          const status = document.querySelector('#accessible-status')
          if (status) status.textContent = `saved ${activations}`
        }}
      >
        Save
      </button>
      <output id="accessible-status">not saved</output>
    </main>
  ))
  return {
    buttonName: document
      .querySelector('#accessible-action')
      ?.getAttribute('aria-label'),
    labelledInput: document.querySelector('label')?.htmlFor,
    status: document.querySelector('#accessible-status')?.textContent,
  }
}

function keyboardFixture(): BrowserResult {
  clear()
  const focused: string[] = []
  const recordFocus = (id: string) => () => focused.push(id)
  mount(() => (
    <div>
      <button
        id="keyboard-first"
        onFocus={recordFocus('first')}
        onKeyDown={(event) => {
          if ((event as KeyboardEvent).key === 'ArrowRight')
            (
              (event.currentTarget as HTMLElement)
                .nextElementSibling as HTMLElement
            )?.focus()
        }}
      >
        First
      </button>
      <button id="keyboard-second" onFocus={recordFocus('second')}>
        Second
      </button>
    </div>
  ))
  return { focused }
}

function rtlFixture(): BrowserResult {
  clear()
  mount(() => (
    <div id="rtl-root" dir="rtl">
      <span id="rtl-first">א</span>
      <span id="rtl-second">ב</span>
    </div>
  ))
  const root = document.querySelector<HTMLElement>('#rtl-root')
  return {
    dir: root?.dir,
    computedDirection: root ? getComputedStyle(root).direction : undefined,
    order: [...(root?.children ?? [])].map((node) => node.id),
  }
}

;(
  window as typeof window & { __benosBrowser?: Record<string, unknown> }
).__benosBrowser = {
  mountInitial,
  mountLaterBranch,
  mountPortal,
  detachedObserver,
  focusOrder,
  parserFixtures,
  accessibilityFixture,
  keyboardFixture,
  rtlFixture,
}
