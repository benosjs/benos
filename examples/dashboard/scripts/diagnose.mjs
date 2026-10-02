/* global console */

import { performance } from 'node:perf_hooks'
import { Window } from 'happy-dom'
import { transformJsx } from '@benosjs/compiler'

const source = `function Card(props) { const { title } = props; return <h1>{title}</h1> }`
const staleStart = performance.now()
const staleResult = transformJsx(source, {
  filename: 'StaleCard.tsx',
  development: true,
  optimization: 'none',
})
const staleDiagnostic = staleResult.diagnostics.find(
  (diagnostic) => diagnostic.code === 'props-destructuring',
)
if (!staleDiagnostic) throw new Error('stale-prop diagnostic was not found')
const staleMs = performance.now() - staleStart

const window = new Window()
globalThis.window = window
globalThis.document = window.document
globalThis.Node = window.Node
globalThis.Element = window.Element
globalThis.HTMLElement = window.HTMLElement
globalThis.Document = window.Document
globalThis.DocumentFragment = window.DocumentFragment
globalThis.ShadowRoot = window.ShadowRoot
const { jsx, render } = await import('@benosjs/dom')
const host = window.document.createElement('div')
window.document.body.append(host)
let calls = 0
const listener = () => {
  calls++
}
const listenerStart = performance.now()
const dispose = render(
  () => jsx('button', { onClick: listener, children: 'Probe' }),
  host,
)
const mountedButton = host.querySelector('button')
mountedButton?.dispatchEvent(new window.Event('click', { bubbles: true }))
const beforeDispose = calls
dispose()
mountedButton?.dispatchEvent(new window.Event('click', { bubbles: true }))
const afterDispose = calls
if (beforeDispose !== 1 || afterDispose !== beforeDispose)
  throw new Error(
    `listener remained live after owner disposal (${beforeDispose} -> ${afterDispose})`,
  )
const listenerMs = performance.now() - listenerStart

console.log(
  JSON.stringify(
    {
      staleDestructuredProp: {
        elapsedMs: Number(staleMs.toFixed(3)),
        diagnostic: staleDiagnostic,
      },
      leakedListener: {
        elapsedMs: Number(listenerMs.toFixed(3)),
        callsBeforeDispose: beforeDispose,
        callsAfterDispose: afterDispose,
      },
      protocol:
        'Automated reproduce-and-locate timing; elapsed time is process wall time, not a human usability study.',
    },
    null,
    2,
  ),
)
