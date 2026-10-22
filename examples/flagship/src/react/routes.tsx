import { QueryClient, queryOptions } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'
import { getProject } from '../shared/project.js'

// The shadcn/ui build aliases ./native.js to ./shadcn.js.
// #region flagship
export const projectOptions = (id: string) =>
  queryOptions({
    queryKey: ['project', id],
    queryFn: ({ signal }) => getProject(id, signal),
  })
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()()
export const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectOptions(params.projectId)),
  pendingComponent: () => <p role="status">Loading project…</p>,
  errorComponent: ({ reset }) => (
    <button onClick={reset}>Could not load project. Retry</button>
  ),
  component: lazyRouteComponent(() => import('./native.js')),
})
export const createAppRouter = (history: RouterHistory) =>
  createRouter({
    routeTree: rootRoute.addChildren([projectRoute]),
    context: { queryClient: new QueryClient() },
    history,
  })
// #endregion
