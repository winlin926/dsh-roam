import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOBILE_STATIC_PREFIX = '/mobile/'
const MOBILE_STATIC_ROOT = fileURLToPath(new URL('../mobile/', import.meta.url))
const MOBILE_ASSET_TYPES = new Map<string, string>([
  ['index.html', 'text/html; charset=utf-8'],
  ['styles.css', 'text/css; charset=utf-8'],
  ['boot.js', 'text/javascript; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['api.js', 'text/javascript; charset=utf-8'],
  ['copy.js', 'text/javascript; charset=utf-8'],
  ['composer.js', 'text/javascript; charset=utf-8'],
  ['drawer.js', 'text/javascript; charset=utf-8'],
  ['markdown.js', 'text/javascript; charset=utf-8'],
  ['messages.js', 'text/javascript; charset=utf-8'],
  ['navigation.js', 'text/javascript; charset=utf-8'],
  ['overlays.js', 'text/javascript; charset=utf-8'],
  ['state.js', 'text/javascript; charset=utf-8'],
  ['stream.js', 'text/javascript; charset=utf-8'],
  ['transcript.js', 'text/javascript; charset=utf-8'],
  ['viewport.js', 'text/javascript; charset=utf-8']
])

/** The caller has already authorized the browser session; false leaves the route to the bridge. */
export async function serveMobileStatic(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  const rawPath = requestPath(request.url)
  if (rawPath === '/' && request.method === 'GET') {
    return await serveAsset('index.html', request, response)
  }
  if (rawPath !== '/mobile' && !rawPath.startsWith(MOBILE_STATIC_PREFIX)) return false

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('allow', 'GET, HEAD')
    sendError(request, response, 405, 'Method not allowed.')
    return true
  }
  const fileName = mobileAssetName(rawPath)
  if (!fileName) {
    sendError(request, response, 404, 'Not found.')
    return true
  }
  return await serveAsset(fileName, request, response)
}

async function serveAsset(
  fileName: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<true> {
  const contentType = MOBILE_ASSET_TYPES.get(fileName)!
  const body = await readMobileAsset(fileName)
  if (!body) {
    sendError(request, response, 404, 'Not found.')
    return true
  }
  if (response.destroyed) return true

  const etag = `"${createHash('sha256').update(body).digest('hex')}"`
  response.setHeader('content-type', contentType)
  response.setHeader('cache-control', 'no-cache')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('etag', etag)
  if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
    response.statusCode = 304
    response.removeHeader('content-length')
    response.end()
    return true
  }

  response.statusCode = 200
  response.setHeader('content-length', String(body.length))
  response.end(request.method === 'HEAD' ? undefined : body)
  return true
}

function requestPath(url: string | undefined): string {
  const target = url ?? ''
  const query = target.indexOf('?')
  const fragment = target.indexOf('#')
  const end = query === -1 ? fragment : fragment === -1 ? query : Math.min(query, fragment)
  return end === -1 ? target : target.slice(0, end)
}

function mobileAssetName(rawPath: string): string | undefined {
  if (
    !rawPath.startsWith(MOBILE_STATIC_PREFIX) ||
    /[\\/]/.test(rawPath.slice(MOBILE_STATIC_PREFIX.length)) ||
    rawPath.includes('%') ||
    rawPath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return undefined
  }
  const fileName = rawPath.slice(MOBILE_STATIC_PREFIX.length)
  return MOBILE_ASSET_TYPES.has(fileName) ? fileName : undefined
}

async function readMobileAsset(fileName: string): Promise<Buffer | undefined> {
  try {
    const file = await open(join(MOBILE_STATIC_ROOT, fileName), 'r')
    try {
      if (!(await file.stat()).isFile()) return undefined
      return await file.readFile()
    } finally {
      await file.close()
    }
  } catch {
    return undefined
  }
}

function ifNoneMatchMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false
  return header.split(',').some((candidate) => {
    const value = candidate.trim()
    return value === '*' || value === etag || value === `W/${etag}`
  })
}

function sendError(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: string
): void {
  if (response.destroyed) return
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.setHeader('cache-control', 'no-cache')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('content-length', String(Buffer.byteLength(body)))
  response.end(request.method === 'HEAD' ? undefined : body)
}
