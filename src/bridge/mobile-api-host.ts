import { createRequire } from 'node:module'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

export const MOBILE_API_PREFIX = '/api/mobile'
const MOBILE_API_V1_PREFIX = '/api/mobile/v1'

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
}

export interface MobileApiHostOptions {
  ctx: Record<string, any>
  pin(): string | undefined
  pinEnabled(): boolean
  port(): number | undefined
  tunnel(): { active: boolean; url?: string; error?: string }
  protectedPorts(): Set<number>
  log?(message: string): void
}

export interface MobileApiHost {
  readonly available: boolean
  readonly error?: string
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>
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
  const auth = load('lib/mobile/auth.js') as { authorized?: unknown }
  const hostBridge = load('lib/mobile/host-bridge.js') as { createApiProxy?: unknown }
  const core = load('lib/relay/core.js') as Record<string, any>
  const status = load('lib/relay/status.js') as { hostMetadata?: unknown }
  const preview = load('lib/relay/preview.js') as { createPreviewService?: unknown }
  const lanNetwork = load('lib/relay/lan-network.cjs') as { advertisedCandidates?: unknown }
  const pairingApproval = load('lib/relay/pairing-policy.js') as Record<string, any>
  const activity = load('lib/mobile/activity.cjs') as { note?: unknown }

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
    ['activity.note', activity.note]
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
    pairingApproval
  }
}

class EmbeddedMobileApiHost implements MobileApiHost {
  readonly available = true
  private readonly routes = new Map<string, RequestHandler>()
  private readonly upgrades = new Map<string, UpgradeHandler>()
  private readonly preview: { handleUpgrade: UpgradeHandler; close(): void }
  private closed = false

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
      pairingApproval: upstream.pairingApproval
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

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const pathname = requestPath(request)
    if (!isMobileApiPath(pathname)) return false
    if (this.closed) {
      writeJson(response, 503, { ok: false, error: { code: 'unavailable', message: '移动 API 已关闭' } })
      return true
    }
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
    await handler(request, response)
    return true
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
