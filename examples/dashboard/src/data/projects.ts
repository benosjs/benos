export interface Project {
  id: string
  name: string
  team: string
  owner: string
  status: 'healthy' | 'attention' | 'paused'
  summary: string
  updatedAt: string
  openIssues: number
}

const projects: readonly Project[] = [
  {
    id: 'signals',
    name: 'Signal runtime',
    team: 'Core',
    owner: 'Ada Lovelace',
    status: 'healthy',
    summary: 'Fine-grained state, computed values, and effect scheduling.',
    updatedAt: '2026-10-14',
    openIssues: 3,
  },
  {
    id: 'renderer',
    name: 'DOM renderer',
    team: 'DOM',
    owner: 'Grace Hopper',
    status: 'attention',
    summary: 'Compiled templates, keyed lists, and accessible control flow.',
    updatedAt: '2026-10-12',
    openIssues: 8,
  },
  {
    id: 'router',
    name: 'Typed router',
    team: 'Routing',
    owner: 'Margaret Hamilton',
    status: 'healthy',
    summary: 'Typed route references, loaders, history, and pending states.',
    updatedAt: '2026-10-15',
    openIssues: 2,
  },
  {
    id: 'registry',
    name: 'UI registry',
    team: 'Design systems',
    owner: 'Katherine Johnson',
    status: 'paused',
    summary: 'Accessible source-owned components and safe update workflows.',
    updatedAt: '2026-10-10',
    openIssues: 5,
  },
]

function waitForLoader(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The request was cancelled.', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 90)
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The request was cancelled.', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function loadProjects(input: {
  signal: AbortSignal
}): Promise<readonly Project[]> {
  await waitForLoader(input.signal)
  return projects
}

export async function loadProject(input: {
  params: Readonly<{ projectId: string }>
  signal: AbortSignal
}): Promise<Project | null> {
  await waitForLoader(input.signal)
  return (
    projects.find((project) => project.id === input.params.projectId) ?? null
  )
}
