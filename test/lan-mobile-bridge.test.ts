import { afterEach, describe, expect, it } from 'vitest'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import {
  applyWorkspaceFollowFrame,
  isInternetTunnelHost,
  isPrivateAddress,
  LanMobileBridge,
  lanAddressCandidates,
  normalizeRemoteAddress,
  preferredLanAddress,
  resolveDefaultRouteAddress
} from '../lib/bridge/lan-mobile-bridge.js'

const bridges: LanMobileBridge[] = []
const servers: ReturnType<typeof createServer>[] = []
interface TestWebSocket {
  send(data: string): void
}
interface TestWebSocketServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (client: TestWebSocket) => void
  ): void
  close(callback: (error?: Error) => void): void
}
const WebSocketServer = createRequire(import.meta.url)('ws').WebSocketServer as new (options: {
  noServer: boolean
}) => TestWebSocketServer
const webSocketServers: TestWebSocketServer[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
  await Promise.all(
    webSocketServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
    )
  )
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
})

describe('LAN mobile bridge address policy', () => {
  it('allows loopback and RFC1918 addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('10.1.2.3')).toBe(true)
    expect(isPrivateAddress('172.16.0.1')).toBe(true)
    expect(isPrivateAddress('172.31.255.1')).toBe(true)
    expect(isPrivateAddress('192.168.1.10')).toBe(true)
  })

  it('rejects public addresses and out-of-range 172 networks', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('172.15.0.1')).toBe(false)
    expect(isPrivateAddress('172.32.0.1')).toBe(false)
  })

  it('normalizes IPv4-mapped IPv6 addresses', () => {
    expect(normalizeRemoteAddress('::ffff:192.168.1.4')).toBe('192.168.1.4')
  })

  it('recognizes Cloudflare and Pinggy public tunnel hosts', () => {
    expect(isInternetTunnelHost('mobile.trycloudflare.com')).toBe(true)
    expect(isInternetTunnelHost('api.trycloudflare.com')).toBe(false)
    expect(isInternetTunnelHost('mobile.a.pinggy.link')).toBe(true)
    expect(isInternetTunnelHost('mobile.run.pinggy-free.link')).toBe(true)
    expect(isInternetTunnelHost('mobile.a.free.pinggy.online')).toBe(true)
    expect(isInternetTunnelHost('free.pinggy.io')).toBe(false)
  })
})

describe('LAN address resolution', () => {
  it('returns the address an injected default-route probe reports', async () => {
    await expect(resolveDefaultRouteAddress(async () => '192.168.1.105')).resolves.toBe(
      '192.168.1.105'
    )
  })

  it('resolves undefined when the default-route probe fails or reports an unusable address', async () => {
    await expect(
      resolveDefaultRouteAddress(async () => {
        throw new Error('probe failed')
      })
    ).resolves.toBeUndefined()
    await expect(resolveDefaultRouteAddress(async () => '8.8.8.8')).resolves.toBeUndefined()
    await expect(resolveDefaultRouteAddress(async () => '127.0.0.1')).resolves.toBeUndefined()
  })

  it('builds the pairing URL on the pinned LAN address', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      lanAddress: '10.20.30.40'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    expect(new URL(snapshot.pairingUrl!).hostname).toBe('10.20.30.40')
    expect(bridge.lanAddressCandidates()[0]).toBe('10.20.30.40')
    expect(bridge.pairingUrls()[0]).toBe(snapshot.pairingUrl)
  })

  it('puts the tunnel URL first and reports no pairing URLs without a valid token', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      lanAddress: '10.20.30.40'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(snapshot.pairingUrl!).searchParams.get('token')
    armFakeTunnel(bridge)
    const urls = bridge.pairingUrls()
    expect(urls[0]).toBe(`https://active-mobile.trycloudflare.com/pair?token=${token}`)
    expect(urls[1]).toBe(`http://10.20.30.40:${snapshot.port}/pair?token=${token}`)
    for (const url of urls) expect(new URL(url).searchParams.get('token')).toBe(token)

    Object.assign(bridge as unknown as Record<string, unknown>, { pairingToken: undefined })
    expect(bridge.pairingUrls()).toEqual([])
  })

  it('never pairs on a pinned loopback or public address', async () => {
    for (const lanAddress of ['127.0.0.1', '8.8.8.8']) {
      const bridge = new LanMobileBridge({
        harnessUrl: () => 'http://127.0.0.1:9999',
        lanAddress
      })
      bridges.push(bridge)
      const snapshot = await bridge.start()
      const host = snapshot.pairingUrl ? new URL(snapshot.pairingUrl).hostname : undefined
      expect(host).not.toBe(lanAddress)
      expect(host === undefined || isPrivateAddress(host)).toBe(true)
    }
  })

  it('orders LAN candidates with the preferred address first and drops duplicates, loopback and public entries', () => {
    const candidates = lanAddressCandidates('10.99.99.99')
    expect(candidates[0]).toBe('10.99.99.99')
    expect(new Set(candidates).size).toBe(candidates.length)
    expect(candidates).not.toContain('127.0.0.1')
    expect(candidates).not.toContain('8.8.8.8')

    const onInterface = preferredLanAddress()
    if (onInterface) {
      const deduped = lanAddressCandidates(onInterface)
      expect(deduped[0]).toBe(onInterface)
      expect(deduped.filter((address) => address === onInterface)).toHaveLength(1)
    }
  })
})

