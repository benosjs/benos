export interface Project {
  id: string
  name: string
  team: string
  owner: string
  status: 'healthy' | 'attention' | 'paused'
  summary: string
  updatedAt: string
  openIssues: number
  starred: boolean
}

const seed: readonly Project[] = [
  {
    id: 'signals',
    name: 'Signal runtime',
    team: 'Core',
    owner: 'Ada Lovelace',
    status: 'healthy',
    summary: 'Fine-grained state, computed values, and effect scheduling.',
    updatedAt: '2026-10-14',
    openIssues: 3,
    starred: true,
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
    starred: false,
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
    starred: false,
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
    starred: false,
  },
]

/**
 * An in-memory stand-in for a project API. Each call waits like a network
 * request, honors its AbortSignal, and returns copies, so the query cache
 * owns what the UI shows.
 */
const server = new Map(seed.map((project) => [project.id, { ...project }]))

/** Request log read by the browser tests to prove cache hits. */
export const requestLog: string[] = []
if (typeof window !== 'undefined') window.__dashboardRequests = requestLog

function respond<T>(
  label: string,
  signal: AbortSignal,
  work: () => T,
  delay = 90,
): Promise<T> {
  requestLog.push(label)
  return new Promise((resolve, reject) => {
    const cancelled = () =>
      new DOMException('The request was cancelled.', 'AbortError')
    if (signal.aborted) {
      reject(cancelled())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      try {
        resolve(work())
      } catch (error) {
        reject(error)
      }
    }, delay)
    const abort = () => {
      clearTimeout(timer)
      reject(cancelled())
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

export function getProjects(signal: AbortSignal): Promise<readonly Project[]> {
  return respond('GET /projects', signal, () =>
    [...server.values()].map((project) => ({ ...project })),
  )
}

export interface Activity {
  id: string
  when: string
  text: string
}

const activity: Record<string, readonly Activity[]> = {
  signals: [
    { id: 'a1', when: '2026-10-14', text: 'Scheduler batching landed.' },
    { id: 'a2', when: '2026-10-11', text: 'Computed caching audited.' },
    { id: 'a3', when: '2026-10-08', text: 'Ownership docs rewritten.' },
  ],
  renderer: [
    { id: 'b1', when: '2026-10-12', text: 'Keyed list diff tightened.' },
  ],
  router: [{ id: 'c1', when: '2026-10-15', text: 'Loader retries shipped.' }],
  registry: [],
}

/**
 * The slow call: 600 ms, three times a normal request. A page that waits for
 * it blocks on the slowest data; a streamed page sends everything else first
 * and patches the activity in when it arrives.
 */
export function getActivity(
  id: string,
  signal: AbortSignal,
): Promise<readonly Activity[]> {
  return respond(
    `GET /projects/${id}/activity`,
    signal,
    () => (activity[id] ?? []).map((entry) => ({ ...entry })),
    600,
  )
}

export function getProject(
  id: string,
  signal: AbortSignal,
): Promise<Project | null> {
  return respond(`GET /projects/${id}`, signal, () => {
    const project = server.get(id)
    return project ? { ...project } : null
  })
}

export interface ProjectEdit {
  name: string
  owner: string
}

/** A 422 whose `issues` follow Standard Schema, so a form maps them to fields. */
function invalid(message: string, path: string): Error {
  return Object.assign(httpError(422, message), {
    issues: [{ message, path: [path] }],
  })
}

export function putProject(
  id: string,
  values: ProjectEdit,
  signal: AbortSignal,
): Promise<Project> {
  return respond(
    `PUT /projects/${id}`,
    signal,
    () => {
      const project = server.get(id)
      if (!project) throw httpError(404, 'This project no longer exists.')
      const name = values.name.trim()
      if (name.length < 2)
        throw invalid('Names need at least two characters.', 'name')
      for (const other of server.values())
        if (other.id !== id && other.name.toLowerCase() === name.toLowerCase())
          throw invalid('Another project already uses this name.', 'name')
      project.name = name
      project.owner = values.owner.trim()
      project.updatedAt = '2026-10-22'
      return { ...project }
    },
    250,
  )
}

export function putProjectStar(
  id: string,
  starred: boolean,
  signal: AbortSignal,
): Promise<Project> {
  return respond(
    `PUT /projects/${id}/star`,
    signal,
    () => {
      const project = server.get(id)
      if (!project) throw httpError(404, 'This project no longer exists.')
      if (project.status === 'paused')
        throw httpError(409, 'Paused projects cannot be starred.')
      project.starred = starred
      return { ...project }
    },
    250,
  )
}
