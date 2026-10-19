export interface Project {
  id: string
  name: string
}

export async function loadProject(
  id: string,
  signal: AbortSignal,
): Promise<Project> {
  if (signal.aborted) throw signal.reason
  return { id, name: `Project ${id}` }
}