describe('LAN mobile bridge pairing surface', () => {

  it('offers a reconnect page without exposing mobile APIs before approval', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const response = await fetch(`http://127.0.0.1:${snapshot.port}/`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Reconnect')
    const blocked = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`)
    expect(blocked.status).toBe(401)
  })


  it('treats Pinggy forwarding headers as an internet tunnel request', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    Object.assign(bridge as unknown as Record<string, unknown>, {
      tunnelActive: true,
      tunnelInstance: {
        provider: 'pinggy',
        url: 'https://active-mobile.a.pinggy.link',
        process: {},
        stop: async () => undefined
      }
    })

    const reconnectStatus = await requestStatus(snapshot.port!, '/reconnect', {
      host: 'active-mobile.a.pinggy.link',
      'x-forwarded-for': '203.0.113.18',
      'x-forwarded-proto': 'https'
    })
    expect(reconnectStatus).toBe(200)
  })


  it('opens the pairing window for a WiFi reconnect and does not issue a session', async () => {
    let reconnectRequests = 0
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      onReconnectRequested: () => {
        reconnectRequests += 1
      }
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const reconnect = await fetch(`http://127.0.0.1:${snapshot.port}/reconnect`)
    expect(reconnect.headers.get('set-cookie')).toBeNull()
    expect(await reconnect.text()).toContain('scan the new QR code')
    expect(reconnectRequests).toBe(1)
    const retried = await fetch(`http://127.0.0.1:${snapshot.port}/pair/retry`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${snapshot.port}`
      },
      body: '{}'
    })
    expect(await retried.json()).toEqual({ ok: true, rescan: true })
    expect(reconnectRequests).toBe(2)
  })


  it('does not promote an arbitrary cookie from the pairing address', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const planted = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { cookie: `dsh_mobile=${'a'.repeat(43)}` }
    })
    expect(planted.status).toBe(401)

    const owner = await fetch(`http://127.0.0.1:${port}/api/status`, {
      headers: { cookie }
    })
    expect(owner.status).toBe(200)
  })





  it('adapts Harness 0.1.2 history records to the stable mobile page contract', async () => {
    let pageRequest: unknown
    const projections = {
      asOfSeq: 7,
      values: {
        todos: [{ content: 'Restore mobile history', status: 'in_progress' }]
      }
    }
    const records = [
      {
        type: 'event',
        event: { type: 'user/message', time: 1, content: [{ type: 'text', text: 'hello' }] }
      }
    ]
    const harness = createServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        rpcId: string
        method: string
        payload: { args: unknown }
      }
      const value = envelope.method === 'session/list'
        ? {
            items: [
              {
                sessionId: 'session-1',
                updatedAt: 1,
                running: false,
                blank: false,
                projections
              }
            ]
          }
        : { records, hasMore: false }
      if (envelope.method === 'session/page') pageRequest = envelope.payload.args
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: { ok: true, value }
      }))
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const history = await mobileRpc(port, cookie, 'session.history', {
      sessionId: 'session-1',
      maxMessages: 100
    })

    expect(history.status).toBe(200)
    expect(await history.json()).toEqual({
      ok: true,
      value: { events: records, projections, hasMore: false, oldestSeq: null, throughSeq: 7 }
    })
    expect(pageRequest).toEqual({
      request: {
        address: { kind: 'session', sessionId: 'session-1' },
        throughSeq: 7,
        maxMessages: 100
      }
    })
  })

  it('walks backwards through history pages without repeating records', async () => {
    const pageRequests: unknown[] = []
    const recordsFor = (...seqs: number[]): unknown[] => seqs.map((seq) => ({
      type: 'event',
      event: {
        type: 'user/message',
        seq,
        time: seq,
        content: [{ type: 'text', text: `message ${seq}` }]
      }
    }))
    const pages = new Map<number | undefined, { records: unknown[]; hasMore: boolean }>([
      [undefined, { records: recordsFor(8, 9, 10), hasMore: true }],
      [8, { records: recordsFor(5, 6, 7), hasMore: true }],
      [5, { records: recordsFor(2, 3, 4), hasMore: false }]
    ])
    const harness = createServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      const envelope = await readJsonBody<{
        rpcId: string
        method: string
        payload: { args: { request?: { beforeSeq?: number } } }
      }>(request)
      let value: unknown
      if (envelope.method === 'session/list') {
        value = {
          items: [
            {
              sessionId: 'session-1',
              projections: { asOfSeq: 10, values: {} }
            }
          ]
        }
      } else if (envelope.method === 'session/page') {
        pageRequests.push(envelope.payload.args)
        const page = pages.get(envelope.payload.args.request?.beforeSeq)
        if (!page) {
          response.statusCode = 500
          response.end()
          return
        }
        value = page
      } else {
        response.statusCode = 404
        response.end()
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: { ok: true, value }
      }))
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const readPage = async (beforeSeq?: number): Promise<{
      events: { event: { seq: number } }[]
      hasMore: boolean
      oldestSeq: number | null
      throughSeq: number
    }> => {
      const response = await mobileRpc(port, cookie, 'session.history', {
        sessionId: 'session-1',
        maxMessages: 100,
        ...(beforeSeq === undefined ? {} : { beforeSeq })
      })
      expect(response.status).toBe(200)
      return (await response.json()).value
    }

    const tail = await readPage()
    const older = await readPage(tail.oldestSeq!)
    const oldest = await readPage(older.oldestSeq!)

    expect(tail).toMatchObject({ hasMore: true, oldestSeq: 8, throughSeq: 10 })
    expect(older).toMatchObject({ hasMore: true, oldestSeq: 5, throughSeq: 10 })
    expect(oldest).toMatchObject({ hasMore: false, oldestSeq: 2, throughSeq: 10 })

    const sequences = [...tail.events, ...older.events, ...oldest.events]
      .map((record) => record.event.seq)
    expect(sequences.sort((left, right) => left - right)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])

    expect(pageRequests).toEqual([
      {
        request: {
          address: { kind: 'session', sessionId: 'session-1' },
          throughSeq: 10,
          maxMessages: 100
        }
      },
      {
        request: {
          address: { kind: 'session', sessionId: 'session-1' },
          throughSeq: 10,
          maxMessages: 100,
          beforeSeq: 8,
          turnWindow: { minMessages: 50, minTurns: 2 }
        }
      },
      {
        request: {
          address: { kind: 'session', sessionId: 'session-1' },
          throughSeq: 10,
          maxMessages: 100,
          beforeSeq: 5,
          turnWindow: { minMessages: 50, minTurns: 2 }
        }
      }
    ])
  })

  it('streams native session follow snapshots and events to an authorized phone', async () => {
    let sessionOpen: unknown
    const harness = createServer((_request, response) => {
      response.statusCode = 404
      response.end()
    })
    const muxServer = new WebSocketServer({ noServer: true })
    webSocketServers.push(muxServer)
    harness.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      muxServer.handleUpgrade(request, socket, head, (client) => {
        const peer = client as TestWebSocket & {
          on(event: 'message', listener: (data: Buffer) => void): void
        }
        peer.on('message', (data) => {
          const opened = JSON.parse(data.toString('utf8')) as {
            streamId: string
            endpoint: string
            payload: unknown
          }
          if (opened.endpoint !== 'session/follow') return
          sessionOpen = opened.payload
          peer.send(JSON.stringify({
            type: 'item',
            streamId: opened.streamId,
            value: {
              type: 'snapshot',
              cursor: 2,
              records: [{ type: 'event', event: { type: 'user/message', seq: 2 } }],
              hasMore: false,
              projections: { asOfSeq: 2, values: {} }
            }
          }))
          peer.send(JSON.stringify({
            type: 'item',
            streamId: opened.streamId,
            value: { type: 'event', event: { type: 'assistant/chunk', seq: 3 } }
          }))
        })
      })
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)
    const abort = new AbortController()
    const response = await fetch(
      `http://127.0.0.1:${port}/api/session/stream?sessionId=session-1`,
      { headers: { cookie }, signal: abort.signal }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let body = ''
    await waitFor(async () => {
      const chunk = await reader.read()
      body += decoder.decode(chunk.value, { stream: true })
      return body.includes('event: snapshot') && body.includes('event: event')
    })
    abort.abort()
    expect(body).toContain('"type":"snapshot"')
    expect(body).toContain('"type":"assistant/chunk"')
    expect(sessionOpen).toEqual({
      args: {
        request: {
          address: { kind: 'session', sessionId: 'session-1' },
          maxMessages: 100
        }
      }
    })
  })

  it('does not crash when a session stream is aborted while the mux handshake is still connecting', async () => {
    // Regression guard for the permanent ws 'error' sink in streamSession.
    // Aborting the SSE request makes streamSession close its upstream mux
    // WebSocket; when the handshake never completed, `ws` then raises 'error'
    // asynchronously ("closed before the connection was established") after
    // cleanup() has removed the real listener. Without a permanent sink that
    // self-inflicted error becomes an unhandled 'error' event and takes the
    // whole process down (consumeMux documents the identical crash path).
    const upgraded: Duplex[] = []
    const harness = createServer((_request, response) => {
      response.statusCode = 404
      response.end()
    })
    // Swallow the upgrade: the mux socket stays CONNECTING on the bridge side.
    harness.on('upgrade', (request, socket) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      upgraded.push(socket)
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)
    const abort = new AbortController()
    const response = await fetch(
      `http://127.0.0.1:${port}/api/session/stream?sessionId=session-1`,
      { headers: { cookie }, signal: abort.signal }
    )
    expect(response.status).toBe(200)
    abort.abort()
    // Let the async 'error' (when present) fire; with the sink in place the
    // process survives and the request unwinds cleanly.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(upgraded.length).toBeGreaterThan(0)
    for (const socket of upgraded) socket.destroy()
    expect(upgraded.every((socket) => socket.destroyed)).toBe(true)
  })
})

