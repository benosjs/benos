/**
 * The same checks as schema.ts, hand-written against Standard Schema v1, so the
 * size comparison can measure each stack without Zod.
 */
import type { EditProject } from './project.js'

type Issue = { message: string; path: [keyof EditProject] }

export const editSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'flagship',
    validate(input: unknown) {
      const value = input as EditProject
      const name = value.name.trim()
      const issues: Issue[] = []
      if (name.length < 2)
        issues.push({
          message: 'Names need at least two characters.',
          path: ['name'],
        })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.ownerEmail))
        issues.push({
          message: 'Enter a valid email address.',
          path: ['ownerEmail'],
        })
      return issues.length
        ? { issues }
        : { value: { name, ownerEmail: value.ownerEmail } }
    },
    types: undefined as unknown as { input: EditProject; output: EditProject },
  },
}
