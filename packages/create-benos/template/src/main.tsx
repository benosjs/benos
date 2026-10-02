/** @jsxImportSource @benosjs/dom */
import { signal } from '@benosjs/core'
import { For, Show, render } from '@benosjs/dom'
import './style.css'

const count = signal(0)
const items = signal(['signals', 'components', 'control flow'])

function App() {
  return (
    <main>
      <h1>Welcome to Benos</h1>
      <button onClick={() => count.update((value) => value + 1)}>
        Clicks: {count()}
      </button>
      <Show when={count() > 0} fallback={<p>Click the button.</p>}>
        <p>Signal updates are live.</p>
      </Show>
      <ul aria-label="Benos features">
        <For each={items()} by={(item) => item}>
          {(item) => <li>{item()}</li>}
        </For>
      </ul>
    </main>
  )
}

const host = document.querySelector('#app')
if (!(host instanceof HTMLElement)) throw new Error('Missing #app')
render(() => <App />, host)