describe('mobile prompt image validation', () => {
  const ONE_PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

  async function pairedPort(): Promise<{ port: number; cookie: string }> {
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999' })
    bridges.push(bridge)
    return pairBridge(bridge)
  }

  function promptPayload(content: unknown[], requestId = 'prompt-1'): Record<string, unknown> {
    return {
      sessionId: 'session-1',
      mode: 'steer',
      requestId,
      content,
      clientTimeZone: 'Asia/Shanghai'
    }
  }

  it('rejects an svg image block with unsupported-image', async () => {
    const { port, cookie } = await pairedPort()
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload([
        { type: 'image', mediaType: 'image/svg+xml', data: ONE_PIXEL_PNG, name: 'vector.svg' }
      ])
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unsupported-image' })
  })

  it('rejects more than six images with too-many-images', async () => {
    const { port, cookie } = await pairedPort()
    const images = Array.from({ length: 7 }, (_, index) => ({
      type: 'image',
      mediaType: 'image/png',
      data: ONE_PIXEL_PNG,
      name: `image-${index}.png`
    }))
    const response = await mobileRpc(port, cookie, 'session.prompt', promptPayload(images))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'too-many-images' })
  })

  it('rejects non-canonical base64 with invalid-image-data', async () => {
    const { port, cookie } = await pairedPort()
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload([
        { type: 'image', mediaType: 'image/png', data: 'not+a+valid+length', name: 'broken.png' }
      ])
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'invalid-image-data' })
  })

  it('rejects prompt text over 32KB with text-too-large', async () => {
    const { port, cookie } = await pairedPort()
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload([{ type: 'text', text: 'a'.repeat(32 * 1024 + 1) }])
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'text-too-large' })
  })

  it('forwards a valid 1x1 png prompt to the host with the content intact', async () => {
    const forwarded: {
      rpcId: string
      method?: string
      payload?: { args?: { request?: Record<string, unknown> } }
    }[] = []
    const harnessPort = await startHarnessServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      const envelope = await readJsonBody<{
        rpcId: string
        method?: string
        payload?: { args?: { request?: Record<string, unknown> } }
      }>(request)
      forwarded.push(envelope)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: { ok: true, value: { accepted: true } }
      }))
    })
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const content = [
      {
        type: 'image',
        mediaType: 'image/png',
        data: ONE_PIXEL_PNG,
        name: 'pixel.png',
        width: 1,
        height: 1
      }
    ]
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload(content)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, value: { accepted: true } })
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]).toMatchObject({
      method: 'session/prompt',
      payload: { args: { request: { sessionId: 'session-1' } } }
    })
    expect(forwarded[0]!.payload!.args!.request!.content).toEqual(content)
    expect(forwarded[0]!.payload!.args!.request!.requestId).toBe('prompt-1')
  })
})

describe('mobile attachment delivery', () => {
  const ONE_PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

  it('requires both sessionId and attachmentId', async () => {
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999' })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    for (const path of [
      '/api/attachment',
      '/api/attachment?sessionId=session-1',
      '/api/attachment?attachmentId=attachment-1'
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie } })
      expect(response.status, path).toBe(400)
      expect(await response.json(), path).toMatchObject({ ok: false, code: 'invalid-request' })
    }
  })

  it('reports a host-side missing attachment as 404 with a code', async () => {
    const harnessPort = await startHarnessServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      await readJsonBody(request)
      response.statusCode = 404
      response.end('missing')
    })
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const response = await fetch(
      `http://127.0.0.1:${port}/api/attachment?sessionId=session-1&attachmentId=attachment-1`,
      { headers: { cookie } }
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ ok: false, code: 'attachment-not-found' })
  })

  it('streams an attachment with private caching and sniffing protection', async () => {
    const harnessPort = await startHarnessServer(async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 404
        response.end()
        return
      }
      const envelope = await readJsonBody<{ rpcId: string }>(request)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: {
          ok: true,
          value: {
            attachment: { mediaType: 'image/png' },
            data: ONE_PIXEL_PNG
          }
        }
      }))
    })
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const response = await fetch(
      `http://127.0.0.1:${port}/api/attachment?sessionId=session-1&attachmentId=attachment-1`,
      { headers: { cookie } }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('etag')).toBe('"attachment-1"')
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from(ONE_PIXEL_PNG, 'base64')
    )
  })

  it('rejects a non-prompt request body over 64KB with 413', async () => {
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999' })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const response = await fetch(`http://127.0.0.1:${port}/api/rpc`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'workspace.list',
        payload: { padding: 'x'.repeat(65 * 1024) }
      })
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ ok: false, code: 'payload-too-large' })
  })
})

