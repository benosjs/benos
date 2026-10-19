// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { signal } from '@benosjs/core'
import { jsx, render, Show } from '@benosjs/dom'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  Outlet,
  route,
  RouterOutlet,
} from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

type Variant = { lazy: boolean; loader: boolean }
const variants: Variant[] = [
  { lazy: false, loader: false },
  { lazy: false, loader: true },
  { lazy: true, loader: false },
  { lazy: true, loader: true },
]

describe('nested child outlet replacement', () => {
  for (const v of variants) {
    it(`replaces a nested index child with a sibling detail child (lazy=${v.lazy}, loader=${v.loader})`, async () => {
      const root = route('/')
      const projects = route('/projects')
      const list = v.loader
        ? route('/projects', { loader: async () => ['a', 'b'] })
        : route('/projects')
      const detail = v.loader
        ? route('/projects/:id', {
            loader: async ({ params }) => ({ id: params.id }),
          })
        : route('/projects/:id')
      const List = () => jsx('p', { id: 'list', children: 'List' })
      const expanded = signal(false)
      const Detail = () =>
        jsx(Show, {
          get when() {
            return expanded()
          },
          fallback: jsx('p', {
            id: 'detail',
            get children() {
              return `Detail ${detail.match().params().id}`
            },
          }),
          children: jsx('p', { id: 'expanded', children: 'Expanded' }),
        })
      const view = (c: () => unknown) =>
        v.lazy
          ? { lazy: async () => ({ default: c as () => never }) }
          : { component: c as () => never }
      const router = createRouter({
        history: memoryHistory({ initialEntries: ['/projects'] }),
        routes: [
          mountRoute(root, {
            component: () => jsx('main', { children: jsx(Outlet, {}) }),
            children: [
              mountRoute(projects, {
                component: () => jsx('section', { children: jsx(Outlet, {}) }),
                children: [
                  mountRoute(list, { index: true, ...view(List) }),
                  mountRoute(detail, view(Detail)),
                ],
              }),
            ],
          }),
        ],
      })
      roots.push(render(() => jsx(RouterOutlet, { router }), document.body))
      await settle()
      expect(document.querySelector('#list')?.textContent).toBe('List')

      const result = await router.navigate({ to: detail, params: { id: '7' } })
      await settle()
      expect(result.status).toBe('committed')
      expect(document.querySelector('#list')).toBeNull()
      expect(document.querySelector('section > #detail')?.textContent).toBe(
        'Detail 7',
      )
      expanded.set(true)
      expect(document.querySelector('section > #expanded')?.textContent).toBe(
        'Expanded',
      )
      expanded.set(false)
      expect(document.querySelector('section > #detail')?.textContent).toBe(
        'Detail 7',
      )

      await router.navigate({ to: list })
      await settle()
      expect(document.querySelector('#detail')).toBeNull()
      expect(document.querySelector('section > #list')?.textContent).toBe(
        'List',
      )
      expect(document.querySelectorAll('section').length).toBe(1)
    })
  }
})
