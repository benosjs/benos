/** @jsxImportSource @benosjs/dom */

import { signal } from '@benosjs/core'
import { Show } from '@benosjs/dom'
import { Link, Outlet } from '@benosjs/router'
import { Button } from '../../../../registry/source/components/button.js'
import {
  homeRoute,
  projectsRoute,
  recordsRoute,
  settingsRoute,
} from '../routes/refs.js'

interface User {
  name: string
  role: string
}

export default function AppLayout() {
  const user = signal<User | null>({ name: 'Ada Lovelace', role: 'admin' })
  const helpOpen = signal(false)
  return (
    <div class="dashboard-shell">
      <header class="topbar">
        <Link class="brand-link" to={homeRoute}>
          <span class="brand-mark" aria-hidden="true">
            B
          </span>
          <span>
            Benos <strong>operations</strong>
          </span>
        </Link>
        <div class="account-tools">
          <Show
            when={user()}
            fallback={
              <Button
                size="sm"
                onClick={() =>
                  user.set({ name: 'Ada Lovelace', role: 'admin' })
                }
              >
                Sign in
              </Button>
            }
          >
            {(currentUser) => (
              <span class="account-label">
                {currentUser().name}{' '}
                <span class="account-role">{currentUser().role}</span>
              </span>
            )}
          </Show>
          <Button variant="ghost" size="sm" onClick={() => helpOpen.set(true)}>
            Help
          </Button>
          <Button variant="outline" size="sm" onClick={() => user.set(null)}>
            Sign out
          </Button>
        </div>
      </header>
      <nav class="primary-nav" aria-label="Primary navigation">
        <Link to={homeRoute} active="exact">
          Overview
        </Link>
        <Link to={projectsRoute} active="descendant">
          Projects
        </Link>
        <Link to={recordsRoute} active="exact">
          Records
        </Link>
        <Link to={settingsRoute} active="exact">
          Settings
        </Link>
      </nav>
      <main class="dashboard-main">
        <Outlet />
      </main>
      <footer class="dashboard-footer">
        <span>Demo data only</span>
        <span>Built with Benos signals and typed routes</span>
      </footer>
      <Show when={helpOpen()}>
        <div class="modal-backdrop">
          <section
            class="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <h2 id="help-title">Dashboard help</h2>
            <p>
              Use the navigation to explore loader-backed routes, the sortable
              table, and the profile form.
            </p>
            <div class="modal-actions">
              <Button onClick={() => helpOpen.set(false)}>Close</Button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  )
}
