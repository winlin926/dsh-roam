import { existsSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { LanMobileBridge } from './bridge/lan-mobile-bridge.js'
import { createFilePairingPinStore } from './bridge/pairing-pin-store.js'
import {
  migrateStoredInitialPin,
  normalizePublicUrl,
  readBridgeSettings,
  writeBridgeSettings,
} from './bridge/public-url-settings.js'

export const name = 'dsh-roam'
export const inject = ['webServer', 'connection']

const PORT_START = 43128
const PUBLIC_URL_PROBE_TIMEOUT_MS = 12000
const DATA_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-roam')
const CACHE_DIR = join(DATA_DIR, 'bin')
const PIN_FILE = join(DATA_DIR, 'mobile-pairing-pin.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')
const DESKTOP_URL_PATH = '/phone-bridge/desktop-url'
const STATE_PATH = '/phone-bridge/state'
const SETTINGS_PATH = '/phone-bridge/settings'
const PUBLIC_URL_TEST_PATH = '/phone-bridge/public-url/test'
const PAIRING_ROTATE_PATH = '/phone-bridge/pairing/rotate'
const TUNNEL_PATH = '/phone-bridge/tunnel'
const TUNNEL_FALLBACK_PATH = '/phone-bridge/tunnel/fallback'
const DISCONNECT_PATH = '/phone-bridge/disconnect'
const PIN_PATH = '/phone-bridge/pin'
const TUNNEL_DISABLED_MESSAGE = '已配置固定公网域名，临时隧道已停用。'
/** Same SVG options the desktop page uses, so a QR that scans there scans here. */
const QR_OPTIONS = { type: 'svg', margin: 1, width: 260 }
const MAX_BODY_BYTES = 64 * 1024

function choosePort(start) {
  const attempt = (port) =>
    new Promise((resolve, reject) => {
      if (port > 65535) {
        reject(new Error('dsh-roam: no free listen port'))
        return
      }
      const server = net.createServer()
      server.once('error', (error) => {
        server.close()
        if (error && error.code === 'EADDRINUSE') resolve(attempt(port + 1))
        else reject(error)
      })
      server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
        server.close((closeError) => {
          if (closeError) reject(closeError)
          else resolve(port)
        })
      })
    })
  return attempt(start)
}

function harnessOrigin(webServer) {
  try {
    if (typeof webServer?.origin === 'string' && webServer.origin) return webServer.origin
    if (typeof webServer?.getOrigin === 'function') return webServer.getOrigin()
  } catch {
    return undefined
  }
  return undefined
}

function launchToken(connection, origin) {
  const direct = connection?.browserAuth?.launchToken
  if (typeof direct === 'string' && direct.length > 0) return direct
  const owner = connection?.browserAuth ?? connection
  const authenticate = owner?.authenticatedUrl
  if (typeof authenticate !== 'function' || !origin) return undefined
  try {
    const token = new URL(authenticate.call(owner, origin)).searchParams.get('token')
    return token || undefined
  } catch {
    return undefined
  }
}

