/**
 * `renderToStream`: the shell once the router has settled, then one patch per
 * Suspense boundary as its opted-in data settles, then an end notice. After
 * the last patch applies, the document between the root markers equals what
 * `renderToString` produces for the same state; see docs/architecture/ssr.md,
 * "Streaming".
 */
import type { Child } from '@benosjs/dom'
import { stagesOf, type StageRecord } from './host.js'
import {
  beginRequest,
  checkPayloadSize,
  payloadScript,
  settle,
  snapshotEntries,
  stringifyPayload,
  type RenderOptions,
  type Session,
} from './render.js'
import {
  serializeChildren,
  serializeNodes,
  validateStructure,
} from './serialize.js'

export interface StreamOptions extends RenderOptions {
  /** Stamped on every inline script the stream emits, for CSP. */
  nonce?: string
  onError?: (
    error: unknown,
    info: { phase: 'setup' | 'data' | 'stream' },
  ) => void
}

export interface StreamResult {
  /** 200, or what the router set; final once `renderToStream` resolves. */
  status: number
  /** `Location` for a router redirect; otherwise empty. */
  headers: Headers
  /** The shell, then patches, then the end notice, as UTF-8. */
  stream: ReadableStream<Uint8Array>
  /** Settles when the stream closes; never rejects. */
  done: Promise<void>
}

const development = process.env.NODE_ENV !== 'production'

/**
 * The browser runtime, defined once before the first patch. `p` swaps a
 * pending boundary's fallback range for the patch's content; a hydration
 * that has registered a handler for the root takes the patch instead. `e`
 * marks the root finished. Plain ES2020; it evaluates no application data.
 */
export const RUNTIME =
  'self.__benos_s||(self.__benos_s={h:{},d:{},p(r,i){var t=document.getElementById("b:"+r+":"+i),h=this.h[r];if(!t)return;if(h)return h.p(i,t);' +
  'var w=document.createTreeWalker(document,128),c,o=null;for(;(c=w.nextNode());)if(c.data=="b:0:"+i){o=c;break}' +
  'if(o){var d=0,n=o,x;for(;;){x=n.nextSibling;if(n!==o&&n.nodeType==8){if(/^b(:|$)/.test(n.data))d++;else if(n.data=="/b"&&!d--){n.remove();break}}n.remove();if(!x)break;n=x}' +
  'x&&x.parentNode.insertBefore(t.content,x)}t.remove()},e(r){this.d[r]=1;var h=this.h[r];h&&h.e()}});' +
  'document.currentScript&&document.currentScript.remove()'

interface Streamed {
  fallback: StageRecord
  content: StageRecord
  emitted: boolean
}

/** Pairs a committed fallback (ordinal 0) with a held content (ordinal 1). */
function findStreamed(
  session: Session,
  streamed: Map<string, Streamed>,
  nextId: () => string,
): void {
  const byTarget = new Map<object, StageRecord[]>()
  for (const record of stagesOf(session.request)) {
    let list = byTarget.get(record.target)
    if (!list) byTarget.set(record.target, (list = []))
    list.push(record)
  }
  for (const list of byTarget.values()) {
    const fallback = list.find((record) => record.index === 0)
    const content = list.find((record) => record.index === 1)
    if (
      !fallback ||
      !content ||
      !fallback.committed ||
      content.committed ||
      fallback.streamed !== undefined ||
      !fallback.open
    )
      continue
    const id = nextId()
    fallback.streamed = id
    fallback.open.data = `b:0:${id}`
    streamed.set(id, { fallback, content, emitted: false })
  }
}

export async function renderToStream(
  app: () => Child,
  options: StreamOptions = {},
): Promise<StreamResult> {
  const session = beginRequest(app, options)
  const { rootId, request } = session
  const limit = options.maxPayloadBytes ?? 1_048_576
  const nonce = options.nonce ? ` nonce="${options.nonce}"` : ''
  const encoder = new TextEncoder()
  const streamed = new Map<string, Streamed>()
  let ids = 0
  const nextId = (): string => String(ids++)
  let flushedResources = 0
  let flushedQueries = 0
  let payloadBytes = 0
  /** The payload entries recorded since the last flush, or ''. */
  const payloadDelta = (): string => {
    const r = snapshotEntries(request.resources, 'resource', flushedResources)
    const q = snapshotEntries(request.queries, 'query', flushedQueries)
    flushedResources = request.resources.size
    flushedQueries = request.queries.size
    if (!r.length && !q.length) return ''
    const payload = stringifyPayload({ v: 1, r, q }, () => 'payload')
    payloadBytes += encoder.encode(payload).byteLength
    checkPayloadSize(payloadBytes, limit)
    return payload
  }

  let shellHtml: string
  try {
    await settle(session, session.shell)
    findStreamed(session, streamed, nextId)
    if (development) validateStructure(session.root)
    const html = serializeChildren(session.root)
    const payload = payloadDelta()
    shellHtml = `<!--benos:${rootId}:1-->${html}<!--/benos:${rootId}-->${payloadScript(rootId, payload)}`
  } catch (error) {
    session.dispose()
    throw error
  }

  let controller!: ReadableStreamDefaultController<Uint8Array>
  let closed = false
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      cancelled = true
    },
  })
  const write = (chunk: string): void => {
    if (closed || cancelled) return
    controller.enqueue(encoder.encode(chunk))
  }
  write(shellHtml)

  const finish = (): void => {
    if (closed) return
    closed = true
    if (!cancelled) controller.close()
    session.dispose()
  }

  let runtimeSent = false
  const flushPatches = (): void => {
    // New boundaries can appear inside content that just committed.
    findStreamed(session, streamed, nextId)
    for (const [id, entry] of streamed) {
      if (entry.emitted || !entry.content.committed) continue
      entry.emitted = true
      const html = serializeNodes(entry.content.nodes())
      const payload = payloadDelta()
      write(
        (runtimeSent ? '' : `<script${nonce}>${RUNTIME}</script>`) +
          `<template id="b:${rootId}:${id}">${html}</template>` +
          payloadScript(rootId, payload) +
          `<script${nonce}>__benos_s.p("${rootId}","${id}");document.currentScript.remove()</script>`,
      )
      runtimeSent = true
    }
  }

  const done = (async (): Promise<void> => {
    if (streamed.size === 0) {
      finish()
      return
    }
    try {
      for (;;) {
        await Promise.resolve()
        if (session.signal?.aborted || cancelled) break
        flushPatches()
        if ([...streamed.values()].every((entry) => entry.emitted)) break
        if (session.pending.size === 0) break
        try {
          await Promise.race([
            Promise.allSettled([...session.pending]),
            session.abortion,
          ])
        } catch {
          break
        }
      }
    } catch (error) {
      options.onError?.(error, { phase: 'stream' })
    }
    // Boundaries never patched fall back to the client.
    write(
      (runtimeSent ? '' : `<script${nonce}>${RUNTIME}</script>`) +
        `<script${nonce}>__benos_s.e("${rootId}");document.currentScript.remove()</script>`,
    )
    finish()
  })()

  return {
    status: session.response.status,
    headers: session.response.headers,
    stream,
    done,
  }
}