describe('LAN mobile bridge user questions', () => {
  it('replays pending questions and forwards the desktop answer protocol', async () => {
    const responses: unknown[] = []
    const muxClients: TestWebSocket[] = []
    const harness = createServer(async (request, response) => {
      if (request.method === 'GET' && request.url === '/api/remote.mux') {
        response.statusCode = 426
        response.end()
        return
      }
      if (request.method === 'POST' && request.url === '/api/$events/result') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId: string }
        responses.push(envelope)
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value: { accepted: true } }
        }))
        return
      }
      response.statusCode = 404
      response.end()
    })
    const muxServer = new WebSocketServer({ noServer: true })
    webSocketServers.push(muxServer)
    harness.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      muxServer.handleUpgrade(request, socket, head, (client) => {
        muxClients.push(client)
        // The carrier names the generation before anything else; the bridge
        // quotes that clientId when it settles an event.
        client.send(JSON.stringify({
          type: 'item',
          streamId: 'mobile-events',
          value: { type: 'ready', clientId: 'client-1', host: { home: '/home/test' } }
        }))
        client.send(JSON.stringify({
          type: 'item',
          streamId: 'mobile-workspaces',
          value: { type: 'baseline', value: { items: [], archivedSessionIds: [] } }
        }))
        client.send(
          JSON.stringify({
            type: 'item',
            streamId: 'mobile-events',
            value: {
              type: 'waterfall',
              event: 'user-questions/request',
              eventId: 'question-rpc-1',
              agentId: 'session-1',
              request: {
              questions: [
                {
                  id: 'domain',
                  header: '领域确认',
                  question: '你说的持续学习指哪个领域？',
                  options: [
                    {
                      label: '机器学习中的 Continual Learning (推荐)',
                      description: '终身学习与抗灾难性遗忘'
                    },
                    { label: '教育学中的持续学习' }
                  ]
                }
              ]
              }
            }
          })
        )
      })
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    const pending = await waitForRpcValue(port, cookie, 'interaction.pending', {
      sessionId: 'session-1'
    })
    expect(pending).toMatchObject({
      rpcId: 'question-rpc-1',
      sessionId: 'session-1',
      questions: [
        {
          id: 'domain',
          header: '领域确认',
          question: '你说的持续学习指哪个领域？'
        }
      ]
    })

    const answer = await mobileRpc(port, cookie, 'interaction.answer', {
      rpcId: 'question-rpc-1',
      sessionId: 'session-1',
      answers: [
        {
          id: 'domain',
          selected: ['机器学习中的 Continual Learning (推荐)']
        }
      ]
    })
    expect(answer.status).toBe(200)
    expect(answer.status).toBe(200)
    expect(responses).toEqual([
      {
        type: 'client-request',
        rpcId: expect.any(String),
        method: '$events/result',
        payload: {
          args: {
            clientId: 'client-1',
            eventId: 'question-rpc-1',
            outcome: {
              kind: 'result',
              value: {
                answers: [
                  {
                    id: 'domain',
                    selected: ['机器学习中的 Continual Learning (推荐)']
                  }
                ]
              }
            }
          }
        }
      }
    ])

    // Settling the event is the end of it. The old mux broadcast a separate
    // `question/resolved` that kept the Harness authoritative over when a
    // question cleared; the Gateway sends nothing after a result, so a
    // question that stayed pending here would never clear.
    await waitFor(async () => {
      const response = await mobileRpc(port, cookie, 'interaction.pending', {
        sessionId: 'session-1'
      })
      return (await response.json()).value === null
    })
  })

  it('opens the mux downlink only while a phone is attached', async () => {
    let upgrades = 0
    const harness = createServer((_request, response) => {
      response.statusCode = 404
      response.end()
    })
    const muxServer = new WebSocketServer({ noServer: true })
    webSocketServers.push(muxServer)
    harness.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      upgrades += 1
      muxServer.handleUpgrade(request, socket, head, () => undefined)
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const connectionEvents: boolean[] = []
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`,
      onConnectedChange: (connected) => connectionEvents.push(connected)
    })
    bridges.push(bridge)

    // A desktop that never pairs a phone has no consumer for the downlink, so
    // it must not sit there reconnecting to it for the life of the process.
    await bridge.start()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(upgrades).toBe(0)
    expect(connectionEvents).toEqual([])

    await pairBridge(bridge)
    await waitFor(async () => upgrades > 0)
    expect(connectionEvents).toEqual([true])

    await bridge.stop()
    expect(connectionEvents).toEqual([true, false])
  })

  it('rejects answers that were not offered by the pending question', async () => {
    const responses: unknown[] = []
    const harness = createServer(async (request, response) => {
      if (request.method === 'GET' && request.url === '/api/remote.mux') {
        response.statusCode = 426
        response.end()
        return
      }
      if (request.method === 'POST' && request.url === '/api/$events/result') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rpcId: string }
        responses.push(envelope)
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value: { accepted: true } }
        }))
        return
      }
      response.statusCode = 404
      response.end()
    })
    const muxServer = new WebSocketServer({ noServer: true })
    webSocketServers.push(muxServer)
    harness.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      muxServer.handleUpgrade(request, socket, head, (client) => {
        client.send(JSON.stringify({
          type: 'item',
          streamId: 'mobile-events',
          value: { type: 'ready', clientId: 'client-2', host: { home: '/home/test' } }
        }))
        client.send(
          JSON.stringify({
            type: 'item',
            streamId: 'mobile-events',
            value: {
              type: 'waterfall',
              event: 'user-questions/request',
              eventId: 'question-rpc-2',
              agentId: 'session-2',
              request: {
                questions: [{ id: 'choice', question: '选择一个', options: [{ label: 'A' }] }]
              }
            }
          })
        )
      })
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)
    await waitForRpcValue(port, cookie, 'interaction.pending', { sessionId: 'session-2' })
    const answer = await mobileRpc(port, cookie, 'interaction.answer', {
      rpcId: 'question-rpc-2',
      sessionId: 'session-2',
      answers: [{ id: 'choice', selected: ['B'] }]
    })
    expect(answer.status).toBe(500)
    expect(await answer.json()).toMatchObject({ ok: false, error: 'Answer contains an unknown option.' })

    const cancel = await mobileRpc(port, cookie, 'interaction.cancel', {
      rpcId: 'question-rpc-2',
      sessionId: 'session-2'
    })
    expect(cancel.status).toBe(200)
    expect(responses).toEqual([
      {
        type: 'client-request',
        rpcId: expect.any(String),
        method: '$events/result',
        payload: {
          args: {
            clientId: 'client-2',
            eventId: 'question-rpc-2',
            outcome: {
              kind: 'rejected',
              error: {
                name: 'Error',
                code: 'cancelled',
                message: 'the user closed this question request'
              }
            }
          }
        }
      }
    ])
  })
})

describe('LAN mobile bridge tool approvals', () => {
  it('reports a pending approval and settles both desktop outcomes exactly once', async () => {
    const { harnessUrl, results, clients } = await startApprovalHarness((client) => {
      sendMuxReady(client, 'approval-client')
      sendApprovalRequest(client, 'approval-1', {
        toolName: 'shell',
        callId: 'call-1',
        reason: 'The command writes outside the workspace.',
        displayReason: 'Run the build'
      })
    })
    const bridge = new LanMobileBridge({ harnessUrl: () => harnessUrl })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    await waitFor(async () => {
      const approval = await readPendingApproval(port, cookie)
      return approval?.eventId === 'approval-1'
    })
    expect(await readPendingApproval(port, cookie)).toEqual({
      eventId: 'approval-1',
      sessionId: 'session-1',
      toolName: 'shell',
      callId: 'call-1',
      reason: 'The command writes outside the workspace.',
      displayReason: 'Run the build'
    })

    const allowed = await mobileRpc(port, cookie, 'approval.answer', {
      sessionId: 'session-1',
      eventId: 'approval-1',
      outcome: 'allowed-once'
    })
    expect(allowed.status).toBe(200)
    expect(await allowed.json()).toEqual({ ok: true, value: { ok: true } })
    expect(results).toEqual([
      {
        type: 'client-request',
        rpcId: expect.any(String),
        method: '$events/result',
        payload: {
          args: {
            clientId: 'approval-client',
            eventId: 'approval-1',
            outcome: { kind: 'result', value: 'allowed-once' }
          }
        }
      }
    ])
    expect(await readPendingApproval(port, cookie)).toBeNull()

    sendApprovalRequest(clients[0]!, 'approval-2', { toolName: 'write_file' })
    await waitFor(async () => {
      const approval = await readPendingApproval(port, cookie)
      return approval !== null && approval.eventId === 'approval-2'
    })
    expect(await readPendingApproval(port, cookie)).toEqual({
      eventId: 'approval-2',
      sessionId: 'session-1',
      toolName: 'write_file'
    })

    const rejected = await mobileRpc(port, cookie, 'approval.answer', {
      sessionId: 'session-1',
      eventId: 'approval-2',
      outcome: 'rejected'
    })
    expect(rejected.status).toBe(200)
    expect(results).toHaveLength(2)
    expect(results[1]).toMatchObject({
      payload: {
        args: {
          clientId: 'approval-client',
          eventId: 'approval-2',
          outcome: { kind: 'result', value: 'rejected' }
        }
      }
    })

    const duplicate = await mobileRpc(port, cookie, 'approval.answer', {
      sessionId: 'session-1',
      eventId: 'approval-2',
      outcome: 'rejected'
    })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({
      ok: false,
      code: 'approval-not-pending'
    })
    expect(results).toHaveLength(2)
  })

  it('drops a pending approval when the carrier disconnects and refuses the stale answer', async () => {
    const { harnessUrl, results, clients } = await startApprovalHarness((client, connection) => {
      sendMuxReady(client, `approval-disconnect-${connection}`)
      if (connection === 1) {
        sendApprovalRequest(client, 'approval-stale', { toolName: 'shell' })
      }
    })
    const bridge = new LanMobileBridge({ harnessUrl: () => harnessUrl })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)

    await waitFor(async () => {
      const approval = await readPendingApproval(port, cookie)
      return approval !== null && approval.eventId === 'approval-stale'
    })
    clients[0]!.close()

    await waitFor(async () => (await readPendingApproval(port, cookie)) === null)
    const stale = await mobileRpc(port, cookie, 'approval.answer', {
      sessionId: 'session-1',
      eventId: 'approval-stale',
      outcome: 'allowed-once'
    })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({
      ok: false,
      code: 'approval-not-pending'
    })
    expect(results).toEqual([])
  })

  it('does not resurrect a pending approval when the bridge restarts', async () => {
    const { harnessUrl } = await startApprovalHarness((client, connection) => {
      sendMuxReady(client, `approval-restart-${connection}`)
      if (connection === 1) {
        sendApprovalRequest(client, 'approval-restart', { toolName: 'shell' })
      }
    })
    const bridge = new LanMobileBridge({ harnessUrl: () => harnessUrl })
    bridges.push(bridge)
    const first = await pairBridge(bridge)

    await waitFor(async () => {
      const approval = await readPendingApproval(first.port, first.cookie)
      return approval !== null && approval.eventId === 'approval-restart'
    })
    await bridge.stop()

    const restarted = await pairBridge(bridge)
    await waitFor(async () => {
      const clientId = (bridge as unknown as { eventClientId?: string }).eventClientId
      return clientId === 'approval-restart-2'
    })
    expect(await readPendingApproval(restarted.port, restarted.cookie)).toBeNull()
  })
})

async function startHarnessServer(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>
): Promise<number> {
  const server = createServer((request, response) => {
    handler(request, response).catch(() => {
      if (response.headersSent) {
        if (!response.writableEnded) response.end()
        return
      }
      response.statusCode = 500
      response.end()
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
}

interface ForwardedRpc {
  rpcId: string
  method?: string
  payload?: { args?: Record<string, unknown> }
}

type ForwardingReply =
  | { ok: true; value?: unknown }
  | { ok: false; code: string; message: string }

/**
 * Fake Host that records every forwarded RPC and answers with a scripted reply.
 * The bridge translates a Host `result.error.code` verbatim into the mobile
 * response, so tests can assert both the forwarded envelope and pass-through.
 */
async function pairedForwardingBridge(
  reply: (endpoint: string, args: Record<string, unknown>) => ForwardingReply
): Promise<{ port: number; cookie: string; forwarded: ForwardedRpc[] }> {
  const forwarded: ForwardedRpc[] = []
  const harnessPort = await startHarnessServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.statusCode = 404
      response.end()
      return
    }
    const envelope = await readJsonBody<ForwardedRpc>(request)
    forwarded.push(envelope)
    const answer = reply(envelope.method ?? '', envelope.payload?.args ?? {})
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      type: 'server-response',
      rpcId: envelope.rpcId,
      result: answer.ok
        ? { ok: true, value: answer.value ?? { accepted: true } }
        : { ok: false, error: { code: answer.code, message: answer.message } }
    }))
  })
  const bridge = new LanMobileBridge({
    harnessUrl: () => `http://127.0.0.1:${harnessPort}`
  })
  bridges.push(bridge)
  const { port, cookie } = await pairBridge(bridge)
  return { port, cookie, forwarded }
}

