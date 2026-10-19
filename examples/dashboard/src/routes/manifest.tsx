/** @jsxImportSource @benosjs/dom */

import { browserHistory, createRouter, mountRoute } from '@benosjs/router'
import {
  homeRoute,
  projectRoute,
  projectsIndexRoute,
  projectsRoute,
  recordsRoute,
  rootRoute,
  settingsRoute,
} from './refs.js'

export const router = createRouter({
  history: browserHistory(),
  routes: [
    mountRoute(rootRoute, {
      lazy: () => import('../layouts/app-layout.js'),
      pending: () => (
        <p class="route-pending" role="status">
          Loading dashboard…
        </p>
      ),
      children: [
        mountRoute(homeRoute, {
          index: true,
          lazy: () => import('../pages/overview.js'),
        }),
        mountRoute(projectsRoute, {
          lazy: () => import('../layouts/projects-layout.js'),
          children: [
            mountRoute(projectsIndexRoute, {
              index: true,
              lazy: () => import('../pages/projects.js'),
              error: (failure) => (
                <section class="route-error" role="alert">
                  <p>Projects could not load: {String(failure.error)}</p>
                  <button onClick={failure.retry}>Retry</button>
                </section>
              ),
            }),
            mountRoute(projectRoute, {
              lazy: () => import('../pages/project-detail.js'),
              error: (failure) => (
                <section class="route-error" role="alert">
                  <p>Project details could not load: {String(failure.error)}</p>
                  <button onClick={failure.retry}>Retry</button>
                </section>
              ),
            }),
          ],
        }),
        mountRoute(recordsRoute, { lazy: () => import('../pages/records.js') }),
        mountRoute(settingsRoute, {
          lazy: () => import('../pages/settings.js'),
        }),
      ],
    }),
  ],
  notFound: () => (
    <section class="not-found" aria-labelledby="not-found-title">
      <p class="eyebrow">404 · Page not found</p>
      <h1 id="not-found-title">This route does not exist</h1>
      <p>Choose a page from the dashboard navigation.</p>
      <a class="benos-button benos-button--primary benos-button--md" href="/">
        Back to overview
      </a>
    </section>
  ),
})
