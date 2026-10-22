import { afterEach, describe, expect, it } from 'vitest'
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { LanMobileBridge } from '../lib/bridge/lan-mobile-bridge.js'

const bridges: LanMobileBridge[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
})

interface RecordedRequest {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: string
}

async function startUpstream(
  handle: (request: IncomingMessage, response: ServerResponse) => void
): Promise<{ base: string; seen: RecordedRequest[] }> {
  const seen: RecordedRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk as Buffer))
    request.on('end', () => {
      seen.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8')
      })
      handle(request, response)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { base: 'http://127.0.0.1:' + (server.address() as AddressInfo).port, seen }
}

async function startBridge(upstreamBase: string | undefined, token?: string): Promise<number> {
  const bridge = new LanMobileBridge({
    harnessUrl: () => upstreamBase,
    lanAddress: '127.0.0.1',
    ...(token === undefined ? {} : { harnessAuthToken: () => token })
  })
  bridges.push(bridge)
  const snapshot = await bridge.start()
  return snapshot.port as number
}

function call(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk as Buffer))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
      }
    )
    request.on('error', reject)
    if (options.body) request.write(options.body)
    request.end()
  })
}

describe('mobile API relay', () => {
  it('forwards the mobile API prefix to the harness unchanged', async () => {
    const upstream = await startUpstream((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, url: request.url }))
    })
    const port = await startBridge(upstream.base)

    const result = await call(port, '/api/mobile/v1/health?probe=1')

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ ok: true, url: '/api/mobile/v1/health?probe=1' })
    expect(upstream.seen[0].url).toBe('/api/mobile/v1/health?probe=1')
  })

  it('relays the device credential and strips the pairing cookie', async () => {
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{}')
    })
    const port = await startBridge(upstream.base)

    await call(port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer instance.token.signature',
        'x-dsh-device-credential': 'dshc_test',
        cookie: 'dsh-room-pairing=1'
      },
      body: '{"code":"123456"}'
    })

    const recorded = upstream.seen[0]
    expect(recorded.method).toBe('POST')
    expect(recorded.body).toBe('{"code":"123456"}')
    expect(recorded.headers.authorization).toBe('Bearer instance.token.signature')
    expect(recorded.headers['x-dsh-device-credential']).toBe('dshc_test')
    expect(recorded.headers.cookie).toBeUndefined()
    expect(recorded.headers.host).toBe(new URL(upstream.base).host)
  })

  it('streams server-sent events as they arrive', async () => {
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: one\n\n')
      setTimeout(() => {
        response.write('data: two\n\n')
        response.end()
      }, 120)
    })
    const port = await startBridge(upstream.base)

    const timing = await new Promise<{ first: number; end: number }>((resolve, reject) => {
      const request = httpRequest(
        { host: '127.0.0.1', port, path: '/api/mobile/v1/events/stream' },
        (response) => {
          let first = 0
          response.on('data', () => {
            if (!first) first = Date.now()
          })
          response.on('end', () => resolve({ first, end: Date.now() }))
        }
      )
      request.on('error', reject)
      request.end()
    })

    expect(timing.first).toBeGreaterThan(0)
    expect(timing.end - timing.first).toBeGreaterThanOrEqual(80)
  })

  it('keeps every other path behind the pairing gate', async () => {
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200)
      response.end('should not be reached')
    })
    const port = await startBridge(upstream.base)

    expect((await call(port, '/zzz-nope')).status).toBe(401)
    expect((await call(port, '/api/relay/status')).status).toBe(401)
    expect(upstream.seen).toHaveLength(0)
  })

  it('reports an unreachable harness as 502', async () => {
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const deadPort = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    const port = await startBridge('http://127.0.0.1:' + deadPort)

    const result = await call(port, '/api/mobile/v1/health')

    expect(result.status).toBe(502)
    expect(JSON.parse(result.body).ok).toBe(false)
  })

  it('reports a missing harness url as 503', async () => {
    const port = await startBridge(undefined)

    const result = await call(port, '/api/mobile/v1/health')

    expect(result.status).toBe(503)
    expect(JSON.parse(result.body).ok).toBe(false)
  })

  it('attaches the host session it exchanges from the launch token', async () => {
    const exchanges: string[] = []
    const upstream = await startUpstream((request, response) => {
      const url = String(request.url ?? '')
      if (url === '/?token=launch-token') {
        exchanges.push(url)
        response.writeHead(303, { 'set-cookie': 'dsh_session=fresh; Path=/; HttpOnly' })
        response.end()
        return
      }
      if (!String(request.headers.cookie ?? '').includes('dsh_session=fresh')) {
        response.writeHead(401, { 'content-type': 'text/plain' })
        response.end('unauthorized')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
    const port = await startBridge(upstream.base, 'launch-token')

    const result = await call(port, '/api/mobile/v1/health')

    expect(result.status).toBe(200)
    expect(exchanges).toEqual(['/?token=launch-token'])
  })

  it('retries once with a fresh session when the host rejects the cookie', async () => {
    let exchanges = 0
    const upstream = await startUpstream((request, response) => {
      if (String(request.url ?? '') === '/?token=launch-token') {
        exchanges += 1
        response.writeHead(303, { 'set-cookie': 'dsh_session=session-' + exchanges + '; Path=/' })
        response.end()
        return
      }
      if (!String(request.headers.cookie ?? '').includes('dsh_session=session-2')) {
        response.writeHead(401, { 'content-type': 'text/plain' })
        response.end('unauthorized')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
    const port = await startBridge(upstream.base, 'launch-token')

    const result = await call(port, '/api/mobile/v1/health')

    expect(result.status).toBe(200)
    expect(exchanges).toBe(2)
  })
})