async function pairBridge(bridge: LanMobileBridge): Promise<{ port: number; cookie: string }> {
  const snapshot = await bridge.start()
  const token = new URL(snapshot.pairingUrl!).searchParams.get('token')
  const paired = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, {
    redirect: 'manual'
  })
  return {
    port: snapshot.port!,
    cookie: paired.headers.get('set-cookie')!.split(';', 1)[0]!
  }
}

function requestStatus(
  port: number,
  path: string,
  headers: Record<string, string>
): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port, path, headers },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode))
      }
    )
    request.once('error', reject)
    request.end()
  })
}

function rawRequest(
  port: number,
  path: string,
  headers: Record<string, string>,
  method = 'GET',
  body?: string
): Promise<{ status?: number; setCookie?: string; text: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: '127.0.0.1', port, path, method, headers },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.once('end', () =>
          resolve({
            status: response.statusCode,
            setCookie: response.headers['set-cookie']?.[0],
            text: Buffer.concat(chunks).toString('utf8')
          })
        )
      }
    )
    request.once('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

function mobileRpc(
  port: number,
  cookie: string,
  method: string,
  payload: unknown
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/rpc`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ method, payload })
  })
}

async function waitForRpcValue(
  port: number,
  cookie: string,
  method: string,
  payload: unknown
): Promise<unknown> {
  let value: unknown = null
  await waitFor(async () => {
    const response = await mobileRpc(port, cookie, method, payload)
    value = (await response.json()).value
    return value !== null
  })
  return value
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for condition.')
}

interface TestMuxClient extends TestWebSocket {
  close(): void
}

async function startApprovalHarness(
  open: (client: TestMuxClient, connection: number) => void
): Promise<{ harnessUrl: string; results: unknown[]; clients: TestMuxClient[] }> {
  const results: unknown[] = []
  const clients: TestMuxClient[] = []
  let connections = 0
  const harness = createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/$events/result') {
      const envelope = await readJsonBody<{ rpcId: string }>(request)
      results.push(envelope)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        type: 'server-response',
        rpcId: envelope.rpcId,
        result: { ok: true, value: { accepted: true } }
      }))
      return
    }
    response.statusCode = 404
    response.end()
  })
  const muxServer = new WebSocketServer({ noServer: true })
  webSocketServers.push(muxServer)
  harness.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/remote.mux') return socket.destroy()
    muxServer.handleUpgrade(request, socket, head, (client) => {
      const peer = client as TestMuxClient
      clients.push(peer)
      connections += 1
      open(peer, connections)
    })
  })
  servers.push(harness)
  await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
  return {
    harnessUrl: `http://127.0.0.1:${(harness.address() as AddressInfo).port}`,
    results,
    clients
  }
}

function sendMuxReady(client: TestMuxClient, clientId: string): void {
  client.send(JSON.stringify({
    type: 'item',
    streamId: 'mobile-events',
    value: { type: 'ready', clientId, host: { home: '/home/test' } }
  }))
}

function sendApprovalRequest(
  client: TestMuxClient,
  eventId: string,
  request: Record<string, unknown>
): void {
  client.send(JSON.stringify({
    type: 'item',
    streamId: 'mobile-events',
    value: {
      type: 'waterfall',
      event: 'approval/request',
      eventId,
      agentId: 'session-1',
      request
    }
  }))
}

async function readPendingApproval(
  port: number,
  cookie: string
): Promise<Record<string, unknown> | null> {
  const response = await mobileRpc(port, cookie, 'approval.pending', {
    sessionId: 'session-1'
  })
  const body = await response.json() as {
    value?: { approval?: Record<string, unknown> | null }
  }
  return body.value?.approval ?? null
}

describe('browser connection visibility', () => {
  it('counts distinct pairing sessions without exposing their cookies or treating idle as disconnected', async () => {
    let now = Date.now()
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999', now: () => now })
    bridges.push(bridge)
    const first = await pairBridge(bridge)
    const second = await pairBridge(bridge)
    const devices = bridge.snapshot().browserDevices
    expect(devices).toHaveLength(2)
    expect(devices.every(device => device.status === 'active')).toBe(true)
    expect(new Set(devices.map(device => device.id)).size).toBe(2)
    for (const device of devices) {
      expect(device.id).toMatch(/^[a-f0-9]{8}$/)
      expect(JSON.stringify(device)).not.toContain(first.cookie)
      expect(JSON.stringify(device)).not.toContain(second.cookie)
    }
    const before = devices.map(device => device.id)
    await fetch(`http://127.0.0.1:${first.port}/api/status`, { headers: { cookie: first.cookie } })
    expect(bridge.snapshot().browserDevices.map(device => device.id).sort()).toEqual([...before].sort())

    now += 29_999
    expect(bridge.snapshot().connected).toBe(true)
    expect(bridge.snapshot().browserDevices.every(device => device.status === 'active')).toBe(true)
    now += 1
    expect(bridge.snapshot().connected).toBe(false)
    expect(bridge.snapshot().browserDevices.every(device => device.status === 'idle')).toBe(true)
  })

  it('shows a manually suspended session only once and restores the same opaque id', async () => {
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999' })
    bridges.push(bridge)
    const { port, cookie } = await pairBridge(bridge)
    const [before] = bridge.snapshot().browserDevices
    bridge.suspendMobileSessions()
    expect(bridge.snapshot().connected).toBe(false)
    expect(bridge.snapshot().browserDevices).toHaveLength(1)
    expect(bridge.snapshot().browserDevices[0]).toMatchObject({ id: before!.id, status: 'disconnected' })

    const resumed = await fetch(`http://127.0.0.1:${port}/pair/retry`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}'
    })
    expect(resumed.status).toBe(200)
    expect(bridge.snapshot().browserDevices).toHaveLength(1)
    expect(bridge.snapshot().browserDevices[0]).toMatchObject({ id: before!.id, status: 'active' })

    const expired = bridge.snapshot()
    ;(bridge as unknown as { revokeMobileSessions(): void }).revokeMobileSessions()
    expect(bridge.snapshot().browserDevices).toEqual([])
    expect(expired.browserDevices[0]!.id).toBe(before!.id)
  })

  it('removes expired sessions from the visible connection history', async () => {
    let now = Date.now()
    const bridge = new LanMobileBridge({ harnessUrl: () => 'http://127.0.0.1:9999', now: () => now })
    bridges.push(bridge)
    await pairBridge(bridge)
    expect(bridge.snapshot().browserDevices).toHaveLength(1)
    now += 30 * 24 * 60 * 60 * 1000
    expect(bridge.snapshot().browserDevices).toEqual([])
  })
})

