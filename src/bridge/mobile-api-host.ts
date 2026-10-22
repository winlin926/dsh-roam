import { createRequire } from 'node:module'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { MobileDeviceRegistry } from './mobile-device-registry.js'

export const MOBILE_API_PREFIX = '/api/mobile'
export const MOBILE_API_V1_PREFIX = '/api/mobile/v1'

const require = createRequire(import.meta.url)

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => unknown
type UpgradeHandler = (request: IncomingMessage, socket: Duplex, head: Buffer) => void

interface RouteRegistration {
  kind: string
  path: string
  handler: RequestHandler
}

interface UpgradeRegistration {
  path: string
  handler: UpgradeHandler
}

interface UpstreamModules {
  registerMobileRoutes(deps: Record<string, unknown>): void
  createGuarded(
    ctx: unknown,
    authorized: (request: IncomingMessage) => boolean,
    note?: () => void
  ): (handler: RequestHandler) => RequestHandler
  authorized(request: IncomingMessage): boolean
  createApiProxy(ctx: unknown): unknown
  loadState(): Record<string, any>
  hostMetadata(): Record<string, unknown>
  createPreviewService(options: {
    authorized: (request: IncomingMessage) => boolean
    protectedPorts: () => Set<number>
    onLog?: (message: string) => void
  }): { handleUpgrade: UpgradeHandler; close(): void }
  advertisedCandidates(port: number): unknown[]
  core: Record<string, any>
  pairingApproval: Record<string, any>
  presentedCredential(request: IncomingMessage): string | null
  credentials: UpstreamCredentials
}

/** 设备凭据库的只读视图：按凭据找设备、按设备吊销。 */
interface UpstreamCredentials {
  lookup(credential: string, instanceId: string): { deviceId?: unknown } | null
  revokeDevice(instanceId: string, deviceId: string): number
}

export interface MobileApiHostOptions {
  ctx: Record<string, any>
  pin(): string | undefined
  pinEnabled(): boolean
  port(): number | undefined
  tunnel(): { active: boolean; url?: string; error?: string }
  protectedPorts(): Set<number>
  devices?: MobileDeviceRegistry
  log?(message: string): void
}

export interface MobileApiHost {
  readonly available: boolean
  readonly error?: string
  handle(request: IncomingMessage, response: ServerResponse, pathname?: string): Promise<boolean>
  revokeDevice(deviceId: string): number
  /** 当前握着事件流长连接的设备；手机断网、退后台都会立刻消失。 */
  onlineDeviceIds(): ReadonlySet<string>
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean
  close(): void
}

export function isMobileApiPath(pathname: string): boolean {
  return pathname === MOBILE_API_PREFIX || pathname.startsWith(MOBILE_API_PREFIX + '/')
}

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname
  } catch {
    return '/'
  }
}