function isLoopback(address) {
  const host = String(address ?? '').replace(/^::ffff:/i, '')
  return host === '127.0.0.1' || host === '::1'
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Rejects browser-driven cross-site POSTs (a drive-by page on another origin
 * could otherwise open a public tunnel or store a durable password). Requests
 * without Fetch Metadata and Origin headers — local tooling, tests — pass.
 */
function sameOrigin(request) {
  const site = headerValue(request.headers?.['sec-fetch-site'])
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = headerValue(request.headers?.origin)
  const host = headerValue(request.headers?.host)
  if (origin && host && new URL(origin).host !== host) return false
  return true
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function writeText(response, status, body) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

function idleState(publicUrl = null, lastPublicUrlCheck = null, expectedPort = PORT_START) {
  return {
    ready: false,
    qrSvg: null,
    pairingUrl: null,
    lanUrls: [],
    desktopUrl: null,
    connected: false,
    tunnelActive: false,
    tunnelLoading: false,
    tunnelProvider: null,
    tunnelUrl: null,
    tunnelError: null,
    pairingPin: null,
    pinConsent: false,
    pinExpiresAt: null,
    expiresAt: null,
    publicUrl,
    publicUrlConfigured: publicUrl !== null,
    mode: publicUrl ? 'fixed' : 'lan',
    bridgePort: null,
    expectedPort,
    portMatchesTunnel: false,
    lastPublicUrlCheck,
  }
}

/**
 * The settings panel's whole view of the bridge, served from the harness origin
 * so the page needs no cross-origin request and no bridge cookie. The QR is
 * built here on every read, from the pairing URL in the snapshot, exactly like
 * the desktop page: a consumed or expired token would otherwise render a dead
 * code, so an unusable one is rotated before the SVG is generated.
 */
async function bridgeState(bridge, runtime) {
  const publicUrl = runtime?.publicUrl ?? null
  const lastPublicUrlCheck = runtime?.lastPublicUrlCheck ?? null
  const expectedPort = runtime?.expectedPort ?? PORT_START
  const initial = bridge?.snapshot()
  if (!initial || initial.running !== true) return idleState(publicUrl, lastPublicUrlCheck, expectedPort)
  if (!initial.pairingUrl) bridge.rotatePairingToken()
  const snapshot = bridge.snapshot()
  const pins = bridge.desktopPinFields()
  const pairingUrl = snapshot.pairingUrl ?? null
  const bridgePort = Number.isInteger(snapshot.port) ? snapshot.port : null
  // The LAN card lists only addresses a phone on the same Wi-Fi can open: the
  // fixed origin and the quick tunnel have their own cards.
  const lanUrls = bridge.pairingUrls().filter((url) => {
    if (publicUrl && url.startsWith(publicUrl)) return false
    if (snapshot.tunnelUrl && url.startsWith(snapshot.tunnelUrl)) return false
    return true
  })
  return {
    ready: true,
    qrSvg: pairingUrl ? await QRCode.toString(pairingUrl, QR_OPTIONS) : null,
    pairingUrl,
    lanUrls,
    desktopUrl: bridge.createDesktopUrl() ?? null,
    connected: snapshot.connected === true,
    tunnelActive: snapshot.tunnelActive === true,
    tunnelLoading: snapshot.tunnelLoading === true,
    tunnelProvider: snapshot.tunnelProvider ?? null,
    tunnelUrl: snapshot.tunnelUrl ?? null,
    tunnelError: snapshot.tunnelError ?? null,
    pairingPin: pins.pairingPin ?? null,
    pinConsent: pins.pinConsent === true,
    pinExpiresAt: pins.pinExpiresAt ?? null,
    expiresAt: snapshot.expiresAt ?? null,
    publicUrl,
    publicUrlConfigured: publicUrl !== null,
    mode: publicUrl ? 'fixed' : snapshot.tunnelActive === true ? 'tunnel' : 'lan',
    bridgePort,
    expectedPort,
    portMatchesTunnel: bridgePort === expectedPort,
    lastPublicUrlCheck,
  }
}

function result(ok, error, state) {
  return { ok, error: error ?? null, ...state }
}

/**
 * An unauthenticated request to the public origin is answered with 401/403 —
 * the pairing gate, which still proves Cloudflare reached this machine. So a
 * 2xx-4xx answer means reachable and only a transport failure or a 5xx (the
 * tunnel-down page) means the path is broken.
 */
export async function probePublicUrl(url) {
  const attempt = (method) =>
    fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(PUBLIC_URL_PROBE_TIMEOUT_MS),
    })
  let lastError
  // A cold TLS handshake to a distant edge occasionally exceeds one attempt, so
  // retry once before declaring the path broken.
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      let response = await attempt('GET')
      if (response.status === 405) response = await attempt('HEAD')
      const reachable = response.status >= 200 && response.status < 500
      return {
        reachable,
        status: response.status,
        error: reachable ? null : 'HTTP ' + response.status,
      }
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }
  return { reachable: false, status: null, error: errorMessage(lastError) }
}

/**
 * Both logo variants are requested together on every page load. A missing
 * asset must not keep the bridge from starting, so the pair is only passed
 * when both files are present.
 */
function brandLogoPaths() {
  const light = fileURLToPath(new URL('../assets/logo-light.png', import.meta.url))
  const dark = fileURLToPath(new URL('../assets/logo-dark.png', import.meta.url))
  return existsSync(light) && existsSync(dark) ? { light, dark } : undefined
}

/**
 * Registers one loopback-only, same-origin JSON route on the harness webserver
 * and ties its lifetime to the plugin's: the disposer register() returns is
 * handed back to ctx.effect, so a reload retires the previous handler's path.
 */