describe('pairing token boundary and origin hardening', () => {

  it('expires browser sessions and closes the cookie-less handoff window', async () => {
    let now = Date.now()
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      now: () => now
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(snapshot.pairingUrl!).searchParams.get('token')
    const paired = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, { redirect: 'manual' })
    const cookie = paired.headers.get('set-cookie')!.split(';', 1)[0]!

    const withCookie = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, { headers: { cookie } })
    expect(withCookie.status).toBe(200)
    expect(bridge.snapshot().connected).toBe(true)

    now += 31_000
    expect(bridge.snapshot().connected).toBe(false)
    const revived = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, { headers: { cookie } })
    expect(revived.status).toBe(200)
    expect(bridge.snapshot().connected).toBe(true)

    now += 11 * 60 * 1000
    const withoutCookie = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`)
    expect(withoutCookie.status).toBe(401)
    const stillValid = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, { headers: { cookie } })
    expect(stillValid.status).toBe(200)

    now += 30 * 24 * 60 * 60 * 1000
    const expired = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, { headers: { cookie } })
    expect(expired.status).toBe(401)
  })

})

function memoryPinStore(initial: { pin?: string; pinConsent?: boolean } = {}) {
  let state = { ...initial }
  return {
    load: () => ({ ...state }),
    save: (next: { pin?: string; pinConsent?: boolean }) => {
      state = { ...next }
      return true
    }
  }
}

function armFakeTunnel(
  bridge: LanMobileBridge,
  url = 'https://active-mobile.trycloudflare.com',
  provider: 'cloudflare' | 'pinggy' = 'cloudflare'
): { emitClose: () => void } {
  const listeners: Array<() => void> = []
  const process = {
    once: (_event: string, listener: () => void) => {
      listeners.push(listener)
      return process
    }
  }
  Object.assign(bridge as unknown as Record<string, unknown>, {
    tunnelActive: true,
    tunnelInstance: {
      provider,
      url,
      process,
      stop: async () => undefined
    }
  })
  return {
    emitClose: () => {
      for (const listener of listeners) listener()
    }
  }
}

describe('LAN vs tunnel pairing authorization', () => {
  it('issues a LAN session cookie immediately and never puts the pin in snapshot', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    expect(snapshot).not.toHaveProperty('pairingPin')
    const token = new URL(snapshot.pairingUrl!).searchParams.get('token')
    const paired = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, {
      redirect: 'manual'
    })
    expect(paired.status).toBe(302)
    expect(paired.headers.get('set-cookie')).toContain('HttpOnly')
    expect(paired.headers.get('set-cookie')).not.toContain('Secure')
    expect(bridge.snapshot()).not.toHaveProperty('pairingPin')
  })

  it('keeps a LAN /pair request on the LAN host while a tunnel is active', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    armFakeTunnel(bridge)
    const token = new URL(bridge.snapshot().pairingUrl ?? snapshot.pairingUrl!).searchParams.get(
      'token'
    )
    const migrated = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, {
      redirect: 'manual'
    })
    expect(migrated.status).toBe(302)
    expect(migrated.headers.get('location')).toBe('/')
    expect(migrated.headers.get('set-cookie')).toContain('dsh_mobile=')
  })


  it('requires a PIN on the tunnel and ignores a sibling device on the same public IP', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    armFakeTunnel(bridge)
    const token = new URL(bridge.snapshot().pairingUrl ?? `http://x/pair?token=missing`).searchParams.get(
      'token'
    )
    const headers = {
      host: 'active-mobile.trycloudflare.com',
      'cf-connecting-ip': '203.0.113.40',
      'cf-ray': 'test-ray'
    }
    const pinPage = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, { headers })
    expect(await pinPage.text()).toContain('Enter pairing password')
    expect(pinPage.headers.get('set-cookie')).toBeNull()

    const wrong = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '000000' })
    })
    expect(wrong.status).toBe(401)

    const verified = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '246810' })
    })
    expect(verified.status).toBe(200)
    const cookie = verified.headers.get('set-cookie')!
    expect(cookie).toContain('Secure')

    const sibling = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, { headers })
    expect(sibling.status).toBe(401)
    const owner = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, {
      headers: { ...headers, cookie: cookie.split(';', 1)[0]! }
    })
    expect(owner.status).toBe(200)
  })

  it('requires the PIN when a fixed public domain arrives through frpc', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store,
      publicUrl: () => 'https://dsh.example.com'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(bridge.snapshot().pairingUrl ?? `http://x/pair?token=missing`).searchParams.get(
      'token'
    )
    // frpc 把公网请求送到本机回环，Host 仍是用户自己的域名。
    // fetch 会丢掉自定义 Host，这里必须用 node:http 才能复现 frpc 的转发形态。
    const request = (
      path: string,
      method: string,
      headers: Record<string, string>,
      body?: string
    ): Promise<{ status?: number; setCookie?: string; text: string }> =>
      new Promise((resolve, reject) => {
        const outgoing = httpRequest(
          { host: '127.0.0.1', port: snapshot.port, path, method, headers },
          (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.once('end', () =>
              resolve({
                status: response.statusCode,
                setCookie: response.headers['set-cookie']?.[0],
                text: Buffer.concat(chunks).toString('utf8')
              })
            )
          }
        )
        outgoing.once('error', reject)
        if (body !== undefined) outgoing.write(body)
        outgoing.end()
      })

    const pinPage = await request(`/pair?token=${token}`, 'GET', { host: 'dsh.example.com' })
    expect(pinPage.status).toBe(200)
    expect(pinPage.text).toContain('Enter pairing password')
    expect(pinPage.setCookie).toBeUndefined()

    const verified = await request('/pair/verify', 'POST', {
      host: 'dsh.example.com',
      'content-type': 'application/json'
    }, JSON.stringify({ pin: '246810' }))
    expect(verified.status).toBe(200)
    expect(verified.setCookie).toContain('Secure')

    const stranger = await request('/api/status', 'GET', { host: 'dsh.example.com' })
    expect(stranger.status).toBe(401)
  })

  it('keeps the PIN gate when a public domain is rewritten to a loopback Host', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store,
      publicUrl: () => 'https://dsh.example.com'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(bridge.snapshot().pairingUrl ?? snapshot.pairingUrl!).searchParams.get('token')

    const rewritten = await new Promise<{ status?: number; setCookie?: string; text: string }>(
      (resolve, reject) => {
        const outgoing = httpRequest(
          {
            host: '127.0.0.1',
            port: snapshot.port,
            path: `/pair?token=${token}`,
            method: 'GET',
            headers: { host: `127.0.0.1:${snapshot.port}` }
          },
          (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.once('end', () =>
              resolve({
                status: response.statusCode,
                setCookie: response.headers['set-cookie']?.[0],
                text: Buffer.concat(chunks).toString('utf8')
              })
            )
          }
        )
        outgoing.once('error', reject)
        outgoing.end()
      }
    )

    expect(rewritten.status).toBe(200)
    expect(rewritten.text).toContain('Enter pairing password')
    expect(rewritten.setCookie).toBeUndefined()
  })

  it('treats every forwarding header family as public', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(snapshot.pairingUrl!).searchParams.get('token')

    for (const [name, value] of [
      ['x-forwarded-proto', 'https'],
      ['x-forwarded-host', 'dsh.example.com'],
      ['x-forwarded-port', '443'],
      ['cf-visitor', '{"scheme":"https"}']
    ]) {
      const response = await rawRequest(snapshot.port!, `/pair?token=${token}`, {
        host: `127.0.0.1:${snapshot.port}`,
        [name]: value
      })
      expect(response.status, name).toBe(200)
      expect(response.text, name).toContain('Enter pairing password')
      expect(response.setCookie, name).toBeUndefined()
    }
  })

  it('keeps a LAN cookie usable over HTTP when a fixed public domain is configured', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store,
      publicUrl: () => 'https://dsh.example.com'
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(bridge.snapshot().pairingUrl!).searchParams.get('token')

    const pinPage = await rawRequest(snapshot.port!, `/pair?token=${token}`, {
      host: `127.0.0.1:${snapshot.port}`
    })
    expect(pinPage.status).toBe(200)
    expect(pinPage.setCookie).toBeUndefined()

    const body = JSON.stringify({ pin: '246810' })
    const verified = await rawRequest(
      snapshot.port!,
      '/pair/verify',
      {
        host: `127.0.0.1:${snapshot.port}`,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body))
      },
      'POST',
      body
    )
    expect(verified.status).toBe(200)
    expect(verified.setCookie).toContain('dsh_mobile=')
    expect(verified.setCookie).not.toContain('Secure')
  })

  it('reports the fresh expiry on the first and rotated ephemeral PIN', async () => {
    let now = 1_000_000
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: memoryPinStore(),
      publicUrl: () => 'https://dsh.example.com',
      now: () => now
    })
    bridges.push(bridge)
    await bridge.start()

    const fields = () =>
      (bridge as unknown as { pairingPinFields(): { pairingPin?: string; pinExpiresAt?: number } }).pairingPinFields()
    const first = fields()
    expect(first.pairingPin).toMatch(/^[0-9]{6}$/)
    expect(first.pinExpiresAt).toBe(now + 5 * 60_000)

    now += 5 * 60_000 + 1
    const second = fields()
    expect(second.pairingPin).not.toBe(first.pairingPin)
    expect(second.pinExpiresAt).toBe(now + 5 * 60_000)
  })

  it('aborts open browser session streams when the browser is disconnected', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999'
    })
    bridges.push(bridge)
    await bridge.start()

    const abort = new AbortController()
    ;(bridge as unknown as { sessionStreamAborts: Set<AbortController> }).sessionStreamAborts.add(abort)
    bridge.suspendMobileSessions()
    expect(abort.signal.aborted).toBe(true)
  })

  it('aborts open session streams when the durable PIN changes', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: memoryPinStore({ pin: '246810', pinConsent: true })
    })
    bridges.push(bridge)
    await bridge.start()

    const abort = new AbortController()
    ;(bridge as unknown as { sessionStreamAborts: Set<AbortController> }).sessionStreamAborts.add(abort)
    expect(bridge.setDurablePin('135790')).toBe(true)
    expect(abort.signal.aborted).toBe(true)
  })

  it('rate-limits PIN guesses per IP and globally', async () => {
    const store = memoryPinStore({ pin: '111111', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    armFakeTunnel(bridge)
    const headers = {
      host: 'active-mobile.trycloudflare.com',
      'cf-connecting-ip': '203.0.113.41',
      'cf-ray': 'test-ray',
      'content-type': 'application/json'
    }
    for (let i = 0; i < 4; i++) {
      const response = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pin: '000000' })
      })
      expect(response.status).toBe(401)
    }
    const fifth = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin: '000000' })
    })
    expect(fifth.status).toBe(429)
    const limited = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin: '111111' })
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
  })




  it('does not promote a fabricated cookie over a tunnel even when the IP already has a session', async () => {
    const store = memoryPinStore({ pin: '246810', pinConsent: true })
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      pairingPinStore: store
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    armFakeTunnel(bridge)
    const headers = {
      host: 'active-mobile.trycloudflare.com',
      'cf-connecting-ip': '203.0.113.40',
      'cf-ray': 'test-ray'
    }
    const verified = await fetch(`http://127.0.0.1:${snapshot.port}/pair/verify`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '246810' })
    })
    expect(verified.status).toBe(200)
    const fabricated = 'A'.repeat(43)
    const sibling = await fetch(`http://127.0.0.1:${snapshot.port}/api/status`, {
      headers: { ...headers, cookie: `dsh_mobile=${fabricated}` }
    })
    expect(sibling.status).toBe(401)
  })


})

