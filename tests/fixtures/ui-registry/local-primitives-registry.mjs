import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

function tarEntry(archive, wanted) {
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString().replace(/\0.*$/, '')
    const path = prefix ? `${prefix}/${name}` : name
    const size = Number.parseInt(
      header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(),
      8,
    )
    const start = offset + 512
    if (path === wanted)
      return JSON.parse(archive.subarray(start, start + size).toString())
    offset = start + Math.ceil(size / 512) * 512
  }
  throw new Error(`Packed primitives archive has no ${wanted}.`)
}

async function bodyOf(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function createLocalPackagesRegistry(tarballPaths) {
  const packages = await Promise.all(
    tarballPaths.map(async (tarballPath) => {
      const tarball = await readFile(tarballPath)
      const manifest = tarEntry(gunzipSync(tarball), 'package/package.json')
      const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`
      const packagePath = `/${manifest.name}/-/${filename}`
      return {
        tarball,
        manifest,
        packagePath,
        packument(origin) {
          return {
            name: manifest.name,
            'dist-tags': { latest: manifest.version },
            versions: {
              [manifest.version]: {
                ...manifest,
                dist: {
                  tarball: new globalThis.URL(packagePath, origin).href,
                  shasum: createHash('sha1').update(tarball).digest('hex'),
                  integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
                },
              },
            },
          }
        },
      }
    }),
  )

  const server = createServer(async (request, response) => {
    const url = new globalThis.URL(request.url ?? '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    const localPackage = packages.find(
      ({ manifest, packagePath }) =>
        pathname === `/${manifest.name}` || pathname === packagePath,
    )
    if (localPackage && pathname === `/${localPackage.manifest.name}`) {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify(
          localPackage.packument(`http://${request.headers.host}`),
        ),
      )
      return
    }
    if (localPackage && pathname === localPackage.packagePath) {
      response.setHeader('content-type', 'application/octet-stream')
      response.end(localPackage.tarball)
      return
    }

    try {
      const upstreamUrl = new globalThis.URL(
        request.url ?? '/',
        'https://registry.npmjs.org',
      )
      const headers = new globalThis.Headers(request.headers)
      headers.delete('host')
      headers.delete('authorization')
      const body =
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : await bodyOf(request)
      const upstream = await globalThis.fetch(upstreamUrl, {
        method: request.method,
        headers,
        body,
      })
      response.statusCode = upstream.status
      upstream.headers.forEach((value, name) => {
        if (
          ![
            'connection',
            'content-encoding',
            'content-length',
            'transfer-encoding',
          ].includes(name)
        )
          response.setHeader(name, value)
      })
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch (error) {
      response.statusCode = 502
      response.end(String(error))
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Local npm registry did not bind to a TCP port.')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