/** 手机的真实来源 IP：公网经 Cloudflare 时在 cf-connecting-ip，局域网直连看 socket。 */
function clientAddress(request: IncomingMessage): string {
  const header = (name: string): string | undefined => {
    const raw = request.headers[name]
    return Array.isArray(raw) ? raw[0] : raw
  }
  const forwarded = header('cf-connecting-ip') ?? header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  const address = request.socket?.remoteAddress ?? ''
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

function loadUpstream(): UpstreamModules {
  const packageRoot = dirname(require.resolve('dsh-mobile-plugin/package.json'))
  const packageJson = require(join(packageRoot, 'package.json')) as { version?: unknown }
  if (packageJson.version !== '0.1.92') {
    throw new Error(`dsh-mobile-plugin 版本不匹配：需要 0.1.92，实际 ${String(packageJson.version)}`)
  }
  const load = (file: string) => require(join(packageRoot, file))
  const mobileApi = load('lib/routes/mobile-api.js') as { registerMobileRoutes?: unknown }
  const routing = load('lib/http/routing.js') as { createGuarded?: unknown }
  const auth = load('lib/mobile/auth.js') as { authorized?: unknown; presentedCredential?: unknown }
  const hostBridge = load('lib/mobile/host-bridge.js') as { createApiProxy?: unknown }
  const core = load('lib/relay/core.js') as Record<string, any>
  const status = load('lib/relay/status.js') as { hostMetadata?: unknown }
  const preview = load('lib/relay/preview.js') as { createPreviewService?: unknown }
  const lanNetwork = load('lib/relay/lan-network.cjs') as { advertisedCandidates?: unknown }
  const pairingApproval = load('lib/relay/pairing-policy.js') as Record<string, any>
  const activity = load('lib/mobile/activity.cjs') as { note?: unknown }
  const credentialsEntry = load('lib/shared/credentials-entry.js') as { credentialsEntry?: unknown }

  const required: Array<[string, unknown]> = [
    ['registerMobileRoutes', mobileApi.registerMobileRoutes],
    ['createGuarded', routing.createGuarded],
    ['authorized', auth.authorized],
    ['createApiProxy', hostBridge.createApiProxy],
    ['loadState', core.loadState],
    ['signLanToken', core.signLanToken],
    ['hostMetadata', status.hostMetadata],
    ['createPreviewService', preview.createPreviewService],
    ['advertisedCandidates', lanNetwork.advertisedCandidates],
    ['activity.note', activity.note],
    ['presentedCredential', auth.presentedCredential],
    ['credentialsEntry', credentialsEntry.credentialsEntry]
  ]
  for (const [name, value] of required) {
    if (typeof value !== 'function') throw new Error(`dsh-mobile-plugin 缺少移动 API 依赖：${name}`)
  }
  return {
    registerMobileRoutes: mobileApi.registerMobileRoutes as UpstreamModules['registerMobileRoutes'],
    createGuarded: routing.createGuarded as UpstreamModules['createGuarded'],
    authorized: auth.authorized as UpstreamModules['authorized'],
    createApiProxy: hostBridge.createApiProxy as UpstreamModules['createApiProxy'],
    loadState: core.loadState as UpstreamModules['loadState'],
    hostMetadata: status.hostMetadata as UpstreamModules['hostMetadata'],
    createPreviewService: preview.createPreviewService as UpstreamModules['createPreviewService'],
    advertisedCandidates: lanNetwork.advertisedCandidates as UpstreamModules['advertisedCandidates'],
    core,
    pairingApproval,
    presentedCredential: auth.presentedCredential as UpstreamModules['presentedCredential'],
    credentials: (credentialsEntry.credentialsEntry as () => UpstreamCredentials)()
  }
}

class EmbeddedMobileApiHost implements MobileApiHost {
  readonly available = true
  private readonly routes = new Map<string, RequestHandler>()
  private readonly upgrades = new Map<string, UpgradeHandler>()
  private readonly preview: { handleUpgrade: UpgradeHandler; close(): void }
  private readonly state: Record<string, any>
  private readonly credentials: UpstreamCredentials
  private readonly presentedCredential: (request: IncomingMessage) => string | null
  private closed = false
  /** 设备 → 它当前打开的事件流连接数。 */
  private readonly streamingDevices = new Map<string, number>()

  constructor(private readonly options: MobileApiHostOptions) {
    const upstream = loadUpstream()
    const state = upstream.loadState()
    Object.defineProperties(state, {
      enabled: { get: () => true, enumerable: true, configurable: true },
      lanEnabled: { get: () => true, enumerable: true, configurable: true },
      lanPort: { get: () => options.port() ?? 0, enumerable: true, configurable: true },
      pairingCode: { get: () => options.pin() ?? '', enumerable: true, configurable: true }
    })
    state.name = state.name || hostname()
    state.relayUrl = ''
    state.pairingPolicy = 'code'
    this.state = state
    this.credentials = upstream.credentials
    this.presentedCredential = upstream.presentedCredential

    this.provideApiProxy(upstream)

    const guarded = upstream.createGuarded(options.ctx, upstream.authorized, () => undefined)
    this.preview = upstream.createPreviewService({
      authorized: upstream.authorized,
      protectedPorts: options.protectedPorts,
      onLog: options.log
    })

    upstream.registerMobileRoutes({
      registerRoute: (registration: RouteRegistration) => {
        if (registration.kind !== 'exact') {
          throw new Error(`不支持的移动 API 路由类型：${registration.kind}`)
        }
        this.routes.set(registration.path, registration.handler)
      },
      registerUpgradeRoute: (registration: UpgradeRegistration) => {
        this.upgrades.set(registration.path, registration.handler)
      },
      guarded,
      state,
      hostMetadata: upstream.hostMetadata,
      getSidecarSnapshot: () => {
        const tunnel = options.tunnel()
        const port = options.port() ?? 0
        return {
          tunnel: {
            state: tunnel.active ? 'connected' : 'off',
            url: tunnel.url ?? null,
            error: tunnel.error ?? null
          },
          lan: {
            state: port > 0 ? 'listening' : 'stopped',
            port,
            updatedAt: Date.now()
          }
        }
      },
      safeLanCandidates: upstream.advertisedCandidates,
      lanPortInUse: () => options.port() ?? 0,
      preview: this.preview,
      core: upstream.core,
      pairingApproval: this.pairingApproval(upstream.pairingApproval)
    })

    for (const requiredPath of [
      `${MOBILE_API_V1_PREFIX}/pair`,
      `${MOBILE_API_V1_PREFIX}/sessions`,
      `${MOBILE_API_V1_PREFIX}/events/stream`
    ]) {
      if (!this.routes.has(requiredPath)) throw new Error(`dsh-mobile-plugin 缺少移动 API 路由：${requiredPath}`)
    }
    if (!this.upgrades.has(`${MOBILE_API_V1_PREFIX}/preview`)) {
      throw new Error('dsh-mobile-plugin 缺少移动 API 预览路由')
    }
  }

  /**
   * 配对时把 App 自报的设备信息记进台账，再交给上游原有判定。
   * 只在配对那一刻拿得到设备名与系统版本，之后的请求只有凭据。
   */
  private pairingApproval(upstream: Record<string, any>): Record<string, any> {
    const devices = this.options.devices
    if (!devices) return upstream
    return {
      ...upstream,
      evaluate: (policy: unknown, device: unknown) => {
        devices.rememberPairing(device)
        return upstream.evaluate(policy, device)
      }
    }
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname = requestPath(request)
  ): Promise<boolean> {
    if (!isMobileApiPath(pathname)) return false
    if (this.closed) {
      writeJson(response, 503, { ok: false, error: { code: 'unavailable', message: '移动 API 已关闭' } })
      return true
    }
    this.noteDeviceActivity(request, pathname)
    if (pathname === `${MOBILE_API_V1_PREFIX}/pair` && !this.options.pinEnabled()) {
      writeJson(response, 409, {
        ok: false,
        error: { code: 'pairing-disabled', message: '固定配对码未启用' }
      })
      return true
    }
    const handler = this.routes.get(pathname)
    if (!handler) {
      writeJson(response, 404, { ok: false, error: { code: 'not-found', message: '移动 API 路径不存在' } })
      return true
    }
    if (pathname === `${MOBILE_API_V1_PREFIX}/events/stream`) this.trackDeviceStream(request, response)
    await handler(request, response)
    return true
  }

  /** 记录「哪台设备、从哪个 IP、什么时候」来过；凭据到设备由设备凭据库回答。 */
  private noteDeviceActivity(request: IncomingMessage, pathname: string): void {
    const devices = this.options.devices
    if (!devices) return
    if (pathname === `${MOBILE_API_V1_PREFIX}/health` || pathname === `${MOBILE_API_V1_PREFIX}/pair`) return
    const deviceId = this.deviceIdFor(request)
    if (!deviceId) return
    devices.noteActivity(deviceId, clientAddress(request))
  }

  /** 请求携带的设备凭据对应的设备；健康检查这类匿名请求没有设备。 */
  private deviceIdFor(request: IncomingMessage): string | undefined {
    const credential = this.presentedCredential(request)
    if (!credential) return undefined
    const record = this.credentials.lookup(credential, String(this.state.instanceId ?? ''))
    const deviceId = record && typeof record.deviceId === 'string' ? record.deviceId : ''
    return deviceId || undefined
  }

  /**
   * 手机在线 = 它握着事件流的长连接。凭据在请求头上，先解析设备再挂到响应关闭：
   * 切网、退后台、杀进程都会走到 close，所以这里得到的是当下真实的在线集合。
   */
  private trackDeviceStream(request: IncomingMessage, response: ServerResponse): void {
    const deviceId = this.deviceIdFor(request)
    if (!deviceId) return
    this.streamingDevices.set(deviceId, (this.streamingDevices.get(deviceId) ?? 0) + 1)
    response.once('close', () => {
      const remaining = (this.streamingDevices.get(deviceId) ?? 0) - 1
      if (remaining > 0) this.streamingDevices.set(deviceId, remaining)
      else this.streamingDevices.delete(deviceId)
    })
  }

  onlineDeviceIds(): ReadonlySet<string> {
    return new Set(this.streamingDevices.keys())
  }

  revokeDevice(deviceId: string): number {
    return this.credentials.revokeDevice(String(this.state.instanceId ?? ''), deviceId)
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    if (this.closed) return false
    const handler = this.upgrades.get(requestPath(request))
    if (!handler) return false
    handler(request, socket, head)
    return true
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.routes.clear()
    this.upgrades.clear()
    this.streamingDevices.clear()
    try {
      this.preview.close()
    } catch {
      // A preview socket that already closed must not block plugin shutdown.
    }
  }

  private provideApiProxy(upstream: UpstreamModules): void {
    let existing: unknown
    try {
      existing = typeof this.options.ctx.get === 'function' ? this.options.ctx.get('apiProxy') : undefined
    } catch {
      existing = undefined
    }
    if (existing) return
    const reflect = this.options.ctx.reflect
    if (!reflect || typeof reflect.provide !== 'function') {
      throw new Error('dsh-roam 无法提供 dsh-mobile 的 apiProxy 兼容服务')
    }
    reflect.provide('apiProxy', upstream.createApiProxy(this.options.ctx))
  }
}

function unavailableHost(error: unknown, options: MobileApiHostOptions): MobileApiHost {
  const message = error instanceof Error ? error.message : String(error)
  try {
    options.log?.(`dsh-roam: AI-HUB 移动 API 不可用：${message}`)
  } catch {
    // Logging an unavailable upstream must never mask the original error.
  }
  return {
    available: false,
    error: message,
    onlineDeviceIds: () => new Set<string>(),
    revokeDevice: () => 0,
    async handle(request, response) {
      if (!isMobileApiPath(requestPath(request))) return false
      writeJson(response, 503, {
        ok: false,
        error: { code: 'mobile-api-unavailable', message: 'AI-HUB 移动 API 未就绪' }
      })
      return true
    },
    handleUpgrade() {
      return false
    },
    close() {}
  }
}

export function createMobileApiHost(options: MobileApiHostOptions): MobileApiHost {
  try {
    return new EmbeddedMobileApiHost(options)
  } catch (error) {
    return unavailableHost(error, options)
  }
}
