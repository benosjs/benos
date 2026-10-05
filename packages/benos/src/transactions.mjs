import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { digest } from './registry.mjs'

async function ensureTransactionDirectory(root) {
  const base = resolve(root, '.benos')
  const directory = resolve(base, 'transactions')
  for (const path of [base, directory]) {
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(`Refusing unsafe transaction directory: ${path}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  await mkdir(directory, { recursive: true })
  const rootReal = await realpath(root)
  const directoryReal = await realpath(directory)
  const rel = relative(rootReal, directoryReal)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Transaction directory resolves outside the project root.')
  return directory
}

function targetPath(root, relativePath) {
  const absolute = resolve(root, ...relativePath.split('/'))
  const rel = relative(resolve(root), absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(
      `Transaction target escapes the project root: ${relativePath}`,
    )
  return absolute
}

async function readTarget(absolute) {
  try {
    const stat = await lstat(absolute)
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(`Refusing non-regular transaction target: ${absolute}`)
    return await readFile(absolute)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function replaceFile(path, bytes) {
  const temporary = `${path}.${randomUUID()}.benos-tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, bytes, { flag: 'wx' })
  await rename(temporary, path)
}

export async function applyComponentTransaction(
  root,
  component,
  fileWrites,
  nextLockBytes,
  options = {},
) {
  const directory = await ensureTransactionDirectory(root)
  const id = `${component}-${randomUUID()}`
  const transaction = resolve(directory, id)
  await mkdir(transaction)

  const lockPath = resolve(root, 'benos.lock.json')
  const beforeLock = await readTarget(lockPath)
  if (!beforeLock)
    throw new Error('Cannot update components without benos.lock.json.')
  await writeFile(resolve(transaction, 'lock.before'), beforeLock, {
    flag: 'wx',
  })
  await writeFile(resolve(transaction, 'lock.after'), nextLockBytes, {
    flag: 'wx',
  })

  const records = []
  for (const [index, file] of fileWrites.entries()) {
    const absolute = targetPath(root, file.relative)
    const before = await readTarget(absolute)
    const beforeHash = before ? digest(before) : null
    const after = Buffer.from(file.content, 'utf8')
    await writeFile(resolve(transaction, `file-${index}.after`), after, {
      flag: 'wx',
    })
    if (before)
      await writeFile(resolve(transaction, `file-${index}.before`), before, {
        flag: 'wx',
      })
    records.push({
      target: file.relative,
      staged: `file-${index}.after`,
      backup: before ? `file-${index}.before` : null,
      beforeHash,
      afterHash: digest(after),
    })
  }

  const journal = {
    schemaVersion: 1,
    component,
    state: 'prepared',
    lock: {
      beforeHash: digest(beforeLock),
      afterHash: digest(nextLockBytes),
    },
    files: records,
  }
  const journalTemp = resolve(transaction, `journal.${randomUUID()}.tmp`)
  await writeFile(journalTemp, `${JSON.stringify(journal, null, 2)}\n`, {
    flag: 'wx',
  })
  await rename(journalTemp, resolve(transaction, 'journal.json'))

  for (const [index, record] of records.entries()) {
    const absolute = targetPath(root, record.target)
    const current = await readTarget(absolute)
    if ((current ? digest(current) : null) !== record.beforeHash)
      throw new Error(
        `Component file changed while update was being applied: ${record.target}. Transaction is recoverable; run benos update again.`,
      )
    await mkdir(dirname(absolute), { recursive: true })
    await rename(resolve(transaction, record.staged), absolute)
    if (options.afterFileWrite) await options.afterFileWrite(index + 1)
  }

  const currentLock = await readTarget(lockPath)
  if (!currentLock || digest(currentLock) !== journal.lock.beforeHash)
    throw new Error(
      'benos.lock.json changed while update was being applied. Transaction is recoverable; run benos update again.',
    )
  await rename(resolve(transaction, 'lock.after'), lockPath)
  await rm(transaction, { recursive: true, force: true })
}

async function restoreTarget(root, transaction, record) {
  const absolute = targetPath(root, record.target)
  const current = await readTarget(absolute)
  const currentHash = current ? digest(current) : null
  if (currentHash === record.beforeHash) return
  if (currentHash !== record.afterHash) {
    throw new Error(
      `Cannot recover interrupted update: ${record.target} has changed since interruption. The transaction and user file were preserved.`,
    )
  }
  if (record.backup) {
    const backup = await readFile(resolve(transaction, record.backup))
    if (digest(backup) !== record.beforeHash)
      throw new Error(`Transaction backup is corrupt for ${record.target}.`)
    await replaceFile(absolute, backup)
  } else {
    await unlink(absolute)
  }
}

export async function findIncompleteUpdates(root) {
  const directory = resolve(root, '.benos/transactions')
  let entries
  try {
    const stat = await lstat(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory())
      throw new Error(`Refusing unsafe transaction directory: ${directory}`)
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const pending = []
  for (const entry of entries) {
    if (!entry.isDirectory())
      throw new Error(`Unexpected entry in Benos transactions: ${entry.name}`)
    const journal = resolve(directory, entry.name, 'journal.json')
    try {
      const data = JSON.parse(await readFile(journal, 'utf8'))
      pending.push({ id: entry.name, component: data?.component ?? entry.name })
    } catch (error) {
      if (error.code === 'ENOENT') {
        pending.push({ id: entry.name, component: entry.name })
        continue
      }
      throw new Error(
        `Cannot inspect interrupted update ${journal}: ${error.message}`,
        {
          cause: error,
        },
      )
    }
  }
  return pending
}

export async function recoverIncompleteUpdates(root) {
  let directory
  try {
    directory = await ensureTransactionDirectory(root)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const recovered = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory())
      throw new Error(`Unexpected entry in Benos transactions: ${entry.name}`)
    const transaction = resolve(directory, entry.name)
    const journalPath = resolve(transaction, 'journal.json')
    let journal
    try {
      journal = JSON.parse(await readFile(journalPath, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') {
        await rm(transaction, { recursive: true, force: true })
        continue
      }
      throw new Error(
        `Cannot read interrupted update journal ${journalPath}: ${error.message}`,
        { cause: error },
      )
    }
    if (
      journal?.schemaVersion !== 1 ||
      journal.state !== 'prepared' ||
      typeof journal.component !== 'string' ||
      !Array.isArray(journal.files)
    ) {
      throw new Error(`Unsupported interrupted update journal: ${journalPath}`)
    }
    const lockPath = resolve(root, 'benos.lock.json')
    const currentLock = await readTarget(lockPath)
    const currentLockHash = currentLock ? digest(currentLock) : null
    if (currentLockHash === journal.lock?.afterHash) {
      await rm(transaction, { recursive: true, force: true })
      recovered.push(`${journal.component}: completed`)
      continue
    }
    if (currentLockHash !== journal.lock?.beforeHash)
      throw new Error(
        `Cannot recover interrupted update for ${journal.component}: benos.lock.json changed. The journal and all files were preserved.`,
      )
    for (const record of [...journal.files].reverse())
      await restoreTarget(root, transaction, record)
    await rm(transaction, { recursive: true, force: true })
    recovered.push(`${journal.component}: rolled back`)
  }
  return recovered
}
