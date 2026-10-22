import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse
} from 'node:http'

/** Prefix owned by dsh-mobile-plugin's mobile API. */
export const MOBILE_API_PREFIX = '/api/mobile'

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** Headers that describe a single connection hop and must not be relayed. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

/** The Host rejects every API call that arrives without its own session. */
export interface HarnessSession {
  cookie(): Promise<string | undefined>
  refresh(): Promise<string | undefined>
}

export function isMobileApiPath(pathname: string): boolean {
  return pathname === MOBILE_API_PREFIX || pathname.startsWith(MOBILE_API_PREFIX + '/')
}

/**
 * Relays the dsh-mobile API to the Harness.
 *
 * The mobile app reaches this bridge through the same public entry as the phone
 * page, and that API authenticates callers with its own device credential — so
 * it must not sit behind this bridge's pairing gate. Only this prefix is
 * relayed: the Harness UI, the control plane and every other API stay closed.
 *
 * The Host itself still demands a session cookie before any API runs, and that
 * cookie is only obtainable by exchanging the launch token, so the bridge does
 * that exchange on the app's behalf and forwards the cookie.
 */
export function proxyMobileApi(options: {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  upstreamBase: string | undefined
  session?: HarnessSession
}): void {
  const { request, response, url, upstreamBase, session } = options
  if (upstreamBase === undefined) return sendJson(response, 503, 'harness url is not known yet')
  let upstream: URL
  try {
    upstream = new URL(upstreamBase)
  } catch {
    return sendJson(response, 503, 'harness url is not usable')
  }
  const method = (request.method ?? 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) {
    response.setHeader('allow', [...ALLOWED_METHODS].join(', '))
    return sendJson(response, 405, 'method not allowed')
  }
  const hasBody = method !== 'GET' && method !== 'HEAD'
  let active: ReturnType<typeof httpRequest> | undefined

  const forward = (upstreamResponse: IncomingMessage): void => {
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse.headers))
    // Server-sent events have to reach the phone as they arrive, not when the
    // upstream finally closes.
    response.flushHeaders()
    upstreamResponse.pipe(response)
    upstreamResponse.on('error', () => response.destroy())
  }

  const attempt = (cookie: string | undefined, retried: boolean): void => {
    active = httpRequest(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        method,
        path: url.pathname + url.search,
        headers: requestHeaders(request.headers, upstream, cookie)
      },
      (upstreamResponse) => {
        // A cookie the Host no longer accepts answers before the mobile API
        // runs. A call without a body can be replayed after one exchange.
        if (!retried && upstreamResponse.statusCode === 401 && session !== undefined && !hasBody) {
          upstreamResponse.resume()
          void Promise.resolve()
            .then(() => session.refresh())
            .catch(() => undefined)
            .then((next) => attempt(next, true))
          return
        }
        forward(upstreamResponse)
      }
    )
    active.on('error', (error: unknown) => {
      if (response.headersSent) response.destroy()
      else sendJson(response, 502, errorMessage(error))
    })
    if (hasBody) request.pipe(active)
    else active.end()
  }

  // A phone that walks away must not leave the upstream request running.
  response.on('close', () => {
    if (!response.writableEnded) active?.destroy()
  })

  void Promise.resolve(session?.cookie())
    .catch(() => undefined)
    .then((cookie) => attempt(cookie, false))
}

function requestHeaders(
  incoming: IncomingHttpHeaders,
  upstream: URL,
  cookie: string | undefined
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue
    const lower = name.toLowerCase()
    // The pairing cookie is this bridge's own; the Host session is attached
    // below from the launch-token exchange.
    if (HOP_BY_HOP.has(lower) || lower === 'host' || lower === 'cookie') continue
    headers[lower] = value
  }
  headers.host = upstream.host
  if (cookie !== undefined) headers.cookie = cookie
  return headers
}

function responseHeaders(incoming: IncomingHttpHeaders): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue
    const lower = name.toLowerCase()
    if (HOP_BY_HOP.has(lower)) continue
    headers[lower] = value
  }
  return headers
}

function sendJson(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify({ ok: false, error }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
