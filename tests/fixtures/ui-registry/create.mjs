import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { URL, pathToFileURL } from 'node:url'

const fixture = JSON.parse(
  await readFile(new URL('./items.json', import.meta.url), 'utf8'),
)

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function createFixtureRegistry(directory) {
  const root = resolve(directory)
  const itemsDirectory = resolve(root, 'items')
  const entries = []
  await mkdir(itemsDirectory, { recursive: true })

  for (const source of fixture.items) {
    const item = {
      schemaVersion: 1,
      release: fixture.release,
      ...source,
      files: source.files.map((file) => ({
        ...file,
        checksum: digest(Buffer.from(file.content, 'utf8')),
      })),
    }
    const itemBytes = Buffer.from(json(item), 'utf8')
    const itemPath = resolve(itemsDirectory, `${item.name}.json`)
    await mkdir(dirname(itemPath), { recursive: true })
    await writeFile(itemPath, itemBytes)
    entries.push({
      name: item.name,
      type: item.type,
      title: item.title,
      description: item.description,
      url: pathToFileURL(itemPath).href,
      dependencies: item.dependencies,
      registryDependencies: item.registryDependencies,
      checksum: digest(itemBytes),
    })
  }

  const indexPath = resolve(root, 'index.json')
  await writeFile(
    indexPath,
    json({ schemaVersion: 1, release: fixture.release, items: entries }),
  )
  return pathToFileURL(indexPath).href
}
