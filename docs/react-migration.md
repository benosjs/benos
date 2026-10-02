# React migration guide

Benos keeps component functions run-once and moves reactive work into signal
bindings. The migration is straightforward when each React render-time read is
made an explicit signal read or accessor read.

## Run-once components

React components rerun when state changes. Benos components run once when their
descriptor is materialized. A JSX expression in a text, attribute, child, or
event binding remains live; a value read into a local in the component body is
a snapshot.

```tsx
import { signal } from '@benosjs/core'
import { render } from '@benosjs/dom'

const name = signal('Ada')
function Greeting() {
  return <p>Hello {name()}</p>
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <Greeting />, host)
```

Use `effect` for an external side effect and `onCleanup` for its teardown. Do
not expect a component body to observe later writes.

## Props and destructuring

JSX prop expressions are getter-backed when they are dynamic. Reading
`props.value` inside a binding observes the current value; destructuring it in
setup snapshots it. Development diagnostics and the ESLint rule flag visible
destructuring. Use `splitProps` when a helper needs a subset of props.

`className` and `htmlFor` stay rejected with a diagnostic. Write the platform
names `class` and `for`.

## `<For>` accessors

`<For>` children receive `item()` and `index()` accessors. Keep the accessor in
the binding so keyed updates preserve the item owner and update the DOM:

```tsx
import { For, render } from '@benosjs/dom'

function Rows(props: { rows: readonly { id: number; label: string }[] }) {
  return (
    <For each={props.rows} by={(row) => row.id}>
      {(row, index) => (
        <p>
          {index()}: {row().label}
        </p>
      )}
    </For>
  )
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <Rows rows={[{ id: 1, label: 'one' }]} />, host)
```

## Callback refs

React callback refs often receive an element and then `null` on unmount. Benos
refs receive only the concrete, non-null element. Put teardown in `onCleanup`
while the ref is executing under its owner:

```tsx
import { onCleanup } from '@benosjs/core'
import { render } from '@benosjs/dom'

function FocusTarget() {
  return (
    <input
      ref={(element) => {
        const listener = () => element.focus()
        element.addEventListener('dblclick', listener)
        onCleanup(() => element.removeEventListener('dblclick', listener))
      }}
    />
  )
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <FocusTarget />, host)
```

## Event ordering

Benos batches every event handler automatically. Common bubbling events are
delegated at the document or shadow root; capture, custom, and non-bubbling
events use native listeners. The exact order is summarized in the event table
in [event-ordering.md](./event-ordering.md).
