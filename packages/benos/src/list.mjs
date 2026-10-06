/* global console */

import process from 'node:process'
import { loadIndex } from './registry.mjs'
import { findProjectRoot } from './project.mjs'
import { readUiConfig, readUiLock } from './cli-utils.mjs'

export async function listItems(options) {
  const root = await findProjectRoot(options.cwd ?? process.cwd())
  const lock = await readUiLock(root)
  if (options.installed) {
    const installed = Object.entries(lock.items)
    if (installed.length === 0) {
      console.log('No UI registry components are installed.')
      return
    }
    console.log('Installed UI components:')
    for (const [name, item] of installed) {
      const files = Array.isArray(item.files)
        ? item.files.map((file) => file.target).join(', ')
        : 'file state unavailable'
      console.log(`- ${name}@${item.version}: ${item.description}; ${files}`)
    }
    return
  }

  const config = await readUiConfig(root)
  const { index } = await loadIndex(root, options.registry ?? config.registry)
  if (index.items.length === 0) {
    console.log(
      `Benos UI registry ${index.release} has no published items yet.`,
    )
    return
  }
  console.log(`Available UI components (registry ${index.release}):`)
  for (const item of index.items) {
    const installed = lock.items[item.name]
    const dependencies = item.dependencies
      .map((dependency) => `${dependency.name}@${dependency.version}`)
      .join(', ')
    const state = installed ? `installed ${installed.version}` : 'not installed'
    console.log(
      `- ${item.name}: ${item.description}; ${dependencies || 'no npm dependencies'}; ${state}`,
    )
  }
}
