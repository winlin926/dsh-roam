import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net, { type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { apply as applyPhoneBridge } from '../lib/index.js'
import { normalizePublicUrl, readBridgeSettings } from '../lib/bridge/public-url-settings.js'
import { readPairingPinState } from '../lib/bridge/pairing-pin-store.js'

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

const HARNESS_ORIGIN = 'http://127.0.0.1:58563'
const QR_OPTIONS = { type: 'svg' as const, margin: 1, width: 260 }
const STATE_FIELDS = [
  'ready',
  'qrSvg',
  'pairingUrl',
  'lanUrls',
  'desktopUrl',
  'connected',
  'browserConnected',
  'onlineDeviceCount',
  'tunnelActive',
  'tunnelLoading',
  'tunnelProvider',
  'tunnelUrl',
  'tunnelError',
  'pairingPin',
  'pinConsent',
  'pinExpiresAt',
  'expiresAt',
  'publicUrl',
  'publicUrlConfigured',
  'mode',
  'bridgePort',
  'expectedPort',
  'portMatchesTunnel',
  'lastPublicUrlCheck',
  'devices',
  'certificate',
  'version',
  'now',
]

interface ProbeResult {
  reachable: boolean
  status: number | null
  error: string | null
}

interface PluginConfig {
  pinFile?: string
  settingsFile?: string
  port?: number
  probePublicUrl?: (url: string) => Promise<ProbeResult>
}

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

async function stopAll(): Promise<void> {
  for (const dispose of disposers.splice(0).reverse()) {
    if (typeof dispose === 'function') await (dispose as () => unknown)()
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
}

afterEach(async () => {
  await stopAll()
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
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

let portCounter = 45100

async function startHarness(config: PluginConfig = {}) {
  const routes: HarnessRoute[] = []
  // Every harness gets its own port and its own settings/pin files: the real
  // DSH host owns 43128 and the user's durable password must never leak in.
  const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-run-'))
  tempDirectories.push(directory)
  process.env.DSH_HOME = directory
  const pinFile = config.pinFile ?? join(directory, 'mobile-pairing-pin.json')
  const settingsFile = config.settingsFile ?? join(directory, 'settings.json')
  applyPhoneBridge(harnessContext(routes) as never, { port: portCounter++, ...config, pinFile, settingsFile })
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

async function tempSettingsFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-settings-'))
  tempDirectories.push(directory)
  return join(directory, 'settings.json')
}

async function getJson(port: number, path: string) {
  const response = await fetch('http://127.0.0.1:' + port + path)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function postJson(port: number, path: string, payload?: unknown) {
  const response = await fetch('http://127.0.0.1:' + port + path, {
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

async function unusedPort(): Promise<number> {
  for (;;) {
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if (port !== 43128) return port
  }
}

describe('first-run defaults', () => {
  it('starts without a fixed public domain or a stored password', async () => {
    const settingsFile = await tempSettingsFile()
    const { port } = await startHarness({ settingsFile })
    const state = await readyState(port)
    expect(state.publicUrl).toBeNull()
    expect(state.publicUrlConfigured).toBe(false)
    expect(state.mode).toBe('lan')
    expect(state.pairingPin).toBeNull()
    expect(state.qrSvg).toMatch(/^<svg/)
  })
})

describe('fixed public URL validation', () => {
  it('accepts public origins and normalizes a trailing slash', () => {
    expect(normalizePublicUrl('https://dsh.example.com')).toBe('https://dsh.example.com')
    expect(normalizePublicUrl('https://dsh.example.com/')).toBe('https://dsh.example.com')
    expect(normalizePublicUrl('  https://DSH.Example.Com/  ')).toBe('https://dsh.example.com')
    expect(normalizePublicUrl('https://sub.example.com/')).toBe('https://sub.example.com')
    expect(normalizePublicUrl('https://sub.example.com:8443/')).toBe('https://sub.example.com:8443')
    expect(normalizePublicUrl('   ')).toBeNull()
  })

  it('rejects non-http schemes, paths, private hosts and garbage', () => {
    const invalid = [
      'ftp://dsh.example.com',
      'https://dsh.example.com/pair',
      'https://dsh.example.com?token=1',
      'https://dsh.example.com#fragment',
      'https://user@dsh.example.com',
      'localhost',
      'http://localhost:43128',
      '127.0.0.1',
      'http://127.0.0.1:43128',
      '192.168.1.10',
      'http://192.168.1.10:43128',
      'http://10.0.0.1',
      'http://172.16.0.1',
      'http://169.254.1.1',
      'http://[::1]/',
      'https://printer.local',
      'https://',
      'not a url',
      'https://nodot',
    ]
    for (const value of invalid) {
      expect(() => normalizePublicUrl(value), value).toThrow()
    }
  })
})

describe('phone bridge fixed public URL routes', () => {
  it('persists the setting across a new plugin instance and reads a corrupt file as unconfigured', async () => {
    const settingsFile = await tempSettingsFile()
    const first = await startHarness({ settingsFile })
    const saved = await postJson(first.port, '/phone-bridge/settings', {
      publicUrl: 'https://dsh.example.com/',
    })
    expect(saved.status).toBe(200)
    expect(saved.body.publicUrl).toBe('https://dsh.example.com')
    expect(saved.body.publicUrlConfigured).toBe(true)
    expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual({
      publicUrl: 'https://dsh.example.com',
    })
    await stopAll()

    const second = await startHarness({ settingsFile })
    const restored = await readyState(second.port)
    expect(restored.publicUrl).toBe('https://dsh.example.com')
    expect(restored.publicUrlConfigured).toBe(true)
    expect(restored.mode).toBe('fixed')
    await stopAll()

    await writeFile(settingsFile, '{not json', 'utf8')
    const third = await startHarness({ settingsFile })
    const unconfigured = await readyState(third.port)
    expect(unconfigured.publicUrl).toBeNull()
    expect(unconfigured.publicUrlConfigured).toBe(false)
    expect(unconfigured.mode).toBe('lan')
  })

  it('serves the fixed pairing URL, matching QR, and rotates the token', async () => {
    const settingsFile = await tempSettingsFile()
    const { port } = await startHarness({ settingsFile })
    const saved = await postJson(port, '/phone-bridge/settings', {
      publicUrl: 'https://dsh.example.com/',
    })
    expect(saved.status).toBe(200)

    const state = await readyState(port)
    for (const field of STATE_FIELDS) expect(state).toHaveProperty(field)
    expect(Array.isArray(state.devices)).toBe(true)
    expect(state.certificate).toEqual(expect.objectContaining({ selfSigned: expect.any(Boolean), pending: expect.any(Boolean) }))
    expect(state.publicUrl).toBe('https://dsh.example.com')
    expect(state.publicUrlConfigured).toBe(true)
    expect(state.mode).toBe('fixed')
    // A named tunnel is public access even though this process did not start it,
    // so the fixed domain must still demand the six-digit password.
    expect(state.pairingPin).toMatch(/^[0-9]{6}$/)
    expect(state.pairingUrl).toMatch(/^https:[/][/]dsh[.]example[.]com[/]pair[?]token=/)
    // The LAN list never repeats the public origin: that address has its own card.
    expect(state.lanUrls).not.toContain(state.pairingUrl)
    expect((state.lanUrls as string[]).every((url) => url.startsWith('http://'))).toBe(true)
    expect(state.qrSvg).toMatch(/^<svg/)
    const expectedQr = await QRCode.toString(String(state.pairingUrl), QR_OPTIONS)
    expect(state.qrSvg).toBe(expectedQr)

    const before = new URL(String(state.pairingUrl)).searchParams.get('token')
    const rotated = await postJson(port, '/phone-bridge/pairing/rotate')
    expect(rotated.status).toBe(200)
    expect(rotated.body.mode).toBe('fixed')
    const after = new URL(String(rotated.body.pairingUrl)).searchParams.get('token')
    expect(after).toBeTruthy()
    expect(after).not.toBe(before)
  })

  it('answers 400 with a Chinese message for invalid settings and clears on an empty string', async () => {
    const settingsFile = await tempSettingsFile()
    const { port } = await startHarness({ settingsFile })

    for (const publicUrl of [
      'ftp://dsh.example.com',
      'https://dsh.example.com/pair',
      'http://127.0.0.1:43128',
      'nonsense',
    ]) {
      const response = await postJson(port, '/phone-bridge/settings', { publicUrl })
      expect(response.status, publicUrl).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(String(response.body.error)).toContain('公网域名')
    }
    const missing = await postJson(port, '/phone-bridge/settings', {})
    expect(missing.status).toBe(400)
    expect(String(missing.body.error)).toContain('请提供要保存的设置')

    const saved = await postJson(port, '/phone-bridge/settings', {
      publicUrl: 'https://dsh.example.com',
    })
    expect(saved.status).toBe(200)
    expect(readBridgeSettings(settingsFile).publicUrl).toBe('https://dsh.example.com')

    const cleared = await postJson(port, '/phone-bridge/settings', { publicUrl: '   ' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.publicUrl).toBeNull()
    expect(cleared.body.publicUrlConfigured).toBe(false)
    expect(cleared.body.mode).toBe('lan')
    expect(readBridgeSettings(settingsFile).publicUrl).toBeNull()
  })

  it('answers 409 on both temporary tunnel routes once a public URL is configured', async () => {
    const settingsFile = await tempSettingsFile()
    const { port } = await startHarness({ settingsFile })
    await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://dsh.example.com' })

    const tunnel = await postJson(port, '/phone-bridge/tunnel', { enabled: true })
    expect(tunnel.status).toBe(409)
    expect(tunnel.body.ok).toBe(false)
    expect(tunnel.body.error).toBe('已配置固定公网域名，临时隧道已停用。')
    expect(tunnel.body.mode).toBe('fixed')
    expect(tunnel.body.tunnelActive).toBe(false)

    const fallback = await postJson(port, '/phone-bridge/tunnel/fallback')
    expect(fallback.status).toBe(409)
    expect(fallback.body.error).toBe('已配置固定公网域名，临时隧道已停用。')
    expect(fallback.body.mode).toBe('fixed')
  })

  it('stops the temporary tunnel when a fixed public domain is saved', async () => {
    const settingsFile = await tempSettingsFile()
    const { port } = await startHarness({ settingsFile })
    const enabled = await postJson(port, '/phone-bridge/tunnel', { enabled: true })
    expect(enabled.status).toBe(200)
    expect(enabled.body.tunnelActive).toBe(true)

    const saved = await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://dsh.example.com' })
    expect(saved.status).toBe(200)
    expect(saved.body.tunnelActive).toBe(false)
    expect(saved.body.tunnelUrl).toBeNull()

    const state = await readyState(port)
    expect(state.tunnelActive).toBe(false)
    expect(String(state.pairingUrl)).toContain('https://dsh.example.com')
  })

  it('reports portMatchesTunnel false when the bridge port is not 43128', async () => {
    const settingsFile = await tempSettingsFile()
    const port = await unusedPort()
    const harness = await startHarness({ settingsFile, port })
    const state = await readyState(harness.port)
    expect(state.bridgePort).toBe(port)
    expect(state.portMatchesTunnel).toBe(false)
  })

  it('records the injected public URL check and clears it when the setting changes', async () => {
    const settingsFile = await tempSettingsFile()
    const calls: string[] = []
    const { port } = await startHarness({
      settingsFile,
      probePublicUrl: async (url) => {
        calls.push(url)
        return { reachable: false, status: null, error: 'connect ECONNREFUSED' }
      },
    })

    const missing = await postJson(port, '/phone-bridge/public-url/test')
    expect(missing.status).toBe(400)
    expect(String(missing.body.error)).toContain('公网域名')

    await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://dsh.example.com' })
    const checked = await postJson(port, '/phone-bridge/public-url/test')
    expect(checked.status).toBe(200)
    expect(calls).toEqual(['https://dsh.example.com'])
    const check = checked.body.lastPublicUrlCheck as Record<string, unknown>
    expect(check.reachable).toBe(false)
    expect(check.status).toBeNull()
    expect(check.error).toBe('connect ECONNREFUSED')
    expect(typeof check.at).toBe('number')

    const state = await getJson(port, '/phone-bridge/state')
    expect(state.body.lastPublicUrlCheck).toEqual(check)

    await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://other.example.com' })
    const cleared = await getJson(port, '/phone-bridge/state')
    expect(cleared.body.lastPublicUrlCheck).toBeNull()
  })
})

describe('pairing password', () => {
  it('makes a saved six-digit value the password shown beside the QR code', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-pin-'))
    tempDirectories.push(directory)
    const pinFile = join(directory, 'mobile-pairing-pin.json')
    const settingsFile = join(directory, 'settings.json')
    const { port } = await startHarness({ pinFile, settingsFile })
    await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://dsh.example.com' })

    const saved = await postJson(port, '/phone-bridge/pin', { pin: '051109' })
    expect(saved.status).toBe(200)
    expect(saved.body.pairingPin).toBe('051109')
    expect(saved.body.pinConsent).toBe(true)

    const state = await readyState(port)
    expect(state.pairingPin).toBe('051109')
    expect(readPairingPinState(pinFile)).toEqual({ pinConsent: true, pin: '051109' })

    const rejected = await postJson(port, '/phone-bridge/pin', { pin: '12345' })
    expect(rejected.status).toBe(400)
    expect(String(rejected.body.error)).toContain('6 位数字')

    const cleared = await postJson(port, '/phone-bridge/pin', { pin: '' })
    expect(cleared.status).toBe(200)
    expect(cleared.body.pinConsent).toBe(false)
    expect(cleared.body.pairingPin).not.toBe('051109')
    expect(readPairingPinState(pinFile)).toEqual({})
  })

  it('replaces a durable password saved earlier instead of shadowing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-pin-'))
    tempDirectories.push(directory)
    const pinFile = join(directory, 'mobile-pairing-pin.json')
    const settingsFile = join(directory, 'settings.json')
    await writeFile(pinFile, JSON.stringify({ pinConsent: true, pin: '411475' }), 'utf8')
    const { port } = await startHarness({ pinFile, settingsFile })
    await postJson(port, '/phone-bridge/settings', { publicUrl: 'https://dsh.example.com' })
    expect((await readyState(port)).pairingPin).toBe('411475')

    const saved = await postJson(port, '/phone-bridge/pin', { pin: '051109' })
    expect(saved.body.pairingPin).toBe('051109')
    expect(readPairingPinState(pinFile)).toEqual({ pinConsent: true, pin: '051109' })
    expect((await readyState(port)).pairingPin).toBe('051109')
  })

  it('adopts a password left in the settings file by an older build', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-roam-pin-'))
    tempDirectories.push(directory)
    const pinFile = join(directory, 'mobile-pairing-pin.json')
    const settingsFile = join(directory, 'settings.json')
    await writeFile(pinFile, JSON.stringify({ pinConsent: true, pin: '411475' }), 'utf8')
    await writeFile(
      settingsFile,
      JSON.stringify({ publicUrl: 'https://dsh.example.com', initialPin: '051109' }),
      'utf8',
    )
    const { port } = await startHarness({ pinFile, settingsFile })

    const state = await readyState(port)
    expect(state.pairingPin).toBe('051109')
    expect(state.pinConsent).toBe(true)
    expect(readPairingPinState(pinFile)).toEqual({ pinConsent: true, pin: '051109' })
    expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual({ publicUrl: 'https://dsh.example.com' })
  })
})
