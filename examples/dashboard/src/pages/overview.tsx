/** @jsxImportSource @benosjs/dom */

import { computed, effect, onCleanup, signal } from '@benosjs/core'
import { ErrorBoundary, Show } from '@benosjs/dom'
import { Button } from '../../../../registry/source/components/button.js'
import { Card } from '../../../../registry/source/components/card.js'

type AsyncState =
  | { kind: 'pending' }
  | { kind: 'ready'; message: string; updatedAt: string }
  | { kind: 'failed'; error: string }

function readyMessage(state: AsyncState): string {
  return state.kind === 'ready' ? state.message : ''
}

function updatedAt(state: AsyncState): string {
  return state.kind === 'ready' ? state.updatedAt : ''
}

function errorMessage(state: AsyncState): string {
  return state.kind === 'failed' ? state.error : 'Request failed.'
}

function AsyncStatusCard() {
  const endpoint = signal('/dashboard-data.json')
  const state = signal<AsyncState>({ kind: 'pending' })
  effect(() => {
    const controller = new AbortController()
    const url = endpoint()
    state.set({ kind: 'pending' })
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        const value: unknown = await response.json()
        if (
          typeof value !== 'object' ||
          value === null ||
          !('message' in value) ||
          !('updatedAt' in value) ||
          typeof value.message !== 'string' ||
          typeof value.updatedAt !== 'string'
        )
          throw new Error('The service response has an invalid shape.')
        state.set({
          kind: 'ready',
          message: value.message,
          updatedAt: value.updatedAt,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        state.set({
          kind: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      })
    onCleanup(() => controller.abort())
  })
  return (
    <Card>
      <p class="eyebrow">Fetch + signals</p>
      <h2>Service status</h2>
      <Show
        when={state().kind === 'pending'}
        fallback={
          <Show
            when={state().kind === 'failed'}
            fallback={
              <Show
                when={state().kind === 'ready'}
                fallback={<p>Waiting for the service.</p>}
              >
                <p>{readyMessage(state())}</p>
                <p class="form-status">Updated {updatedAt(state())}</p>
              </Show>
            }
          >
            <p role="alert">{errorMessage(state())}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => endpoint.set('/dashboard-data.json')}
            >
              Retry
            </Button>
          </Show>
        }
      >
        <p role="status" aria-busy="true">
          Loading service data…
        </p>
      </Show>
      <Button
        class="overview-action"
        variant="ghost"
        size="sm"
        onClick={() => endpoint.set('/dashboard-missing.json')}
      >
        Simulate a failed request
      </Button>
    </Card>
  )
}

function BrokenPanel(props: {
  shouldFail: ReturnType<typeof signal<boolean>>
}) {
  if (props.shouldFail())
    throw new Error('The intentionally broken panel failed.')
  return <p>The nested panel is healthy.</p>
}

function ErrorDemo() {
  const shouldFail = signal(false)
  const resetKeys = computed(() => [shouldFail()])
  return (
    <Card>
      <p class="eyebrow">Nested ownership</p>
      <h2>Error boundary</h2>
      <ErrorBoundary
        resetKeys={resetKeys()}
        fallback={(error, reset) => (
          <div role="alert">
            <p>{error instanceof Error ? error.message : String(error)}</p>
            <Button
              size="sm"
              onClick={() => {
                shouldFail.set(false)
                reset()
              }}
            >
              Reset panel
            </Button>
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
      <Button variant="outline" size="sm" onClick={() => shouldFail.set(true)}>
        Trigger failure
      </Button>
    </Card>
  )
}

export default function OverviewPage() {
  return (
    <>
      <p class="eyebrow">Operations overview</p>
      <h1>Good morning, Ada</h1>
      <p class="page-intro">
        A multi-page app showing typed navigation, route loaders, reusable UI,
        and signal-backed dashboard state.
      </p>
      <div class="dashboard-grid">
        <Card>
          <p class="eyebrow">Active projects</p>
          <p class="summary-stat">4</p>
          <p>
            Open the project workspace to see loader-backed list and detail
            routes.
          </p>
        </Card>
        <AsyncStatusCard />
        <ErrorDemo />
      </div>
    </>
  )
}
