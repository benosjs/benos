import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserHistory, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { createAppRouter } from './routes.js'

const root = document.getElementById('app')
if (!root) throw new Error('Missing #app')
const router = createAppRouter(createBrowserHistory())
createRoot(root).render(
  <QueryClientProvider client={router.options.context.queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
