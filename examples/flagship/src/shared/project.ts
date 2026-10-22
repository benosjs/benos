/**
 * The transports both stacks share: an in-memory server with a short delay.
 * Tests reach the server through `api` to change records and hold responses.
 */
export interface Project {
  id: string
  name: string
  ownerEmail: string
  updatedAt: number
}
export interface EditProject {
  name: string
  ownerEmail: string
}

const seed: readonly Project[] = [
  { id: 'atlas', name: 'Atlas', ownerEmail: 'ada@example.com', updatedAt: 1 },
  {
    id: 'beacon',
    name: 'Beacon',
    ownerEmail: 'grace@example.com',
    updatedAt: 1,
  },
]

export const api = {
  projects: new Map(seed.map((project) => [project.id, { ...project }])),
  log: [] as string[],
  delay: 50,
  /** While set, responses wait for it. */
  hold: undefined as Promise<void> | undefined,
  reset() {
    api.projects = new Map(seed.map((project) => [project.id, { ...project }]))
    api.log = []
    api.delay = 50
    api.hold = undefined
  },
}

function respond<T>(
  request: string,
  work: () => T,
  signal?: AbortSignal,
): Promise<T> {
  api.log.push(request)
  const hold = api.hold
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      void Promise.resolve(hold).then(() => {
        try {
          resolve(work())
        } catch (error) {
          reject(error)
        }
      })
    }, api.delay)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

export function getProject(id: string, signal: AbortSignal): Promise<Project> {
  return respond(
    `GET /projects/${id}`,
    () => {
      const project = api.projects.get(id)
      if (!project) throw httpError(404, 'No such project.')
      return { ...project }
    },
    signal,
  )
}

export function putProject(id: string, values: EditProject): Promise<Project> {
  return respond(`PUT /projects/${id}`, () => {
    const project = api.projects.get(id)
    if (!project) throw httpError(404, 'This project no longer exists.')
    if (values.name === 'Locked')
      throw httpError(409, 'This project is locked.')
    const saved = { ...project, ...values, updatedAt: project.updatedAt + 1 }
    api.projects.set(id, saved)
    return { ...saved }
  })
}
