# Getting started

Benos v0.1 targets Node.js `^22.18.0 || ^24.11.0 || >=26.0.0`. It uses TypeScript/TSX, the Benos
compiler, and Vite. Components run once; signal reads in bindings keep the DOM
current without rerunning the component function.

## Install

For a ready-to-run example, scaffold an app with `npm create benos@latest`.
The starter uses the system light or dark theme and demonstrates a counter
whose component render count remains one, alongside a keyed `<For>` list. It is
intentionally small so you can replace it with your own app.

Install the public packages in an existing Vite project:

```sh
pnpm add @benosjs/core @benosjs/dom @benosjs/compiler @benosjs/vite
```

The same packages work with npm, Yarn, or Bun. The `@benosjs/vite` plugin must
run before another JSX transform.

## Configure TypeScript and Vite

Use the automatic JSX import source and preserve JSX for the Benos plugin:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@benosjs/dom",
    "strict": true,
    "moduleResolution": "Bundler"
  }
}
```

```ts
import { defineConfig } from 'vite'
import benos from '@benosjs/vite'

export default defineConfig({
  esbuild: { jsx: 'preserve' },
  plugins: [benos()],
})
```

Do not add React, Solid, or another JSX transform to the same source files.
Benos reports an actionable error if it receives JSX that was already lowered.

## First component

```tsx
import { signal } from '@benosjs/core'
import { For, Show, render } from '@benosjs/dom'

const count = signal(0)
const items = signal(['one', 'two'])

function App() {
  return (
    <main>
      <button onClick={() => count.update((value) => value + 1)}>
        Count: {count()}
      </button>
      <Show when={count() > 0} fallback={<p>Start counting</p>}>
        <p>There is a count.</p>
      </Show>
      <For each={items()} by={(item) => item}>
        {(item) => <span>{item()}</span>}
      </For>
    </main>
  )
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <App />, host)
```

`render` appends an owned range to the host and returns a disposer. A signal
write flushes render work synchronously unless it is inside `batch`. Event
handlers are batched automatically.

## Read props in bindings

Components are run once. Keep the props object intact when a later binding
needs the current value; use `splitProps` for getter-preserving views instead
of destructuring.

```tsx
import { signal } from '@benosjs/core'
import { render, splitProps } from '@benosjs/dom'

function Greeting(props: { name: string }) {
  const [label, rest] = splitProps(props, ['name'] as const)
  return <p {...rest}>Hello {label.name}</p>
}

const name = signal('Ada')
const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <Greeting name={name()} />, host)
name.set('Grace')
```

The development compiler diagnostic and `@benosjs/eslint-plugin` rule flag
visible props destructuring. `className` and `htmlFor` remain rejected: use
the standard HTML names `class` and `for`.

## Testing

The recommended scripts are:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Keep the compiler plugin in front of all other JSX transforms in test and
production builds so the same owner and binding semantics are exercised.
