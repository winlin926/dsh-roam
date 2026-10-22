import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LanMobileBridge } from '../lib/bridge/lan-mobile-bridge.js'
import { createMobileApiHost, isMobileApiPath } from '../lib/bridge/mobile-api-host.js'

const DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-roam-mobile-api-'))
process.env.DSH_HOME = DSH_HOME

const bridges: LanMobileBridge[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    }))
  )
})

afterAll(async () => {
  await rm(DSH_HOME, { recursive: true, force: true })
})

function context(gateway: (request: { namespace: string; method: string; args: unknown }) => unknown = () => ({})) {
  const services = new Map<string, unknown>()
  services.set('sessions', {})
  services.set('typertGateway', {
    invoke: async (request: { namespace: string; method: string; args: unknown }) => gateway(request),
    stream: async () => ({})
  })
  const ctx: Record<string, any> = {
    get(name: string) {
      return services.get(name)
    },
    reflect: {
      provide(name: string, value: unknown) {
        services.set(name, value)
        Object.defineProperty(ctx, name, { get: () => value, configurable: true })
      }
    },
    logger: { warn: () => undefined },
    webServer: { port: 58562 }
  }
  return ctx
}

function call(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk as Buffer))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf8')
      }))
    })
    request.on('error', reject)
    if (options.body) request.write(options.body)
    request.end()
  })
}

async function startBridge(
  pin: string,
  pinEnabled = true,
  gateway?: (request: { namespace: string; method: string; args: unknown }) => unknown
) {
  let bridge: LanMobileBridge | undefined
  const host = createMobileApiHost({
    ctx: context(gateway),
    pin: () => pin,
    pinEnabled: () => pinEnabled,
    port: () => bridge?.localPort(),
    tunnel: () => ({ active: false }),
    protectedPorts: () => new Set([58562])
  })
  bridge = new LanMobileBridge({
    port: 0,
    harnessUrl: () => 'http://127.0.0.1:1',
    mobileApi: host,
    lanAddress: '127.0.0.1'
  })
  bridges.push(bridge)
  const snapshot = await bridge.start()
  return { bridge, host, port: snapshot.port as number }
}

describe('embedded mobile API', () => {
  it('recognizes only the mobile API prefix', () => {
    expect(isMobileApiPath('/api/mobile')).toBe(true)
    expect(isMobileApiPath('/api/mobile/v1/health')).toBe(true)
    expect(isMobileApiPath('/api/mobiles')).toBe(false)
    expect(isMobileApiPath('/api/relay/status')).toBe(false)
  })

  it('serves health through the bridge without a browser pairing cookie', async () => {
    const { port } = await startBridge('246810')
    const result = await call(port, '/api/mobile/v1/health')
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({
      ok: true,
      service: 'dsh-mobile-plugin',
      apiVersion: '1'
    })
  })

  it('uses the dsh-roam PIN for pairing and accepts the issued device credential', async () => {
    const { port } = await startBridge('246810')
    const paired = await call(port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '246810', device: { name: 'test-phone' } })
    })
    expect(paired.status).toBe(200)
    const payload = JSON.parse(paired.body) as { token?: string; deviceCredential?: string }
    expect(payload.token).toBeTruthy()
    expect(payload.deviceCredential).toMatch(/^dshc_/)

    const status = await call(port, '/api/mobile/v1/status', {
      headers: { 'x-dsh-device-credential': payload.deviceCredential as string }
    })
    expect(status.status).toBe(200)
    expect(JSON.parse(status.body)).toMatchObject({ ok: true })
  })

  it('serves the session list through the host gateway bridge', async () => {
    const { port } = await startBridge('246810', true, (request) => {
      if (request.namespace === 'session' && request.method === 'list') return { items: [] }
      if (request.namespace === 'workspace' && request.method === 'list') {
        return { archivedSessionIds: [], pinnedSessionIds: [] }
      }
      return {}
    })
    const paired = await call(port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '246810', device: {} })
    })
    const credential = (JSON.parse(paired.body) as { deviceCredential: string }).deviceCredential
    const sessions = await call(port, '/api/mobile/v1/sessions', {
      headers: { 'x-dsh-device-credential': credential }
    })
    expect(sessions.status).toBe(200)
    expect(JSON.parse(sessions.body)).toMatchObject({ ok: true, items: [] })
  })

  it('keeps a paired device accepted after the plugin restarts', async () => {
    const first = await startBridge('246810')
    const paired = await call(first.port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '246810', device: { name: 'persistent-phone' } })
    })
    const credential = (JSON.parse(paired.body) as { deviceCredential: string }).deviceCredential
    await first.bridge.stop()

    const second = await startBridge('135790')
    const status = await call(second.port, '/api/mobile/v1/status', {
      headers: { 'x-dsh-device-credential': credential }
    })
    expect(status.status).toBe(200)
    expect(JSON.parse(status.body)).toMatchObject({ ok: true })
  })

  it('rejects a wrong PIN and a disabled fixed PIN', async () => {
    const { port } = await startBridge('246810')
    const wrong = await call(port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '000000', device: {} })
    })
    expect(wrong.status).toBe(401)

    const disabled = await startBridge('246810', false)
    const rejected = await call(disabled.port, '/api/mobile/v1/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '246810', device: {} })
    })
    expect(rejected.status).toBe(409)
    expect(JSON.parse(rejected.body)).toMatchObject({ error: { code: 'pairing-disabled' } })
  })
})