function registerLoopbackRoute(ctx, label, method, path, handle) {
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path,
      handler(request, response) {
        if (!isLoopback(request.socket?.remoteAddress)) {
          writeText(response, 403, 'Loopback only.')
          return
        }
        if (request.method !== method) {
          response.writeHead(405, { allow: method, 'cache-control': 'no-store' })
          response.end()
          return
        }
        if (method !== 'GET' && !sameOrigin(request)) {
          writeJson(response, 403, { ok: false, error: 'Cross-origin request rejected.' })
          return
        }
        Promise.resolve(handle(request, response)).catch((error) => {
          writeJson(response, 500, result(false, errorMessage(error), idleState()))
        })
      },
    })
    return () => dispose()
  }, 'dsh-roam ' + label)
}

function registerSettingsRoutes(ctx, bridge, runtime, checkPublicUrl) {
  const state = () => bridgeState(bridge(), runtime)
  const unavailable = (response) =>
    writeJson(
      response,
      503,
      result(
        false,
        'Bridge is not listening yet.',
        idleState(runtime.publicUrl, runtime.lastPublicUrlCheck, runtime.expectedPort),
      ),
    )

  registerLoopbackRoute(ctx, STATE_PATH, 'GET', STATE_PATH, async (request, response) => {
    writeJson(response, 200, await state())
  })

  registerLoopbackRoute(ctx, SETTINGS_PATH, 'POST', SETTINGS_PATH, async (request, response) => {
    const body = await readJsonBody(request)
    if (typeof body?.publicUrl !== 'string') {
      return writeJson(response, 400, result(false, '请提供要保存的设置。', await state()))
    }
    let nextPublicUrl
    try {
      nextPublicUrl = normalizePublicUrl(body.publicUrl)
    } catch (error) {
      return writeJson(response, 400, result(false, errorMessage(error), await state()))
    }
    try {
      await writeBridgeSettings(runtime.settingsFile, { publicUrl: nextPublicUrl })
    } catch (error) {
      return writeJson(response, 500, result(false, '保存设置失败：' + errorMessage(error), await state()))
    }
    const saved = readBridgeSettings(runtime.settingsFile)
    if (runtime.publicUrl !== saved.publicUrl) runtime.lastPublicUrlCheck = null
    runtime.publicUrl = saved.publicUrl
    writeJson(response, 200, result(true, null, await state()))
  })

  registerLoopbackRoute(ctx, PUBLIC_URL_TEST_PATH, 'POST', PUBLIC_URL_TEST_PATH, async (request, response) => {
    if (!runtime.publicUrl) {
      return writeJson(response, 400, result(false, '尚未配置公网域名。', await state()))
    }
    let lastPublicUrlCheck
    try {
      const probeResult = await checkPublicUrl(runtime.publicUrl)
      lastPublicUrlCheck = {
        at: Date.now(),
        reachable: probeResult?.reachable === true,
        status: Number.isInteger(probeResult?.status) ? probeResult.status : null,
        error: typeof probeResult?.error === 'string' ? probeResult.error : null,
      }
    } catch (error) {
      lastPublicUrlCheck = { at: Date.now(), reachable: false, status: null, error: errorMessage(error) }
    }
    runtime.lastPublicUrlCheck = lastPublicUrlCheck
    writeJson(response, 200, result(true, null, await state()))
  })

  registerLoopbackRoute(ctx, PAIRING_ROTATE_PATH, 'POST', PAIRING_ROTATE_PATH, async (request, response) => {
    const target = bridge()
    if (!target) return unavailable(response)
    target.rotatePairingToken()
    writeJson(response, 200, result(true, null, await state()))
  })

  registerLoopbackRoute(ctx, TUNNEL_PATH, 'POST', TUNNEL_PATH, async (request, response) => {
    if (runtime.publicUrl) {
      return writeJson(response, 409, result(false, TUNNEL_DISABLED_MESSAGE, await state()))
    }
    const target = bridge()
    if (!target) return unavailable(response)
    const body = await readJsonBody(request)
    const enabled = typeof body?.enabled === 'boolean' ? body.enabled : undefined
    let error = null
    try {
      await target.toggleTunnel(enabled)
    } catch (cause) {
      error = errorMessage(cause)
    }
    writeJson(response, error ? 409 : 200, result(!error, error, await state()))
  })

  registerLoopbackRoute(ctx, TUNNEL_FALLBACK_PATH, 'POST', TUNNEL_FALLBACK_PATH, async (request, response) => {
    if (runtime.publicUrl) {
      return writeJson(response, 409, result(false, TUNNEL_DISABLED_MESSAGE, await state()))
    }
    const target = bridge()
    if (!target) return unavailable(response)
    let error = null
    try {
      await target.fallbackToPinggy()
    } catch (cause) {
      error = errorMessage(cause)
    }
    writeJson(response, error ? 409 : 200, result(!error, error, await state()))
  })

  registerLoopbackRoute(ctx, DISCONNECT_PATH, 'POST', DISCONNECT_PATH, async (request, response) => {
    const target = bridge()
    if (!target) return unavailable(response)
    target.suspendMobileSessions()
    writeJson(response, 200, result(true, null, await state()))
  })

  registerLoopbackRoute(ctx, PIN_PATH, 'POST', PIN_PATH, async (request, response) => {
    const target = bridge()
    if (!target) return unavailable(response)
    const body = await readJsonBody(request)
    if (typeof body?.pin !== 'string') {
      return writeJson(response, 400, result(false, '请提供连接密码。', await state()))
    }
    const pin = body.pin.trim()
    if (pin && !/^[0-9]{6}$/.test(pin)) {
      return writeJson(response, 400, result(false, '连接密码必须是 6 位数字。', await state()))
    }
    const saved = target.setDurablePin(pin || null)
    writeJson(
      response,
      saved ? 200 : 500,
      result(saved, saved ? null : '无法保存连接密码，请重试。', await state()),
    )
  })
}

