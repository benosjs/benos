/** @jsxImportSource @benosjs/dom */

import { computed, effect, onCleanup, signal, type Signal } from '@benosjs/core'
import {
  ErrorBoundary,
  For,
  Show,
  children,
  render,
  splitProps,
  type Child,
} from '@benosjs/dom'

interface User {
  name: string
  role: string
}

interface Row {
  id: number
  name: string
  team: string
  value: number
}

type Route = 'overview' | 'records' | 'settings'
type SortKey = 'id' | 'name' | 'value'

type AsyncState<T> =
  | { kind: 'disabled' }
  | { kind: 'pending' }
  | { kind: 'ready'; value: T }
  | { kind: 'failed'; error: unknown }

interface DashboardData {
  message: string
  updatedAt: string
}

function makeRows(count: number): Row[] {
  const teams = ['Core', 'DOM', 'Compiler', 'Tooling', 'Examples']
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Record ${String(index + 1).padStart(5, '0')}`,
    team: teams[index % teams.length] ?? 'Core',
    value: ((index * 37) % 997) + 3,
  }))
}

function useAsyncDashboardData(endpoint: Signal<string>) {
  const state = signal<AsyncState<DashboardData>>({ kind: 'disabled' })
  effect(() => {
    const url = endpoint()
    const controller = new AbortController()
    state.set({ kind: 'pending' })
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        return parseDashboardData(await response.json())
      })
      .then((value) => state.set({ kind: 'ready', value }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        state.set({ kind: 'failed', error })
      })
    onCleanup(() => controller.abort())
  })
  return state
}

function parseDashboardData(value: unknown): DashboardData {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('message' in value) ||
    !('updatedAt' in value) ||
    typeof value.message !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    throw new Error('The dashboard response has an invalid shape.')
  return { message: value.message, updatedAt: value.updatedAt }
}

function asyncReadyMessage(value: AsyncState<DashboardData>): string {
  return value.kind === 'ready' ? value.value.message : ''
}

function asyncErrorMessage(value: AsyncState<DashboardData>): string {
  if (value.kind !== 'failed') return 'The request failed.'
  return value.error instanceof Error
    ? value.error.message
    : 'The request failed.'
}

function isSortKey(value: string): value is SortKey {
  return value === 'id' || value === 'name' || value === 'value'
}

function Navigation(props: { route: Signal<Route> }) {
  const links: readonly [Route, string][] = [
    ['overview', 'Overview'],
    ['records', 'Records'],
    ['settings', 'Settings'],
  ]
  return (
    <nav aria-label="Primary">
      {links.map(([route, label]) => (
        <a
          href={`#${route}`}
          aria-current={props.route() === route ? 'page' : undefined}
          onClick={(event) => {
            event.preventDefault()
            props.route.set(route)
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

function TopBar(props: { user: Signal<User | null>; onLogout: () => void }) {
  return (
    <div>
      <span>Benos operations</span>
      <span>
        Signed in as <span>{props.user()?.name}</span>
      </span>
      <button onClick={props.onLogout}>Sign out</button>
    </div>
  )
}

function LoginPanel(props: { onLogin: () => void }) {
  return (
    <section aria-labelledby="login-title">
      <h1 id="login-title">Sign in to the mock dashboard</h1>
      <p>
        This example uses a local user signal instead of a real identity
        provider.
      </p>
      <button onClick={props.onLogin}>Continue as Ada</button>
    </section>
  )
}

function ValidatedForm() {
  const name = signal('Ada Lovelace')
  const email = signal('ada@example.test')
  const submitted = signal(false)
  const errors = computed(() => ({
    name: name().trim().length < 2 ? 'Name needs at least two characters.' : '',
    email: email().includes('@') ? '' : 'Enter an email address.',
  }))
  const status = computed(() => {
    if (!submitted()) return 'Fill in the fields and submit.'
    const current = errors()
    return current.name || current.email
      ? 'Please correct the form.'
      : 'Saved locally.'
  })
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    submitted.set(true)
  }
  return (
    <form onSubmit={submit} aria-labelledby="profile-title">
      <h2 id="profile-title">Profile form</h2>
      <label>
        Name
        <input
          name="name"
          value={name()}
          onInput={(event) => name.set(event.currentTarget.value)}
        />
      </label>
      <p>{errors().name}</p>
      <label>
        Email
        <input
          name="email"
          type="text"
          value={email()}
          onInput={(event) => email.set(event.currentTarget.value)}
        />
      </label>
      <p>{errors().email}</p>
      <button type="submit">Save profile</button>
      <p>{status()}</p>
    </form>
  )
}

function DataCard(props: { title: string; children?: Child }) {
  const [titleProps] = splitProps(props, ['title'])
  return (
    <section class="card">
      <h2>{titleProps.title}</h2>
      {children(() => props.children)()}
    </section>
  )
}

function AsyncCard(props: { endpoint: Signal<string>; onRetry: () => void }) {
  const state = useAsyncDashboardData(props.endpoint)
  return (
    <DataCard title="Async service status">
      <Show
        when={state().kind === 'pending'}
        fallback={
          <Show
            when={state().kind === 'failed'}
            fallback={
              <Show
                when={state().kind === 'ready'}
                fallback={<p>Async data is disabled.</p>}
              >
                <p>{asyncReadyMessage(state())}</p>
              </Show>
            }
          >
            <p>{asyncErrorMessage(state())}</p>
            <button onClick={props.onRetry}>Retry healthy endpoint</button>
          </Show>
        }
      >
        <p aria-busy="true">Loading service data…</p>
      </Show>
    </DataCard>
  )
}

function Modal(props: {
  open: Signal<boolean>
  onClose: () => void
  children?: Child
}) {
  return (
    <Show when={props.open()}>
      <div>
        <div class="modal-panel">
          <h2 id="modal-title">Keyboard-friendly modal</h2>
          {props.children}
          <button onClick={props.onClose}>Close</button>
        </div>
      </div>
    </Show>
  )
}

function BrokenPanel(props: { shouldFail: Signal<boolean> }) {
  if (props.shouldFail())
    throw new Error('The intentionally broken panel failed.')
  return <p>The nested panel is healthy.</p>
}

function ErrorCard() {
  const shouldFail = signal(false)
  const resetKey = computed(() => [shouldFail()])
  return (
    <DataCard title="Error boundary">
      <ErrorBoundary
        resetKeys={resetKey()}
        fallback={(error: unknown, retry: () => void) => (
          <div>
            <p>
              {error instanceof Error ? error.message : 'Unknown panel error.'}
            </p>
            <button
              onClick={() => {
                shouldFail.set(false)
                retry()
              }}
            >
              Retry panel
            </button>
          </div>
        )}
      >
        <Show
          when={shouldFail()}
          fallback={<p>The nested panel is healthy.</p>}
        >
          <BrokenPanel shouldFail={shouldFail} />
        </Show>
      </ErrorBoundary>
      <button onClick={() => shouldFail.set(true)}>
        Trigger nested failure
      </button>
    </DataCard>
  )
}

function LargeTable() {
  const rows = signal(makeRows(5000))
  const filter = signal('')
  const sort = signal<SortKey>('id')
  const descending = signal(false)
  const visibleRows = computed(() => {
    const query = filter().trim().toLowerCase()
    const result = rows().filter(
      (row) =>
        !query ||
        row.name.toLowerCase().includes(query) ||
        row.team.toLowerCase().includes(query),
    )
    const key = sort()
    const direction = descending() ? -1 : 1
    return result.slice().sort((left, right) => {
      const a = left[key]
      const b = right[key]
      return (a < b ? -1 : a > b ? 1 : 0) * direction
    })
  })
  const tableRef = signal<HTMLTableElement | null>(null)
  return (
    <section aria-labelledby="records-title">
      <div class="table-toolbar">
        <h2 id="records-title">Records ({visibleRows().length} of 5,000)</h2>
        <input
          aria-label="Filter records"
          value={filter()}
          onInput={(event) => filter.set(event.currentTarget.value)}
        />
        <select
          aria-label="Sort records"
          value={sort()}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (isSortKey(value)) sort.set(value)
          }}
        >
          <option value="id">ID</option>
          <option value="name">Name</option>
          <option value="value">Value</option>
        </select>
        <button onClick={() => descending.update((value) => !value)}>
          {descending() ? 'Ascending' : 'Descending'}
        </button>
      </div>
      <table ref={(element) => tableRef.set(element)}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Team</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <For each={visibleRows()} by={(row) => row.id}>
            {(row) => (
              <tr>
                <td>{row().id}</td>
                <td>{row().name}</td>
                <td>{row().team}</td>
                <td>{row().value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </section>
  )
}

function Overview(props: {
  endpoint: Signal<string>
  onFail: () => void
  onRetry: () => void
}) {
  return (
    <>
      <h1>Overview</h1>
      <div class="grid">
        <DataCard title="Summary">
          <p>
            Signals keep this nested card current without rerunning its parent
            component.
          </p>
        </DataCard>
        <AsyncCard endpoint={props.endpoint} onRetry={props.onRetry} />
        <ErrorCard />
      </div>
      <button onClick={props.onFail}>Load a failing async endpoint</button>
    </>
  )
}

function DashboardShell(props: {
  user: Signal<User | null>
  route: Signal<Route>
  endpoint: Signal<string>
  onLogin: () => void
  onLogout: () => void
  onFail: () => void
  onRetry: () => void
}) {
  const modalOpen = signal(false)
  return (
    <Show when={props.user()} fallback={<LoginPanel onLogin={props.onLogin} />}>
      <div class="dashboard">
        <TopBar user={props.user} onLogout={props.onLogout} />
        <Navigation route={props.route} />
        <main>
          <Show
            when={props.route() === 'records'}
            fallback={
              <Show
                when={props.route() === 'settings'}
                fallback={
                  <Overview
                    endpoint={props.endpoint}
                    onFail={props.onFail}
                    onRetry={props.onRetry}
                  />
                }
              >
                <ValidatedForm />
              </Show>
            }
          >
            <LargeTable />
          </Show>
        </main>
        <button onClick={() => modalOpen.set(true)}>Open help modal</button>
        <Modal open={modalOpen} onClose={() => modalOpen.set(false)}>
          <p>Press Close to return to the dashboard.</p>
        </Modal>
      </div>
    </Show>
  )
}

const user = signal<User | null>({ name: 'Ada Lovelace', role: 'admin' })
const route = signal<Route>('overview')
const endpoint = signal('/dashboard-data.json')
const appHost = document.querySelector('#app')
if (!(appHost instanceof HTMLElement))
  throw new Error('Dashboard host is missing')

render(
  () => (
    <DashboardShell
      user={user}
      route={route}
      endpoint={endpoint}
      onLogin={() => user.set({ name: 'Ada Lovelace', role: 'admin' })}
      onLogout={() => user.set(null)}
      onFail={() => endpoint.set('/dashboard-missing.json')}
      onRetry={() => endpoint.set('/dashboard-data.json')}
    />
  ),
  appHost,
)

window.__dashboardReady = true