describe('workspace follow snapshot', () => {
  const baseline = {
    items: [
      { workspaceId: 'w1', title: 'One', path: '/one', sessionIds: ['s1'] },
      { workspaceId: 'w2', title: 'Two', path: '/two', sessionIds: [] as string[] }
    ],
    archivedSessionIds: [] as string[]
  }

  it('ignores increments until a baseline exists', () => {
    const frame = {
      type: 'upsert',
      workspace: { workspaceId: 'w1', title: 'One', path: '/one', sessionIds: ['s2', 's1'] }
    }
    expect(applyWorkspaceFollowFrame(undefined, frame)).toBeUndefined()
  })

  it('folds upsert, order, archived, and remove into the baseline', () => {
    const upserted = applyWorkspaceFollowFrame(baseline, {
      type: 'upsert',
      workspace: { workspaceId: 'w1', title: 'One', path: '/one', sessionIds: ['s2', 's1'] }
    }) as typeof baseline
    expect(upserted.items[0]?.sessionIds).toEqual(['s2', 's1'])
    expect(upserted.items[1]?.workspaceId).toBe('w2')

    const ordered = applyWorkspaceFollowFrame(upserted, {
      type: 'order',
      workspaceIds: ['w2', 'w1']
    }) as typeof baseline
    expect(ordered.items.map((item) => item.workspaceId)).toEqual(['w2', 'w1'])

    const archived = applyWorkspaceFollowFrame(ordered, {
      type: 'archived',
      archivedSessionIds: ['s9']
    }) as typeof baseline
    expect(archived.archivedSessionIds).toEqual(['s9'])

    const removed = applyWorkspaceFollowFrame(archived, {
      type: 'remove',
      workspaceId: 'w2'
    }) as typeof baseline
    expect(removed.items.map((item) => item.workspaceId)).toEqual(['w1'])
    expect(removed.archivedSessionIds).toEqual(['s9'])
    expect(baseline.items[0]?.sessionIds).toEqual(['s1'])
  })

  it('serves a created session from workspace.list after the follow upsert', async () => {
    let client: TestWebSocket | undefined
    const harness = createServer((_request, response) => {
      response.statusCode = 404
      response.end()
    })
    const pairingMux = new WebSocketServer({ noServer: true })
    webSocketServers.push(pairingMux)
    harness.on('upgrade', (request, socket, head) => {
      if (request.url !== '/api/remote.mux') return socket.destroy()
      pairingMux.handleUpgrade(request, socket, head, (connected) => {
        client = connected
        connected.send(JSON.stringify({
          type: 'item',
          streamId: 'mobile-workspaces',
          value: { type: 'baseline', value: baseline }
        }))
      })
    })
    servers.push(harness)
    await new Promise<void>((resolve) => harness.listen(0, '127.0.0.1', resolve))
    const harnessPort = (harness.address() as AddressInfo).port
    const bridge = new LanMobileBridge({
      harnessUrl: () => `http://127.0.0.1:${harnessPort}`
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const token = new URL(snapshot.pairingUrl!).searchParams.get('token')
    const paired = await fetch(`http://127.0.0.1:${snapshot.port}/pair?token=${token}`, {
      redirect: 'manual'
    })
    const cookie = paired.headers.get('set-cookie')!.split(';', 1)[0]!
    const readWorkspaces = async (): Promise<{ ok?: boolean; value?: typeof baseline }> => {
      const response = await fetch(`http://127.0.0.1:${snapshot.port}/api/rpc`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'workspace.list', payload: {} })
      })
      return response.json() as Promise<{ ok?: boolean; value?: typeof baseline }>
    }
    const until = async (
      predicate: (value: typeof baseline) => boolean
    ): Promise<typeof baseline> => {
      const started = Date.now()
      let latest: { ok?: boolean; value?: typeof baseline } | undefined
      while (Date.now() - started < 2000) {
        latest = await readWorkspaces()
        if (latest.ok === true && latest.value && predicate(latest.value)) return latest.value
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      throw new Error(`workspace snapshot did not update: ${JSON.stringify(latest)}`)
    }

    await until((value) => value.items[0]?.sessionIds?.[0] === 's1')
    client?.send(JSON.stringify({
      type: 'item',
      streamId: 'mobile-workspaces',
      value: {
        type: 'upsert',
        workspace: { workspaceId: 'w1', title: 'One', path: '/one', sessionIds: ['s2', 's1'] }
      }
    }))
    const created = await until((value) => value.items.some((item) => item.sessionIds?.includes('s2')))
    expect(created.items.find((item) => item.workspaceId === 'w1')?.sessionIds).toEqual(['s2', 's1'])

    client?.send(JSON.stringify({
      type: 'item',
      streamId: 'mobile-workspaces',
      value: { type: 'order', workspaceIds: ['w2', 'w1'] }
    }))
    const ordered = await until((value) => value.items[0]?.workspaceId === 'w2')
    expect(ordered.items.map((item) => item.workspaceId)).toEqual(['w2', 'w1'])

    client?.send(JSON.stringify({
      type: 'item',
      streamId: 'mobile-workspaces',
      value: { type: 'archived', archivedSessionIds: ['s9'] }
    }))
    const archived = await until((value) => value.archivedSessionIds.includes('s9'))
    expect(archived.archivedSessionIds).toEqual(['s9'])

    client?.send(JSON.stringify({
      type: 'item',
      streamId: 'mobile-workspaces',
      value: { type: 'remove', workspaceId: 'w2' }
    }))
    const removed = await until((value) => value.items.length === 1)
    expect(removed.items.map((item) => item.workspaceId)).toEqual(['w1'])
  })
})

