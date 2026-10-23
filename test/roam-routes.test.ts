import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply as applyPhoneBridge } from '../lib/index.js'
import { readPairingPinState } from '../lib/bridge/pairing-pin-store.js'

/**
 * The settings panel is served from the harness origin, so its routes never
 * cross an origin boundary. The tunnel launchers are stubbed at the module
 * level: these tests must never download cloudflared or open ssh.
 */
vi.mock('../lib/bridge/cloudflared-tunnel.js', () => ({
  ensureCloudflaredBinary: async () => 'stub-cloudflared',
  startCloudflareQuickTunnel: async () => ({
    provider: 'cloudflare',
    url: 'https://stub-mobile.trycloudflare.com',
    process: {},
    stop: async () => undefined,
  }),
}))

vi.mock('../lib/bridge/pinggy-tunnel.js', () => ({
  startPinggyTunnel: async () => ({
    provider: 'pinggy',
    url: 'https://stub-mobile.a.pinggy.link',
    process: {},
    stop: async () => undefined,
  }),
}))

const HARNESS_ORIGIN = 'http://127.0.0.1:58562'
const STATE_FIELDS = [
  'ready',
  'qrSvg',
  'lanQrSvg',
  'pairingUrl',
  'lanUrls',
  'connected',
  'browserConnected',
  'tunnelActive',
  'tunnelLoading',
  'tunnelProvider',
  'tunnelUrl',
  'tunnelError',
  'pairingPin',
  'pinConsent',
  'pinExpiresAt',
  'expiresAt',
  'expectedPort',
]

interface HarnessRoute {
  kind: string
  path: string
  handler(request: IncomingMessage, response: ServerResponse): void
}

interface HarnessContext {
  effect(callback: () => unknown): unknown
  logger: { warn(message: string): void }
  connection: Record<string, never>
  webServer: {
    origin: string
    register(route: HarnessRoute): () => void
  }
}

const servers: ReturnType<typeof createServer>[] = []
const disposers: unknown[] = []
const tempDirectories: string[] = []

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    if (typeof dispose === 'function') {
      await (dispose as () => unknown)()
    }
  }
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function harnessContext(routes: HarnessRoute[]): HarnessContext {
  return {
    effect: (callback) => {
      const dispose = callback()
      disposers.push(dispose)
      return dispose
    },
    logger: { warn: () => undefined },
    connection: {},
    webServer: {
      origin: HARNESS_ORIGIN,
      register: (route) => {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
  }
}

let harnessPortCounter = 45200

async function startHarness(config: { pinFile?: string; settingsFile?: string } = {}) {
  const routes: HarnessRoute[] = []
  // Each harness gets its own settings + pin files so a test run never reads
  // the real ~/.dsh/phone-bridge configuration on this machine.
  const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-harness-'))
  tempDirectories.push(directory)
  process.env.DSH_HOME = directory
  const settingsFile = config.settingsFile ?? join(directory, 'settings.json')
  const pinFile = config.pinFile ?? join(directory, 'mobile-pairing-pin.json')
  applyPhoneBridge(harnessContext(routes) as never, { port: harnessPortCounter++, ...config, pinFile, settingsFile })
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', HARNESS_ORIGIN).pathname
    const route = routes.find((candidate) => candidate.path === pathname)
    if (!route) {
      response.writeHead(404)
      response.end()
      return
    }
    route.handler(request, response)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { routes, port: (server.address() as AddressInfo).port }
}

async function getJson(port: number, path: string) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function postJson(port: number, path: string, payload?: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function readyState(port: number): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await getJson(port, '/phone-bridge/state')
    if (response.status === 200 && response.body.ready === true) return response.body
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('the bridge never started listening')
}

/** Drives one handler with a caller address the TCP loopback cannot produce. */
function callDirectly(route: HarnessRoute, remoteAddress: string) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    let status = 200
    const response = {
      setHeader: () => undefined,
      writeHead(next: number) {
        status = next
        return this
      },
      end(chunk?: string) {
        resolve({ status, body: chunk ?? '' })
      },
    }
    const request = { socket: { remoteAddress }, method: 'GET', url: route.path, headers: {} }
    route.handler(request as unknown as IncomingMessage, response as unknown as ServerResponse)
  })
}