export function apply(ctx, config = {}) {
  const holder = { bridge: undefined }
  const pinFile = config.pinFile ?? PIN_FILE
  const bridge = () => holder.bridge
  const settingsFile = config.settingsFile ?? SETTINGS_FILE
  const savedSettings = readBridgeSettings(settingsFile)
  const runtime = {
    settingsFile,
    publicUrl: savedSettings.publicUrl,
    expectedPort: config.publicPort ?? PORT_START,
    lastPublicUrlCheck: null,
  }
  const checkPublicUrl =
    typeof config.probePublicUrl === 'function' ? config.probePublicUrl : probePublicUrl

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: DESKTOP_URL_PATH,
      handler(request, response) {
        if (!isLoopback(request.socket?.remoteAddress)) {
          writeText(response, 403, 'Desktop only.')
          return
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
          response.end()
          return
        }
        const url = holder.bridge?.createDesktopUrl()
        if (!url) {
          writeJson(response, 503, { ready: false })
          return
        }
        if (request.method === 'HEAD') {
          response.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          response.end()
          return
        }
        writeJson(response, 200, { ready: true, url })
      },
    })
    return () => disposeRoute()
  }, 'dsh-roam desktop url')

  registerSettingsRoutes(ctx, bridge, runtime, checkPublicUrl)

  ctx.effect(() => {
    let instance
    const ready = (async () => {
      const port = config.port ?? await choosePort(PORT_START)
      const logos = brandLogoPaths()
      instance = new LanMobileBridge({
        port,
        harnessUrl: () => harnessOrigin(ctx.webServer),
        harnessAuthToken: () => launchToken(ctx.connection, harnessOrigin(ctx.webServer)),
        locale: 'zh',
        cloudflaredCacheDir: CACHE_DIR,
        pairingPinStore: createFilePairingPinStore(pinFile),
        publicUrl: () => runtime.publicUrl ?? undefined,
        frameAncestors: () => {
          const origin = harnessOrigin(ctx.webServer)
          if (!origin) return undefined
          try {
            return new URL(origin).origin
          } catch {
            return undefined
          }
        },
        ...(logos ? { brandLogoPaths: logos } : {}),
      })
      holder.bridge = instance
      await migrateStoredInitialPin(settingsFile, (pin) => instance.setDurablePin(pin))
      await instance.start()
    })()
    ready.catch((error) => {
      ctx.logger?.warn?.('dsh-roam: failed to listen (' + errorMessage(error) + ')')
    })

    return async () => {
      holder.bridge = undefined
      await ready.catch(() => undefined)
      if (instance) await instance.stop()
    }
  }, 'dsh-roam')
}
