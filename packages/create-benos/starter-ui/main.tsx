/** @jsxImportSource @benosjs/dom */
import { signal } from '@benosjs/core'
import { For, render } from '@benosjs/dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import './style.css'
import './styles/benos.css'
import './styles/button.css'
import './styles/input.css'

type Item = { id: number; label: string }
const count = signal(0)
const componentRuns = signal(0)
const items = signal<Item[]>([
  { id: 1, label: 'Signals' },
  { id: 2, label: 'Components' },
  { id: 3, label: 'Keyed lists' },
])
const draft = signal('')
let nextId = 4
const docs = 'https://github.com/benosjs/benos/blob/main/docs/'

function App() {
  componentRuns.update((runs) => runs + 1)
  const addItem = () => {
    const label = draft().trim() || `New item ${nextId}`
    items.update((current) => [...current, { id: nextId++, label }])
    draft.set('')
  }
  const removeItem = () => items.update((current) => current.slice(0, -1))
  const shuffleItems = () =>
    items.update((current) => {
      const next = [...current]
      for (let index = next.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1))
        ;[next[index], next[other]] = [next[other], next[index]]
      }
      return next
    })

  return (
    <main class="shell">
      <header class="brand">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="/benos-mark-light.png" />
          <img src="/benos-mark-navy.png" alt="Benos" width="40" height="40" />
        </picture>
        <span>
          benos<span class="brand-dot">.</span>
        </span>
      </header>

      <section class="intro" aria-labelledby="welcome-title">
        <p class="eyebrow">A small, fine-grained UI framework</p>
        <h1 id="welcome-title">Build interfaces that stay in sync.</h1>
        <p class="intro-copy">Signals keep only dependent DOM values in sync.</p>
      </section>
      <section class="examples" aria-label="Benos examples">
        <article class="panel counter-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">01 / Signals</p>
              <h2>A live counter</h2>
            </div>
            <span class="live-pill">
              <i></i> Live
            </span>
          </div>
          <div class="stats">
            <div class="stat">
              <span>Count</span>
              <strong class="counter-value">{count()}</strong>
            </div>
            <div class="stat">
              <span>This component rendered</span>
              <strong class="run-value">
                <span class="run-number">{componentRuns()}</span>{' '}
                <small class="run-unit">{componentRuns() === 1 ? 'time' : 'times'}</small>
              </strong>
            </div>
          </div>
          <Button
            class="starter-primary-button"
            variant="primary"
            onClick={() => count.update((value) => value + 1)}
          >
            Add one <span aria-hidden="true">+</span>
          </Button>
          <p class="explanation">
            The component runs once; signal bindings update only the DOM values that depend on them.
          </p>
        </article>
        <article class="panel list-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">02 / Control flow</p>
              <h2>A keyed list</h2>
            </div>
            <span class="item-count">{items().length} items</span>
          </div>
          <div class="list-actions">
            <Input
              aria-label="New feature name"
              placeholder="Feature to add"
              value={draft()}
              onInput={(event) => draft.set(event.currentTarget.value)}
            />
            <Button variant="secondary" onClick={addItem}>
              Add
            </Button>
            <Button variant="outline" onClick={removeItem} disabled={items().length === 0}>
              Remove
            </Button>
            <Button variant="outline" onClick={shuffleItems} disabled={items().length < 2}>
              Shuffle
            </Button>
          </div>
          <ul aria-label="Keyed Benos features">
            <For each={items()} by={(item) => item.id}>
              {(item) => (
                <li>
                  <span class="item-mark" aria-hidden="true">
                    ✓
                  </span>
                  {item().label}
                </li>
              )}
            </For>
          </ul>
        </article>
      </section>
      <footer class="footer">
        <span>Ready to make it yours?</span>
        <nav aria-label="Benos resources">
          <a href={`${docs}getting-started.md`}>Getting started</a>
          <a href={`${docs}api-reference.md`}>API reference</a>
          <a href={`${docs}react-migration.md`}>React guide</a>
          <a href="https://github.com/benosjs/benos">GitHub</a>
        </nav>
      </footer>
    </main>
  )
}
export function mountApp(host: HTMLElement) {
  return render(() => <App />, host)
}
const host = document.querySelector('#app')
if (host instanceof HTMLElement) mountApp(host)