describe('phone bridge settings routes', () => {
  it('serves a same-origin state payload with an inline QR and a pairing URL', async () => {
    const { port } = await startHarness()
    const state = await readyState(port)

    for (const field of STATE_FIELDS) expect(state).toHaveProperty(field)
    expect(state.ready).toBe(true)
    expect(state.qrSvg).toMatch(/^<svg/)
    expect(state.qrSvg).toContain('<path')
    expect(state.lanQrSvg).toBe(state.qrSvg)
    expect(state.pairingUrl).toMatch(/^http:\/\/.+\/pair\?token=/)
    expect(state.connected).toBe(false)
    expect(state.tunnelActive).toBe(false)
    expect(state.tunnelError).toBeNull()

    const again = await getJson(port, '/phone-bridge/state')
    expect(again.status).toBe(200)
    expect(again.body.qrSvg).toMatch(/^<svg/)
  })

  it('lists every LAN pairing URL with the same token as pairingUrl', async () => {
    const { port } = await startHarness()
    const state = await readyState(port)
    const pairingUrl = String(state.pairingUrl)
    const token = new URL(pairingUrl).searchParams.get('token')
    expect(token).toBeTruthy()
    const lanUrls = state.lanUrls as string[]
    expect(Array.isArray(lanUrls)).toBe(true)
    expect(lanUrls.length).toBeGreaterThan(0)
    expect(lanUrls[0]).toBe(pairingUrl)
    for (const lanUrl of lanUrls) {
      expect(new URL(lanUrl).searchParams.get('token')).toBe(token)
    }
  })

  it('keeps the state route closed to non-loopback callers', async () => {
    const { routes, port } = await startHarness()
    await readyState(port)
    const stateRoute = routes.find((route) => route.path === '/phone-bridge/state')
    expect(stateRoute).toBeTruthy()

    const lanCaller = await callDirectly(stateRoute!, '192.168.1.50')
    expect(lanCaller.status).toBe(403)
    expect(lanCaller.body).not.toContain('pairingUrl')

    const mappedCaller = await callDirectly(stateRoute!, '::ffff:192.168.1.51')
    expect(mappedCaller.status).toBe(403)
  })

  it('enables, falls back, and disables the tunnel through the same-origin routes', async () => {
    const { port } = await startHarness()

    const invalid = await postJson(port, '/phone-bridge/tunnel', {})
    expect(invalid.status).toBe(400)
    expect(invalid.body.ok).toBe(false)
    expect(invalid.body.tunnelActive).toBe(false)

    const enabled = await postJson(port, '/phone-bridge/tunnel', { enabled: true })
    expect(enabled.status).toBe(200)
    expect(enabled.body.ok).toBe(true)
    expect(enabled.body.tunnelActive).toBe(true)
    expect(enabled.body.tunnelProvider).toBe('cloudflare')
    expect(enabled.body.tunnelUrl).toBe('https://stub-mobile.trycloudflare.com')

    const fallback = await postJson(port, '/phone-bridge/tunnel/fallback')
    expect(fallback.status).toBe(200)
    expect(fallback.body.ok).toBe(true)
    expect(fallback.body.tunnelProvider).toBe('pinggy')
    expect(fallback.body.tunnelUrl).toBe('https://stub-mobile.a.pinggy.link')

    const disabled = await postJson(port, '/phone-bridge/tunnel', { enabled: false })
    expect(disabled.status).toBe(200)
    expect(disabled.body.tunnelActive).toBe(false)

    const lateFallback = await postJson(port, '/phone-bridge/tunnel/fallback')
    expect(lateFallback.status).toBe(409)
    expect(lateFallback.body.ok).toBe(false)
    expect(String(lateFallback.body.error)).toContain('Fallback is only available')
    expect(lateFallback.body.tunnelActive).toBe(false)
  })

  it('reports the phone conflict as JSON and disconnects without dropping the route', async () => {
    const { port } = await startHarness()
    const state = await readyState(port)
    const pairedToken = new URL(String(state.pairingUrl)).searchParams.get('token')
    const bridgePort = new URL(String(state.pairingUrl)).port
    expect(pairedToken).toBeTruthy()

    const paired = await fetch(
      `http://127.0.0.1:${bridgePort}/pair?token=${pairedToken}`,
      { redirect: 'manual' }
    )
    expect(paired.status).toBe(302)

    const connected = await getJson(port, '/phone-bridge/state')
    expect(connected.body.connected).toBe(true)
    // The consumed token would render a dead QR, so the state read mints one.
    expect(connected.body.qrSvg).toMatch(/^<svg/)
    const renewed = new URL(String(connected.body.pairingUrl)).searchParams.get('token')
    expect(renewed).toBeTruthy()
    expect(renewed).not.toBe(pairedToken)

    const conflict = await postJson(port, '/phone-bridge/tunnel', { enabled: true })
    expect(conflict.status).toBe(409)
    expect(conflict.body.ok).toBe(false)
    expect(String(conflict.body.error)).toContain('Disconnect the phone')
    expect(conflict.body.connected).toBe(true)

    const disconnected = await postJson(port, '/phone-bridge/disconnect')
    expect(disconnected.status).toBe(200)
    expect(disconnected.body.ok).toBe(true)
    expect(disconnected.body.connected).toBe(false)
    const rotated = new URL(String(disconnected.body.pairingUrl)).searchParams.get('token')
    expect(rotated).toBeTruthy()
    expect(rotated).not.toBe(pairedToken)
  })

  it('writes the pairing password the panel saves and clears it on an empty value', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-pin-'))
    const pinFile = join(directory, 'mobile-pairing-pin.json')
    const { port } = await startHarness({ pinFile })
    await readyState(port)

    await postJson(port, '/phone-bridge/tunnel', { enabled: true })
    const before = await getJson(port, '/phone-bridge/state')
    expect(before.body.pairingPin).toMatch(/^\d{6}$/)
    expect(before.body.pinConsent).toBe(false)
    await expect(readFile(pinFile, 'utf8')).rejects.toThrow()

    const saved = await postJson(port, '/phone-bridge/pin', { pin: '051109' })
    expect(saved.status).toBe(200)
    expect(saved.body.ok).toBe(true)
    expect(saved.body.pinConsent).toBe(true)
    expect(saved.body.pairingPin).toBe('051109')
    expect(JSON.parse(await readFile(pinFile, 'utf8'))).toEqual({ pinConsent: true, pin: '051109' })

    const cleared = await postJson(port, '/phone-bridge/pin', { pin: '' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.ok).toBe(true)
    expect(cleared.body.pinConsent).toBe(false)
    expect(readPairingPinState(pinFile)).toEqual({})

    const invalid = await postJson(port, '/phone-bridge/pin', { pin: '12ab' })
    expect(invalid.status).toBe(400)
    expect(invalid.body.ok).toBe(false)
    expect(readPairingPinState(pinFile)).toEqual({})
  })
})