describe('mobile session rename', () => {
  it('forwards session.rename as a request envelope', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { renamed: true }
    }))
    const response = await mobileRpc(port, cookie, 'session.rename', {
      sessionId: 'session-1',
      title: '周报'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, value: { renamed: true } })
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]).toMatchObject({
      method: 'session/rename',
      payload: { args: { request: { sessionId: 'session-1', title: '周报' } } }
    })
  })

  it('rejects empty and overlong titles with invalid-title', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    for (const title of ['   ', '标'.repeat(201)]) {
      const response = await mobileRpc(port, cookie, 'session.rename', {
        sessionId: 'session-1',
        title
      })
      expect(response.status, title).toBe(400)
      expect(await response.json(), title).toMatchObject({ ok: false, code: 'invalid-title' })
    }
    expect(forwarded).toHaveLength(0)
  })
})

describe('mobile session search', () => {
  it('forwards the trimmed search query', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { hits: [] }
    }))
    const response = await mobileRpc(port, cookie, 'session.search', { query: '  发布  ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, value: { hits: [] } })
    expect(forwarded[0]).toMatchObject({
      method: 'session/search',
      payload: { args: { request: { query: '发布' } } }
    })
  })

  it('passes through session/search-unavailable', async () => {
    const { port, cookie } = await pairedForwardingBridge(() => ({
      ok: false,
      code: 'session/search-unavailable',
      message: '搜索索引尚未就绪。'
    }))
    const response = await mobileRpc(port, cookie, 'session.search', { query: '发布' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'session/search-unavailable',
      error: '搜索索引尚未就绪。'
    })
  })
})

describe('mobile session archive', () => {
  it('forwards stopActivity only when it is true', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { archived: true }
    }))
    const plain = await mobileRpc(port, cookie, 'workspace.archiveSession', { sessionId: 'session-1' })
    expect(plain.status).toBe(200)
    const stopped = await mobileRpc(port, cookie, 'workspace.archiveSession', {
      sessionId: 'session-2',
      stopActivity: true
    })
    expect(stopped.status).toBe(200)
    expect(forwarded.map((item) => item.method)).toEqual([
      'workspace/archiveSession',
      'workspace/archiveSession'
    ])
    expect(forwarded.map((item) => item.payload!.args)).toEqual([
      { request: { sessionId: 'session-1' } },
      { request: { sessionId: 'session-2', stopActivity: true } }
    ])
  })

  it('passes through workspace/session-active', async () => {
    const { port, cookie } = await pairedForwardingBridge(() => ({
      ok: false,
      code: 'workspace/session-active',
      message: '会话仍在运行，无法归档。'
    }))
    const response = await mobileRpc(port, cookie, 'workspace.archiveSession', {
      sessionId: 'session-1',
      stopActivity: true
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'workspace/session-active',
      error: '会话仍在运行，无法归档。'
    })
  })
})

describe('mobile queue actions', () => {
  it('forwards remove, steer, and edit queue actions', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { updated: true }
    }))
    for (const [itemId, action] of [
      ['item-1', { kind: 'remove' }],
      ['item-2', { kind: 'steer' }],
      ['item-3', { kind: 'edit', content: [{ type: 'text', text: '改好的内容' }] }]
    ] as const) {
      const response = await mobileRpc(port, cookie, 'session.updateQueue', {
        sessionId: 'session-1',
        itemId,
        action
      })
      expect(response.status, itemId).toBe(200)
    }
    expect(forwarded.map((item) => item.method)).toEqual([
      'session/updateQueue',
      'session/updateQueue',
      'session/updateQueue'
    ])
    expect(forwarded.map((item) => item.payload!.args)).toEqual([
      { request: { sessionId: 'session-1', itemId: 'item-1', action: { kind: 'remove' } } },
      { request: { sessionId: 'session-1', itemId: 'item-2', action: { kind: 'steer' } } },
      {
        request: {
          sessionId: 'session-1',
          itemId: 'item-3',
          action: { kind: 'edit', content: [{ type: 'text', text: '改好的内容' }] }
        }
      }
    ])
  })

  it('rejects unknown actions and oversized edit text', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    const unknown = await mobileRpc(port, cookie, 'session.updateQueue', {
      sessionId: 'session-1',
      itemId: 'item-1',
      action: { kind: 'delete' }
    })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({ ok: false, code: 'invalid-action' })

    const oversized = await mobileRpc(port, cookie, 'session.updateQueue', {
      sessionId: 'session-1',
      itemId: 'item-1',
      action: { kind: 'edit', content: [{ type: 'text', text: 'a'.repeat(32 * 1024 + 1) }] }
    })
    expect(oversized.status).toBe(400)
    expect(await oversized.json()).toMatchObject({ ok: false, code: 'text-too-large' })
    expect(forwarded).toHaveLength(0)
  })
})

describe('mobile file uploads', () => {
  it('forwards the upload as agentId plus file request', async () => {
    const data = Buffer.from('mobile file body').toString('base64')
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { receiptId: 'receipt-1' }
    }))
    const response = await mobileRpc(port, cookie, 'fileUploads.upload', {
      agent: 'session-1',
      request: { data, name: 'report.txt' }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, value: { receiptId: 'receipt-1' } })
    expect(forwarded[0]).toMatchObject({
      method: 'fileUploads/upload',
      payload: { args: { agentId: 'session-1', request: { data, name: 'report.txt' } } }
    })
  })

  it('rejects non-canonical base64 with invalid-file-data', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    const response = await mobileRpc(port, cookie, 'fileUploads.upload', {
      agent: 'session-1',
      request: { data: 'not+canonical', name: 'broken.txt' }
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'invalid-file-data' })
    expect(forwarded).toHaveLength(0)
  })

  it('sanitizes the uploaded file name before forwarding', async () => {
    const data = Buffer.from('x').toString('base64')
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    const response = await mobileRpc(port, cookie, 'fileUploads.upload', {
      agent: 'session-1',
      request: { data, name: '  报告/2026\u0007.txt  ' }
    })
    expect(response.status).toBe(200)
    expect(forwarded[0]!.payload!.args).toEqual({
      agentId: 'session-1',
      request: { data, name: '报告2026.txt' }
    })
  })
})

describe('mobile prompt file receipts', () => {
  const ONE_PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='

  function promptPayload(content: unknown[], requestId = 'prompt-1'): Record<string, unknown> {
    return {
      sessionId: 'session-1',
      mode: 'steer',
      requestId,
      content,
      clientTimeZone: 'Asia/Shanghai'
    }
  }

  it('forwards a file receipt block to the host', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({
      ok: true,
      value: { accepted: true }
    }))
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload([{ type: 'file', receiptId: 'receipt-1', name: 'report.txt' }])
    )
    expect(response.status).toBe(200)
    expect(forwarded).toHaveLength(1)
    expect(forwarded[0]!.payload!.args!.request!.content).toEqual([
      { type: 'file', receiptId: 'receipt-1' }
    ])
  })

  it('rejects an empty receipt with invalid-file-data', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    const response = await mobileRpc(
      port,
      cookie,
      'session.prompt',
      promptPayload([{ type: 'file', receiptId: '   ' }])
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'invalid-file-data' })
    expect(forwarded).toHaveLength(0)
  })

  it('counts images and files against one six-attachment budget', async () => {
    const { port, cookie, forwarded } = await pairedForwardingBridge(() => ({ ok: true }))
    const content = [
      ...Array.from({ length: 6 }, (_, index) => ({
        type: 'image',
        mediaType: 'image/png',
        data: ONE_PIXEL_PNG,
        name: `image-${index}.png`
      })),
      { type: 'file', receiptId: 'receipt-7', name: 'extra.txt' }
    ]
    const response = await mobileRpc(port, cookie, 'session.prompt', promptPayload(content))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, code: 'too-many-files' })
    expect(forwarded).toHaveLength(0)
  })
})
