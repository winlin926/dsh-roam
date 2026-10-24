import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import {
  ensureCloudflaredBinary,
  startCloudflareQuickTunnel
} from './cloudflared-tunnel.js'
import {
  startTunnelWithFallback,
  type InternetTunnelInstance,
  type InternetTunnelProvider
} from './internet-tunnel.js'
import { ACME_CHALLENGE_PREFIX } from './acme-certificate.js'
import { startPinggyTunnel } from './pinggy-tunnel.js'
import {
  renderMobileReconnectPage,
  renderPairingPinPage
} from './lan-mobile-pages.js'
import { serveMobileStatic } from './lan-mobile-static.js'
import type { PairingPinState, PairingPinStore } from './pairing-pin-store.js'

const MOBILE_PAGE_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'"
const MOBILE_MAIN_PAGE_CSP = MOBILE_PAGE_CSP.replace("script-src 'unsafe-inline'", "script-src 'self'")
const MAX_BODY_BYTES = 64 * 1024
const MAX_PROMPT_BODY_BYTES = 24 * 1024 * 1024
const MAX_PROMPT_BLOCKS = 10
/** Images and file receipts share one prompt-wide attachment budget. */
const MAX_PROMPT_ATTACHMENTS = 6
const MAX_PROMPT_TEXT_BYTES = 32 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4
const MAX_IMAGE_TOTAL_BYTES = 16 * 1024 * 1024
const MAX_RENAME_TITLE_LENGTH = 200
const MAX_DISPLAY_NAME_LENGTH = 200
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_UPLOAD_BASE64_LENGTH = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4
/** Base64 payload plus its JSON envelope; an upload must fit in one RPC body. */
const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BASE64_LENGTH + 1024 * 1024
const MAX_RPC_BODY_BYTES = Math.max(MAX_PROMPT_BODY_BYTES, MAX_UPLOAD_BODY_BYTES)
const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const PAYLOAD_TOO_LARGE = {
  ok: false,
  code: 'payload-too-large',
  error: '内容太大，请减少图片张数或文件大小后重试'
} as const
/** Installable entry for the phone home screen; icons live beside the brand logos. */
const MOBILE_WEB_MANIFEST = {
  name: 'DSH Mobile',
  short_name: 'DSH',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/brand-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/brand-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/brand-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
} as const
const BRAND_ICON_PREFIX = '/brand-icon/'
/** Only the bundled icon sizes exist; any other size is a missing asset. */
const BRAND_ICON_SIZES = new Set(['180', '192', '512'])
const PAIRING_TTL_MS = 5 * 60 * 1000
const PIN_TTL_MS = PAIRING_TTL_MS
const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PIN_FAIL_WINDOW_MS = 10 * 60 * 1000
const PIN_FAIL_PER_IP = 5
const PIN_FAIL_GLOBAL = 20
const PINGGY_TTL_MS = 60 * 60 * 1000
const MUX_RECONNECT_MS = 500
const MUX_RECONNECT_CAP_MS = 30_000

/** Gateway stream carrier: one WebSocket multiplexing every logical stream. */
const REMOTE_STREAM_MUX_PATH = '/api/remote.mux'

/** Gateway-internal stream delivering forwarded Cordis events. */
const REMOTE_EVENT_STREAM_ENDPOINT = '$events'
/** Gateway-internal unary endpoint settling one forwarded event. */
const REMOTE_EVENT_RESULT_ENDPOINT = '$events/result'
/** Waterfall event a Host raises when it needs an answer from the user. */
const USER_QUESTION_EVENT = 'user-questions/request'
/** Waterfall event a Host raises before a tool runs outside the sandbox. */
const APPROVAL_REQUEST_EVENT = 'approval/request'
const EVENT_STREAM_ID = 'mobile-events'
const WORKSPACE_STREAM_ID = 'mobile-workspaces'
const MUX_STABLE_MS = 5_000
/** Tail page size when the phone does not name one. */
const HISTORY_DEFAULT_MAX_MESSAGES = 100
/** Match the desktop history window: at least two turns worth of messages. */
const HISTORY_TURN_WINDOW = { minMessages: 50, minTurns: 2 } as const
/** Public DNS endpoint whose route selects the machine's primary source address. */
const DEFAULT_ROUTE_PROBE_HOST = '8.8.8.8'
const DEFAULT_ROUTE_PROBE_PORT = 53
const DEFAULT_ROUTE_PROBE_TIMEOUT_MS = 250

/**
 * Mobile method name to the Host endpoint that serves it.
 *
 * 0.1.2-alpha.1 deleted `dsh-host-apiproxy`, whose string-keyed `/api/<name>`
 * routes this bridge was written against, and moved the same operations onto
 * Typert Remote. The transport is unchanged — same `/api` prefix, same
 * client-request envelope — but an endpoint is now `<namespace>/<method>` and
 * its payload carries named args rather than a bare object. Several shapes
 * moved too, so each entry owns its own translation instead of a blanket
 * rename. A Host method that declares one JSON parameter named `request`
 * receives the payload as `{ request }`; methods with several top-level
 * parameters (for example `agentPresets/select`) stay flat.
 *
 * The mobile page's vocabulary is deliberately left alone: it is served from
 * this file, but a phone may still be holding an older page.
 */
const HARNESS_ENDPOINTS: Record<
  string,
  { endpoint: string; args(payload: Record<string, unknown>): Record<string, unknown> }
> = {
  'agentPreset.list': { endpoint: 'agentPresets/list', args: () => ({}) },
  // The preset selector is keyed by agent id, which for a top-level session is
  // the session id the mobile page already sends.
  'agentPreset.select': {
    endpoint: 'agentPresets/select',
    args: (payload) => ({ agentId: payload.sessionId, agentPreset: payload.agentPreset })
  },
  'session.list': { endpoint: 'session/list', args: () => ({ _request: {} }) },
  // The catalog is no longer per-session: it describes what the Host can route
  // to, so it takes no arguments and the page's sessionId is dropped.
  'session.models': { endpoint: 'session/modelCatalog', args: () => ({}) },
  'session.selectModel': { endpoint: 'session/selectModel', args: requestArgs },
  'session.create': { endpoint: 'session/create', args: requestArgs },
  'session.rename': { endpoint: 'session/rename', args: requestArgs },
  'session.search': { endpoint: 'session/search', args: requestArgs },
  'session.updateQueue': { endpoint: 'session/updateQueue', args: requestArgs },
  'workspace.archiveSession': { endpoint: 'workspace/archiveSession', args: requestArgs },
  'workspace.unarchiveSession': { endpoint: 'workspace/unarchiveSession', args: requestArgs },
  'session.prompt': {
    endpoint: 'session/prompt',
    args: (payload) => ({ request: { requestId: randomUUID(), ...payload } })
  },
  'session.cancel': { endpoint: 'session/cancel', args: requestArgs },
  // The uploader takes the receiving Agent as a separate wire argument. Its
  // descriptor names the parameter `agent` but wires it as `agentId`, and the
  // Gateway rejects any key that is not the wire name.
  'fileUploads.upload': {
    endpoint: 'fileUploads/upload',
    args: (payload) => ({ agentId: payload.agent, request: payload.request })
  }
}

function requestArgs(payload: Record<string, unknown>): Record<string, unknown> {
  return { request: payload }
}

const RPC_ALLOWLIST = new Set([...Object.keys(HARNESS_ENDPOINTS), 'session.history', 'workspace.list'])

export interface LanMobileBridgeOptions {
  harnessUrl(): string | undefined
  /** Per-process Harness launch token, traded once for a session cookie. */
  harnessAuthToken?(): string | undefined
  locale?: 'en' | 'zh' | (() => 'en' | 'zh')
  brandLogoPaths?: { light: string; dark: string }
  port?: number
  cloudflaredCacheDir?: string
  cloudflaredPath?: string
  pinggySshPath?: string
  forceCloudflareFailure?: boolean
  createCloudflareTunnel?: (port: number) => Promise<InternetTunnelInstance>
  createPinggyTunnel?: (port: number) => Promise<InternetTunnelInstance>
  tunnelLog?: (message: string) => void
  now?: () => number
  onReconnectRequested?: () => void
  onConnectedChange?: (connected: boolean) => void
  pairingPinStore?: PairingPinStore
  /** Pins the LAN address; tests use it to skip the real default-route probe. */
  lanAddress?: string
  /** Replaces the real default-route probe; tests inject their own. */
  probeDefaultRouteAddress?: () => Promise<string | undefined>
  /** Validated fixed public origin; when present it leads every pairing URL. */
  publicUrl?: () => string | undefined
  /** HTTP-01 挑战文件目录：公网入口必须能取到它，证书才签得下来。 */
  acmeChallengeDir?: () => string | undefined
}

export interface BrowserDeviceSnapshot {
  id: string
  pairedAt: number
  lastSeenAt: number
  status: 'active' | 'idle' | 'disconnected'
}

export interface LanMobileBridgeSnapshot {
  running: boolean
  connected: boolean
  browserDevices: BrowserDeviceSnapshot[]
  port?: number
  pairingUrl?: string
  expiresAt?: number
  tunnelActive?: boolean
  tunnelLoading?: boolean
  tunnelUrl?: string
  tunnelProvider?: InternetTunnelProvider
  tunnelError?: string
}

interface MobileSession {
  /** When the browser first paired; drives the absolute session expiry. */
  pairedAt: number
  /** Last request carrying this session cookie; drives the "browser connected" view. */
  lastSeenAt?: number
}

type MobileConnectionMode = 'lan' | 'tunnel'

interface PairingPinView {
  pin?: string
  expired: boolean
  consent: boolean
  expiresAt?: number
}

interface MobileQuestionOption {
  label: string
  description?: string
}

interface MobileQuestion {
  id: string
  question: string
  detail?: string
  header?: string
  options?: MobileQuestionOption[]
  multiSelect?: boolean
  intent?: string
}

interface PendingMobileQuestion {
  rpcId: string
  sessionId: string
  questions: MobileQuestion[]
}

/**
 * One outstanding privileged-tool request. Approval is a waterfall, so the
 * frame stays pending until this phone (or the desktop) settles it; the phone
 * only ever sees the tool identity and the Host's explanation, never arguments.
 */
interface PendingMobileApproval {
  eventId: string
  sessionId: string
  toolName: string
  callId?: string
  reason?: string
  displayReason?: string
}

interface MobileQuestionAnswer {
  id: string
  selected: string[]
  custom?: string
}

interface HarnessResult {
  ok: boolean
  value?: unknown
  error?: string
  code?: string
  details?: Record<string, unknown>
  /** Host HTTP status; internal routing evidence, never sent to the page. */
  httpStatus?: number
}

class MobileRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class LanMobileBridge {
  private server?: ReturnType<typeof createServer>
  private port?: number
  private pairingToken?: string
  private pairingExpiresAt?: number
  private tunnelInstance?: InternetTunnelInstance
  private tunnelActive = false
  private tunnelLoading = false
  private tunnelError?: string
  private tunnelLaunch?: Promise<void>
  private readonly sessions = new Map<string, MobileSession>()
  private readonly suspendedSessions = new Map<string, MobileSession>()
  /** Sessions moved here only by the settings panel's disconnect. */
  private readonly resumableSessions = new Map<string, MobileSession>()
  private readonly pendingQuestions = new Map<string, PendingMobileQuestion>()
  /** One pending approval per session: a second request supersedes the first. */
  private readonly pendingApprovals = new Map<string, PendingMobileApproval>()
  /** Latest `session/follow` snapshot cursor seen for each session. */
  private readonly sessionSnapshotCursors = new Map<string, number>()
  /** Cursor reused by consecutive `beforeSeq` reads so one scroll keeps one view. */
  private readonly historyThroughSeqs = new Map<string, number>()
  private ephemeralPin?: string
  private ephemeralPinExpiresAt?: number
  private readonly pinFailuresByIp = new Map<string, number[]>()
  private pinFailuresGlobal: number[] = []
  private tunnelExpectedStop = false
  private tunnelExpiresAt?: number
  /** Client generation id from the event stream's `ready` frame; results quote it. */
  private eventClientId?: string
  /** Latest `workspace/follow` baseline, standing in for the removed unary list. */
  private workspaceSnapshot?: unknown
  private readonly now: () => number
  private muxAbort?: AbortController
  private muxTask?: Promise<void>
  private connectionTimer?: ReturnType<typeof setInterval>
  private readonly sessionStreamAborts = new Set<AbortController>()
  private lastConnected = false
  private lanAddress?: string
  private lanAddressResolved = false

  constructor(private readonly options: LanMobileBridgeOptions) {
    this.now = options.now ?? Date.now
  }

  async start(): Promise<LanMobileBridgeSnapshot> {
    await this.cacheLanAddress()
    if (this.server) {
      if (!this.pairingTokenValid()) {
        this.rotatePairingToken()
      }
      this.syncConnected()
      return this.snapshot()
    }
    this.rotatePairingToken()
    this.server = createServer((request, response) => {
      void this.handle(request, response)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          this.json(response, 500, { ok: false, error: message })
        })
        // Every session change is the result of a request: pairing approval,
        // reconnect, or disconnect. Reconciling here keeps the mux monitor and
        // the renderers in step without polling either of them.
        .finally(() => this.syncConnected())
    })
    this.server.on('upgrade', (_request, socket) => socket.destroy())
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(this.options.port ?? 0, '0.0.0.0', resolve)
    })
    this.port = (this.server.address() as AddressInfo).port
    this.connectionTimer ??= setInterval(() => this.syncConnected(), 5_000)
    this.connectionTimer.unref?.()
    this.syncConnected()
    return this.snapshot()
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = undefined
    this.port = undefined
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer)
      this.connectionTimer = undefined
    }
    this.pairingToken = undefined
    this.pairingExpiresAt = undefined
    // Wait for an in-flight launch so the tunnel it spawns is stopped below
    // instead of outliving the bridge (and the app).
    if (this.tunnelLaunch) {
      await this.tunnelLaunch.catch(() => undefined)
      this.tunnelLaunch = undefined
    }
    await this.stopCurrentTunnel()
    this.tunnelActive = false
    this.tunnelLoading = false
    this.tunnelError = undefined
    this.sessions.clear()
    this.suspendedSessions.clear()
    this.resumableSessions.clear()
    this.clearPendingInteractions()
    this.ephemeralPin = undefined
    this.ephemeralPinExpiresAt = undefined
    this.clearPinFailures()
    this.tunnelExpiresAt = undefined
    for (const abort of this.sessionStreamAborts) abort.abort()
    this.sessionStreamAborts.clear()
    this.syncConnected()
    this.muxAbort?.abort()
    const muxTask = this.muxTask
    this.muxAbort = undefined
    this.muxTask = undefined
    if (muxTask) await muxTask.catch(() => undefined)
    if (!server) return
    // An in-flight mobile RPC can hold its socket for up to the 30s abort
    // timeout; close() alone waits for active connections to drain, which
    // would stall app shutdown. Drop every live socket explicitly.
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  async toggleTunnel(enable?: boolean): Promise<LanMobileBridgeSnapshot> {
    const targetState = enable !== undefined ? enable : !this.tunnelActive
    if (targetState && this.mobileBrowserOnline() && !this.tunnelActive) {
      throw new Error('Disconnect the phone before switching connection modes.')
    }
    if (!targetState) {
      // Wait for an in-flight launch, then stop the tunnel it spawned:
      // otherwise the just-launched process is orphaned (or silently revives
      // the tunnel the user asked to disable).
      if (this.tunnelLaunch) {
        await this.tunnelLaunch.catch(() => undefined)
        this.tunnelLaunch = undefined
      }
      await this.stopCurrentTunnel()
      this.tunnelActive = false
      this.tunnelLoading = false
      this.tunnelError = undefined
        this.tunnelExpiresAt = undefined
      return this.snapshot()
    }

    if (this.tunnelActive && this.tunnelInstance?.url) {
      return this.snapshot()
    }

    // A launch is already in flight (the cloudflared download alone can take
    // seconds): report the loading state instead of racing a second tunnel,
    // which would orphan the first cloudflared process.
    if (this.tunnelLaunch) {
      return this.snapshot()
    }

    this.tunnelLoading = true
    this.tunnelError = undefined
    const launch = this.launchTunnel()
    this.tunnelLaunch = launch
    try {
      await launch
      this.tunnelActive = true
        this.armTunnelProcess(this.tunnelInstance)
    } catch (error) {
      this.tunnelActive = false
      this.tunnelError = error instanceof Error ? error.message : String(error)
    } finally {
      this.tunnelLoading = false
      if (this.tunnelLaunch === launch) this.tunnelLaunch = undefined
    }
    return this.snapshot()
  }

  async fallbackToPinggy(): Promise<LanMobileBridgeSnapshot> {
    if (this.mobileBrowserOnline()) {
      throw new Error('Disconnect the phone before switching connection modes.')
    }
    if (!this.tunnelActive || this.tunnelInstance?.provider !== 'cloudflare') {
      throw new Error('Fallback is only available for an active Cloudflare tunnel.')
    }
    if (this.tunnelLaunch) {
      throw new Error('A tunnel switch is already in progress.')
    }

    this.tunnelLoading = true
    this.tunnelError = undefined
    const launch = this.swapToPinggy()
    this.tunnelLaunch = launch
    try {
      await launch
        this.armTunnelProcess(this.tunnelInstance)
    } catch (error) {
      this.tunnelError = error instanceof Error ? error.message : String(error)
    } finally {
      this.tunnelLoading = false
      if (this.tunnelLaunch === launch) this.tunnelLaunch = undefined
    }
    return this.snapshot()
  }

  private async launchTunnel(): Promise<void> {
    const port = this.port
    if (!port) throw new Error('Bridge is not running.')
    this.tunnelInstance = await startTunnelWithFallback({
      forceCloudflareFailure: this.options.forceCloudflareFailure,
      startCloudflare: () => this.startCloudflareInstance(port),
      startPinggy: () => this.startPinggyInstance(port),
      log: this.options.tunnelLog
    })
  }

  private async swapToPinggy(): Promise<void> {
    const port = this.port
    if (!port) throw new Error('Bridge is not running.')
    const pinggy = await this.startPinggyInstance(port)
    const previous = this.tunnelInstance
    this.tunnelInstance = pinggy
    this.tunnelActive = true
    this.tunnelError = undefined
    if (previous) await previous.stop().catch(() => undefined)
  }

  private async startCloudflareInstance(port: number): Promise<InternetTunnelInstance> {
    if (this.options.createCloudflareTunnel) return this.options.createCloudflareTunnel(port)
    const cacheDir = this.tunnelCacheDir()
    const binaryPath = await ensureCloudflaredBinary({
      cacheDir,
      customPath: this.options.cloudflaredPath
    })
    return startCloudflareQuickTunnel({
      port,
      binaryPath,
      log: this.options.tunnelLog
    })
  }

  private async startPinggyInstance(port: number): Promise<InternetTunnelInstance> {
    if (this.options.createPinggyTunnel) return this.options.createPinggyTunnel(port)
    const cacheDir = this.tunnelCacheDir()
    return startPinggyTunnel({
      port,
      sshPath: this.options.pinggySshPath,
      knownHostsPath: join(cacheDir, 'pinggy-known-hosts'),
      log: this.options.tunnelLog
    })
  }

  private tunnelCacheDir(): string {
    return this.options.cloudflaredCacheDir ?? join(tmpdir(), 'dsh-cloudflared')
  }

  /** Every private IPv4 the bridge can be reached on, preferred address first. */
  lanAddressCandidates(): string[] {
    return lanAddressCandidates(this.lanAddress ?? preferredLanAddress())
  }

  /** Pairing URLs for the current token: fixed public origin, tunnel, then every LAN candidate. */
  pairingUrls(): string[] {
    if (!this.pairingTokenValid() || !this.port) return []
    const urls: string[] = []
    const publicUrl = this.options.publicUrl?.()?.replace(/\/+$/, '')
    if (publicUrl) urls.push(`${publicUrl}/pair?token=${this.pairingToken}`)
    if (this.tunnelActive && this.tunnelInstance?.url) {
      urls.push(`${this.tunnelInstance.url}/pair?token=${this.pairingToken}`)
    }
    for (const address of this.lanAddressCandidates()) {
      urls.push(`http://${address}:${this.port}/pair?token=${this.pairingToken}`)
    }
    return urls
  }

  private lanPairingUrl(): string | undefined {
    if (!this.pairingTokenValid() || !this.port) return undefined
    const address = this.lanAddressCandidates()[0]
    return address ? `http://${address}:${this.port}/pair?token=${this.pairingToken}` : undefined
  }

  private async cacheLanAddress(): Promise<void> {
    if (this.lanAddressResolved) return
    this.lanAddressResolved = true
    this.lanAddress = await resolveDefaultRouteAddress(
      this.options.lanAddress !== undefined
        ? async () => this.options.lanAddress
        : (this.options.probeDefaultRouteAddress ?? probeDefaultRouteAddress)
    )
  }

  snapshot(): LanMobileBridgeSnapshot {
    if (!this.server || !this.port) {
      return { running: false, connected: this.mobileBrowserOnline(), browserDevices: [] }
    }
    // The pairing token is single-use (consumed on approval) and short-lived.
    // Tunnel and listener state must stay visible regardless, otherwise the
    // settings panel loses the connection-mode UI right after a phone pairs.
    const tokenValid = this.pairingTokenValid()
    const pairingUrl = this.pairingUrls()[0]
    return {
      running: true,
      connected: this.mobileBrowserOnline(),
      browserDevices: this.browserDeviceSnapshot(),
      port: this.port,
      ...(tokenValid && pairingUrl ? { pairingUrl, expiresAt: this.pairingExpiresAt } : {}),
      tunnelActive: this.tunnelActive,
      tunnelLoading: this.tunnelLoading,
      tunnelUrl: this.tunnelInstance?.url,
      tunnelProvider: this.tunnelInstance?.provider,
      tunnelError: this.tunnelError
    }
  }

  private rotatePairingToken(): void {
    this.pairingToken = randomBytes(32).toString('base64url')
    this.pairingExpiresAt = this.now() + PAIRING_TTL_MS
  }

  private pairingTokenValid(): boolean {
    return Boolean(this.pairingToken && this.pairingExpiresAt && this.pairingExpiresAt >= this.now())
  }

  private storedPinState(): PairingPinState {
    return this.options.pairingPinStore?.load() ?? {}
  }

  private readPairingPin(): PairingPinView {
    const stored = this.storedPinState()
    if (stored.pinConsent === true) {
      return { pin: stored.pin, expired: false, consent: true }
    }
    if (this.ephemeralPin && this.ephemeralPinExpiresAt && this.ephemeralPinExpiresAt >= this.now()) {
      return {
        pin: this.ephemeralPin,
        expired: false,
        consent: false,
        expiresAt: this.ephemeralPinExpiresAt
      }
    }
    if (this.ephemeralPin && this.ephemeralPinExpiresAt && this.ephemeralPinExpiresAt < this.now()) {
      return { expired: true, consent: false, expiresAt: this.ephemeralPinExpiresAt }
    }
    return { expired: false, consent: false }
  }

  private tunnelPinAcceptsReconnect(): boolean {
    const view = this.readPairingPin()
    return Boolean(view.pin) && !view.expired
  }

  private generatePairingPin(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
  }

  private ensurePairingPin(): string | undefined {
    const stored = this.storedPinState()
    if (stored.pinConsent === true) {
      if (stored.pin) return stored.pin
      const pin = this.generatePairingPin()
      if (!this.options.pairingPinStore?.save({ pin, pinConsent: true })) return undefined
      this.ephemeralPin = undefined
      this.ephemeralPinExpiresAt = undefined
      return pin
    }
    const current = this.readPairingPin()
    if (current.pin && !current.expired) return current.pin
    this.ephemeralPin = this.generatePairingPin()
    this.ephemeralPinExpiresAt = this.now() + PIN_TTL_MS
    return this.ephemeralPin
  }

  /**
   * The one place a fixed password is written: six digits pins it, null hands
   * the job back to the rotating random PIN. Phones admitted by a different
   * password are dropped, because the value they were told no longer works.
   */
  setDurablePin(pin: string | null): boolean {
    const before = this.readPairingPin().pin
    if (!this.options.pairingPinStore?.save(pin === null ? { pinConsent: false } : { pin, pinConsent: true })) {
      return false
    }
    this.ephemeralPin = undefined
    this.ephemeralPinExpiresAt = undefined
    this.clearPinFailures()
    if (this.readPairingPin().pin !== before) this.revokeMobileSessions()
    return true
  }

  private pairingPinFields(): {
    pairingPin?: string
    pinConsent: boolean
    pinExpiresAt?: number
  } {
    // A named tunnel on the user's own domain is public access too: this process
    // did not start it, but every internet caller still has to type the password.
    const publicAccess = this.tunnelActive || Boolean(this.options.publicUrl?.())
    const view = this.readPairingPin()
    const pin = publicAccess ? this.ensurePairingPin() : view.consent === true ? view.pin : undefined
    // ensurePairingPin 可能刚生成新 PIN；view 是生成前读的，过期时间必须取生成后的字段。
    const pinExpiresAt = view.consent ? undefined : this.ephemeralPinExpiresAt
    return {
      ...(pin ? { pairingPin: pin } : {}),
      pinConsent: view.consent,
      ...(pin && pinExpiresAt ? { pinExpiresAt } : {})
    }
  }

  private pinsEqual(left: string, right: string): boolean {
    const a = Buffer.from(left)
    const b = Buffer.from(right)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private pruneFailures(stamps: number[]): number[] {
    const cutoff = this.now() - PIN_FAIL_WINDOW_MS
    return stamps.filter((stamp) => stamp > cutoff)
  }

  private pinRetryAfterSeconds(remoteAddress: string): number | undefined {
    const ip = this.pruneFailures(this.pinFailuresByIp.get(remoteAddress) ?? [])
    const global = this.pruneFailures(this.pinFailuresGlobal)
    this.pinFailuresByIp.set(remoteAddress, ip)
    this.pinFailuresGlobal = global
    const limited =
      ip.length >= PIN_FAIL_PER_IP || global.length >= PIN_FAIL_GLOBAL
    if (!limited) return undefined
    const oldest = Math.min(
      ...(ip.length >= PIN_FAIL_PER_IP ? [ip[0]!] : []),
      ...(global.length >= PIN_FAIL_GLOBAL ? [global[0]!] : [])
    )
    return Math.max(1, Math.ceil((oldest + PIN_FAIL_WINDOW_MS - this.now()) / 1000))
  }

  private recordPinFailure(remoteAddress: string): number {
    const ip = this.pruneFailures(this.pinFailuresByIp.get(remoteAddress) ?? [])
    ip.push(this.now())
    this.pinFailuresByIp.set(remoteAddress, ip)
    this.pinFailuresGlobal = this.pruneFailures(this.pinFailuresGlobal)
    this.pinFailuresGlobal.push(this.now())
    return this.pinRetryAfterSeconds(remoteAddress) ?? 1
  }

  private clearPinFailures(): void {
    this.pinFailuresByIp.clear()
    this.pinFailuresGlobal = []
  }

  private revokeMobileSessions(): void {
    this.closeSessionStreams()
    this.clearPendingInteractions()
    this.sessions.clear()
    this.suspendedSessions.clear()
    this.resumableSessions.clear()
    this.rotatePairingToken()
    this.clearPinFailures()
    this.syncConnected()
  }

  private closeSessionStreams(): void {
    for (const abort of this.sessionStreamAborts) abort.abort()
    this.sessionStreamAborts.clear()
  }

  /**
   * The settings panel's Disconnect action: the phone keeps a resumable session
   * while the token rotates, so the code that just paired cannot admit another
   * device.
   */
  suspendMobileSessions(): void {
    this.closeSessionStreams()
    this.clearPendingInteractions()
    for (const [token, session] of this.sessions) {
      this.suspendedSessions.set(token, session)
      this.resumableSessions.set(token, session)
    }
    this.sessions.clear()
    this.rotatePairingToken()
    this.syncConnected()
  }

  private issueSessionCookie(
    request: IncomingMessage,
    response: ServerResponse,
    secureTransport: boolean
  ): void {
    const token = randomBytes(32).toString('base64url')
    const existing = this.mobileToken(request)
    if (existing && this.suspendedSessions.has(existing)) {
      const session = this.suspendedSessions.get(existing)!
      this.sessions.set(existing, session)
      this.suspendedSessions.delete(existing)
      this.resumableSessions.delete(existing)
    }
    this.sessions.set(token, { pairedAt: this.now() })
    this.pairingToken = undefined
    this.pairingExpiresAt = undefined
    const secure = secureTransport ? '; Secure' : ''
    response.setHeader(
      'set-cookie',
      `dsh_mobile=${token}; HttpOnly; SameSite=Strict; Path=/${secure}; Max-Age=2592000`
    )
  }

  private async stopCurrentTunnel(): Promise<void> {
    if (!this.tunnelInstance) return
    this.tunnelExpectedStop = true
    try {
      await this.tunnelInstance.stop().catch(() => undefined)
    } finally {
      this.tunnelExpectedStop = false
      this.tunnelInstance = undefined
    }
  }

  private armTunnelProcess(instance: InternetTunnelInstance | undefined): void {
    if (!instance) return
    this.tunnelExpiresAt =
      instance.provider === 'pinggy' ? this.now() + PINGGY_TTL_MS : undefined
    instance.process.once?.('close', () => {
      if (this.tunnelInstance !== instance) return
      if (this.tunnelExpectedStop) return
      this.handleUnexpectedTunnelClose(instance)
    })
  }

  private handleUnexpectedTunnelClose(instance: InternetTunnelInstance): void {
    if (this.tunnelInstance !== instance) return
    this.closeSessionStreams()
    this.tunnelActive = false
    this.tunnelLoading = false
    this.tunnelExpiresAt = undefined
    this.tunnelInstance = undefined
    this.sessions.clear()
    this.syncConnected()
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'no-referrer')
    response.setHeader('content-security-policy', MOBILE_PAGE_CSP)
    response.setHeader('x-frame-options', 'DENY')

    const transportAddress = normalizeRemoteAddress(request.socket.remoteAddress ?? '')
    if (!isPrivateAddress(transportAddress)) return this.text(response, 403, 'Private network only.')
    const connectionMode = this.requestConnectionMode(request)
    const forwardedAddress =
      firstHeaderValue(request.headers['cf-connecting-ip']) ??
      firstHeaderValue(request.headers['x-forwarded-for'])
    const remoteAddress =
      connectionMode === 'tunnel' && forwardedAddress
        ? normalizeRemoteAddress(forwardedAddress)
        : transportAddress
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    // Let's Encrypt 直接在 80 端口上取验证文件，必须排在配对闸门之前响应。
    if (url.pathname.startsWith(ACME_CHALLENGE_PREFIX)) {
      return this.serveAcmeChallenge(url.pathname, response)
    }

    if (request.method === 'GET' && url.pathname.startsWith('/brand-logo/')) {
      const variant = url.pathname === '/brand-logo/dark' ? 'dark' : 'light'
      const path = this.options.brandLogoPaths?.[variant]
      if (!path) return this.text(response, 404, 'Brand asset not found.')
      try {
        const body = await readFile(path)
        response.statusCode = 200
        response.setHeader('content-type', 'image/png')
        response.setHeader('cache-control', 'public, max-age=3600')
        response.end(body)
      } catch {
        this.text(response, 404, 'Brand asset not found.')
      }
      return
    }

    if (request.method === 'GET' && url.pathname === '/disconnected') {
      const migrationUrl = this.tunnelMigrationUrl(url, connectionMode)
      if (migrationUrl) return this.redirect(response, migrationUrl)
      return this.html(response, renderMobileReconnectPage(this.locale(), connectionMode))
    }

    if (request.method === 'GET' && url.pathname === '/reconnect') {
      const migrationUrl = this.tunnelMigrationUrl(url, connectionMode)
      if (migrationUrl) return this.redirect(response, migrationUrl)
      if (connectionMode === 'tunnel') {
        if (this.tunnelPinAcceptsReconnect()) {
          return this.html(response, renderPairingPinPage(this.locale(), this.lanPairingUrl()))
        }
        return this.html(response, renderMobileReconnectPage(this.locale(), 'tunnel', { expired: true }))
      }
      // The phone that was just disconnected still holds its cookie. Restoring
      // that one session does not admit a neighbor who only knows the port.
      if (this.resumeSuspendedMobileSession(request) || this.mobileSessionActive(request)) {
        return this.redirect(response, '/')
      }
      this.options.onReconnectRequested?.()
      return this.html(response, renderMobileReconnectPage(this.locale(), 'lan', { resumeUnavailable: true }))
    }

    if (request.method === 'POST' && url.pathname === '/pair/retry') {
      this.verifySameOrigin(request)
      const migrationUrl = this.tunnelMigrationUrl(new URL('/reconnect', url), connectionMode)
      if (migrationUrl) return this.json(response, 200, { redirectUrl: migrationUrl })
      if (connectionMode === 'tunnel') {
        this.options.onReconnectRequested?.()
        return this.json(response, 200, { ok: true, pinRequired: true })
      }
      if (this.resumeSuspendedMobileSession(request) || this.mobileSessionActive(request)) {
        return this.json(response, 200, { ok: true, reconnected: true })
      }
      this.options.onReconnectRequested?.()
      return this.json(response, 200, { ok: true, rescan: true })
    }

    if (request.method === 'GET' && url.pathname === '/pair') {
      if (this.authorized(request)) {
        response.statusCode = 302
        response.setHeader('location', '/')
        response.end()
        return
      }
      if (!this.validPairingToken(url.searchParams.get('token'))) {
        return this.text(response, 401, 'This pairing link is invalid or expired.')
      }
      if (connectionMode === 'lan') {
        this.issueSessionCookie(
          request,
          response,
          this.requestIsSecure(request, connectionMode)
        )
        response.statusCode = 302
        response.setHeader('location', '/')
        response.end()
        return
      }
      return this.html(response, renderPairingPinPage(this.locale(), this.lanPairingUrl()))
    }

    if (request.method === 'POST' && url.pathname === '/pair/verify') {
      this.verifySameOrigin(request)
      if (connectionMode !== 'tunnel') {
        return this.json(response, 400, { ok: false, error: 'PIN verification is only used for internet pairing.' })
      }
      const retryAfter = this.pinRetryAfterSeconds(remoteAddress)
      if (retryAfter) {
        response.setHeader('retry-after', String(retryAfter))
        return this.json(response, 429, { ok: false, error: 'Too many attempts.', retryAfter })
      }
      let pin = ''
      try {
        const body = await readBody(request)
        const parsed = JSON.parse(body.text) as { pin?: unknown }
        pin = typeof parsed.pin === 'string' ? parsed.pin.trim() : ''
      } catch {
        pin = ''
      }
      const view = this.readPairingPin()
      if (!view.pin || view.expired || !this.pinsEqual(pin, view.pin)) {
        if (view.expired || !view.pin) {
          return this.json(response, 401, { ok: false, error: 'expired', rescan: true })
        }
        this.recordPinFailure(remoteAddress)
        const limited = this.pinRetryAfterSeconds(remoteAddress)
        if (limited) {
          response.setHeader('retry-after', String(limited))
          return this.json(response, 429, { ok: false, error: 'Too many attempts.', retryAfter: limited })
        }
        return this.json(response, 401, { ok: false, error: 'Invalid pairing password.' })
      }
      this.clearPinFailures()
      this.issueSessionCookie(
        request,
        response,
        this.requestIsSecure(request, connectionMode)
      )
      return this.json(response, 200, { ok: true })
    }

    if (!this.authorized(request)) {
      if (request.method === 'GET' && url.pathname === '/') {
        const migrationUrl = this.tunnelMigrationUrl(url, connectionMode)
        if (migrationUrl) return this.redirect(response, migrationUrl)
        return this.html(response, renderMobileReconnectPage(this.locale(), connectionMode))
      }
      return this.text(response, 401, 'Pair your phone again.')
    }
    if (request.method === 'GET' && url.pathname === '/') {
      response.setHeader('content-security-policy', MOBILE_MAIN_PAGE_CSP)
    }
    if (await serveMobileStatic(request, response)) return
    if (request.method === 'GET' && url.pathname === '/manifest.webmanifest') {
      return this.serveWebManifest(response)
    }
    if (request.method === 'GET' && url.pathname.startsWith(BRAND_ICON_PREFIX)) {
      return this.serveBrandIcon(url.pathname.slice(BRAND_ICON_PREFIX.length), response)
    }
    if (request.method === 'GET' && url.pathname === '/api/status') {
      return this.json(response, 200, {
        connected: true,
        tunnelProvider: this.tunnelInstance?.provider,
        tunnelExpiresAt: this.tunnelExpiresAt
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/attachment') {
      try {
        this.verifyTrustedOrigin(request)
      } catch {
        return this.json(response, 403, {
          ok: false,
          code: 'forbidden',
          error: 'Cross-origin request rejected.'
        })
      }
      return this.serveAttachment(response, url)
    }
    if (request.method === 'GET' && url.pathname === '/api/session/stream') {
      this.verifyTrustedOrigin(request)
      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId) return this.text(response, 400, 'Session id is required.')
      return this.streamSession(request, response, sessionId)
    }
    if (request.method === 'POST' && url.pathname === '/api/rpc') {
      this.verifySameOrigin(request)
      return this.handleRpc(request, response)
    }
    this.text(response, 404, 'Not found.')
  }

  private async handleRpc(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let body: Awaited<ReturnType<typeof readBody>>
    try {
      body = await readBody(request, MAX_RPC_BODY_BYTES)
    } catch {
      return this.json(response, 400, {
        ok: false,
        code: 'invalid-request',
        error: 'Unable to read the request body.'
      })
    }
    if (body.tooLarge) return this.rejectPayloadTooLarge(request, response)

    let parsed: unknown
    try {
      parsed = JSON.parse(body.text)
    } catch {
      return this.json(response, 400, {
        ok: false,
        code: 'invalid-request',
        error: 'Request body is not valid JSON.'
      })
    }
    if (!isRecord(parsed)) {
      return this.json(response, 400, {
        ok: false,
        code: 'invalid-request',
        error: 'Request body must be a JSON object.'
      })
    }
    const input = parsed as { method?: unknown; payload?: unknown }
    if (body.bytes > rpcBodyLimit(input.method)) {
      return this.rejectPayloadTooLarge(request, response)
    }

    try {
      if (input.method === 'interaction.pending') {
        const sessionId = requiredStringField(input.payload, 'sessionId')
        const pending = [...this.pendingQuestions.values()].find(
          (item) => item.sessionId === sessionId
        )
        return this.json(response, 200, { ok: true, value: pending ?? null })
      }
      if (input.method === 'interaction.answer') {
        const answer = parseQuestionResponse(input.payload)
        const pending = this.assertPendingQuestion(answer.rpcId, answer.sessionId)
        validateQuestionAnswers(pending, answer.answers)
        const result = await this.respondToQuestion(answer.rpcId, {
          kind: 'result',
          value: { answers: answer.answers }
        })
        return this.json(response, this.rpcStatus(result), this.rpcBody(result))
      }
      if (input.method === 'interaction.cancel') {
        const rpcId = requiredStringField(input.payload, 'rpcId')
        const sessionId = requiredStringField(input.payload, 'sessionId')
        this.assertPendingQuestion(rpcId, sessionId)
        const result = await this.respondToQuestion(rpcId, {
          kind: 'rejected',
          error: {
            name: 'Error',
            message: 'the user closed this question request',
            code: 'cancelled'
          }
        })
        return this.json(response, this.rpcStatus(result), this.rpcBody(result))
      }
      if (input.method === 'approval.pending') {
        const sessionId = requiredStringField(input.payload, 'sessionId')
        // The approval map is cleared on every disconnect; the client-id guard
        // closes the gap between the carrier opening and its `ready` frame.
        const approval = this.eventClientId === undefined
          ? undefined
          : this.pendingApprovals.get(sessionId)
        return this.json(response, 200, { ok: true, value: { approval: approval ?? null } })
      }
      if (input.method === 'approval.answer') {
        const sessionId = requiredStringField(input.payload, 'sessionId')
        const eventId = requiredStringField(input.payload, 'eventId')
        const outcome = isRecord(input.payload) ? input.payload.outcome : undefined
        if (outcome !== 'allowed-once' && outcome !== 'rejected') {
          throw new MobileRequestError(
            400,
            'invalid-outcome',
            'Approval outcome must be allowed-once or rejected.'
          )
        }
        const pending = this.eventClientId === undefined
          ? undefined
          : this.pendingApprovals.get(sessionId)
        if (!pending || pending.eventId !== eventId) {
          throw new MobileRequestError(
            409,
            'approval-not-pending',
            'This approval request is no longer pending.'
          )
        }
        const result = await this.respondToApproval(sessionId, eventId, outcome)
        if (!result.ok) return this.json(response, this.rpcStatus(result), this.rpcBody(result))
        return this.json(response, 200, { ok: true, value: { ok: true } })
      }
      if (typeof input.method !== 'string' || !RPC_ALLOWLIST.has(input.method)) {
        return this.json(response, 403, { ok: false, error: 'RPC method is not available on mobile.' })
      }
      const payload = validateRpcPayload(input.method, input.payload)
      const result = await this.forwardRpc(input.method, payload)
      return this.json(response, this.rpcStatus(result), this.rpcBody(result))
    } catch (error) {
      if (error instanceof MobileRequestError) {
        return this.json(response, error.status, {
          ok: false,
          code: error.code,
          error: error.message
        })
      }
      throw error
    }
  }

  private async serveAttachment(response: ServerResponse, url: URL): Promise<void> {
    const sessionId = url.searchParams.get('sessionId')
    const attachmentId = url.searchParams.get('attachmentId')
    if (!sessionId || !attachmentId) {
      return this.json(response, 400, {
        ok: false,
        code: 'invalid-request',
        error: 'sessionId and attachmentId are required.'
      })
    }

    const result = await this.invokeHarness('session/attachment', {
      request: { sessionId, attachmentId }
    })
    if (!result.ok) {
      const status = this.attachmentFailureStatus(result)
      return this.json(response, status, {
        ok: false,
        code: status === 404 && result.code === 'harness-unavailable'
          ? 'attachment-not-found'
          : result.code ?? (status === 404 ? 'attachment-not-found' : 'harness-unavailable'),
        error: result.error ?? (status === 404 ? 'Attachment not found.' : 'Harness is not available.'),
        ...(result.details ? { details: result.details } : {})
      })
    }

    const value = result.value
    const attachment = isRecord(value) ? value.attachment : undefined
    const mediaType = isRecord(attachment) ? attachment.mediaType : undefined
    const data = isRecord(value) ? value.data : undefined
    const bytes = typeof data === 'string' ? decodeCanonicalBase64(data) : undefined
    if (
      typeof mediaType !== 'string' ||
      !IMAGE_MEDIA_TYPES.has(mediaType) ||
      bytes === undefined ||
      bytes.length === 0 ||
      bytes.length > MAX_IMAGE_BYTES
    ) {
      return this.json(response, 502, {
        ok: false,
        code: 'harness-unavailable',
        error: 'Harness returned an invalid attachment.'
      })
    }

    if (response.destroyed) return
    response.statusCode = 200
    response.setHeader('content-type', mediaType)
    response.setHeader('content-length', String(bytes.length))
    response.setHeader('etag', `"${attachmentId}"`)
    response.setHeader('cache-control', 'private, max-age=3600')
    response.setHeader('x-content-type-options', 'nosniff')
    response.end(bytes)
  }

  /** Declares the installable phone entry; without brand assets the icon set is absent too. */
  private serveWebManifest(response: ServerResponse): void {
    if (!this.options.brandLogoPaths) return this.text(response, 404, 'Brand asset not found.')
    if (response.destroyed) return
    response.statusCode = 200
    response.setHeader('content-type', 'application/manifest+json')
    response.end(JSON.stringify(MOBILE_WEB_MANIFEST))
  }

  /** One bundled home-screen icon, read from the directory holding the brand logos. */
  private async serveBrandIcon(size: string, response: ServerResponse): Promise<void> {
    const logoPath = this.options.brandLogoPaths?.light
    if (!logoPath || !BRAND_ICON_SIZES.has(size)) return this.text(response, 404, 'Brand asset not found.')
    let body: Buffer
    try {
      body = await readFile(join(dirname(logoPath), `icon-${size}.png`))
    } catch {
      return this.text(response, 404, 'Brand asset not found.')
    }
    if (response.destroyed) return
    response.statusCode = 200
    response.setHeader('content-type', 'image/png')
    response.setHeader('content-length', String(body.length))
    response.setHeader('cache-control', 'public, max-age=86400')
    response.setHeader('x-content-type-options', 'nosniff')
    response.end(body)
  }

  private attachmentFailureStatus(result: HarnessResult): number {
    if (result.httpStatus === 404) return 404
    if (result.code === 'session/not-found' || result.code === 'session/attachment-invalid') {
      return 404
    }
    if (typeof result.error === 'string' && /not found|not referenced|does not exist/i.test(result.error)) {
      return 404
    }
    return 502
  }

  private rpcStatus(result: HarnessResult): number {
    if (result.ok) return 200
    return result.code === 'harness-unavailable' ? 502 : 400
  }

  private rpcBody(result: HarnessResult): Record<string, unknown> {
    if (result.ok) return { ok: true, value: result.value }
    return {
      ok: false,
      error: result.error ?? 'Harness rejected the request.',
      ...(result.code ? { code: result.code } : {}),
      ...(result.details ? { details: result.details } : {})
    }
  }

  private rejectPayloadTooLarge(request: IncomingMessage, response: ServerResponse): void {
    if (response.destroyed) return
    let sent = false
    const send = (): void => {
      if (sent || response.destroyed) return
      sent = true
      response.shouldKeepAlive = false
      response.setHeader('connection', 'close')
      this.json(response, 413, PAYLOAD_TOO_LARGE)
      response.once('finish', () => request.destroy())
    }
    if (request.complete) {
      send()
      return
    }
    // Answering while the client is still uploading makes fetch surface a
    // reset instead of the 413, so drain the rest of the request body first.
    request.resume()
    request.once('end', send)
    request.once('close', send)
  }

  private locale(): 'en' | 'zh' {
    const value = this.options.locale
    return typeof value === 'function' ? value() : value ?? 'en'
  }

  private validPairingToken(candidate: string | null): boolean {
    if (!candidate || !this.pairingToken || !this.pairingExpiresAt) return false
    if (this.now() > this.pairingExpiresAt) return false
    const left = Buffer.from(candidate)
    const right = Buffer.from(this.pairingToken)
    return left.length === right.length && timingSafeEqual(left, right)
  }

  private authorized(request: IncomingMessage): boolean {
    const token = this.mobileToken(request)
    if (!token) return false
    const session = this.sessions.get(token)
    if (!session) return false
    if (!this.sessionUsable(session)) {
      this.sessions.delete(token)
      return false
    }
    session.lastSeenAt = this.now()
    return true
  }

  private mobileToken(request: IncomingMessage): string | undefined {
    return this.cookieValue(request, 'dsh_mobile')
  }

  /** Restores one session the settings panel's disconnect suspended. */
  private resumeSuspendedMobileSession(request: IncomingMessage): boolean {
    const token = this.mobileToken(request)
    if (!token) return false
    const session = this.resumableSessions.get(token)
    if (!session || !this.sessionUsable(session)) return false
    this.resumableSessions.delete(token)
    this.suspendedSessions.delete(token)
    session.lastSeenAt = this.now()
    this.sessions.set(token, session)
    return true
  }

  private mobileSessionActive(request: IncomingMessage): boolean {
    const token = this.mobileToken(request)
    const session = token ? this.sessions.get(token) : undefined
    if (!session || !this.sessionUsable(session)) return false
    session.lastSeenAt = this.now()
    return true
  }

  /** A paired browser counts as connected only while it is actually making requests. */
  private mobileBrowserOnline(): boolean {
    const now = this.now()
    return [...this.sessions.values()].some(
      (session) => this.sessionUsable(session) && now - (session.lastSeenAt ?? session.pairedAt) < 30_000
    )
  }

  private browserDeviceSnapshot(): BrowserDeviceSnapshot[] {
    const now = this.now()
    const devices: BrowserDeviceSnapshot[] = []
    const add = (sessions: Map<string, MobileSession>, disconnected: boolean) => {
      for (const [token, session] of sessions) {
        if (!this.sessionUsable(session)) continue
        const lastSeenAt = session.lastSeenAt ?? session.pairedAt
        devices.push({
          id: createHash('sha256').update(token).digest('hex').slice(0, 8),
          pairedAt: session.pairedAt,
          lastSeenAt,
          status: disconnected ? 'disconnected' : now - lastSeenAt < 30_000 ? 'active' : 'idle'
        })
      }
    }
    add(this.sessions, false)
    add(this.suspendedSessions, true)
    return devices.sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  }

  private sessionUsable(session: MobileSession): boolean {
    return this.now() - session.pairedAt < MOBILE_SESSION_TTL_MS
  }

  private cookieValue(request: IncomingMessage, name: string): string | undefined {
    const cookie = request.headers.cookie ?? ''
    return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookie)?.[1]
  }

  private verifySameOrigin(request: IncomingMessage): void {
    this.verifyTrustedOrigin(request)
  }

  /**
   * Rejects browser-driven cross-site requests against the mobile surface. The
   * pairing window and same-origin fetches pass; requests without Fetch
   * Metadata and Origin headers (local tooling, tests) pass as well.
   */
  private verifyTrustedOrigin(request: IncomingMessage): void {
    const site = firstHeaderValue(request.headers['sec-fetch-site'])
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new Error('Cross-site request rejected.')
    }
    const origin = request.headers.origin
    const host = request.headers.host
    if (origin && host && new URL(origin).host !== host) throw new Error('Cross-origin request rejected.')
  }

  /**
   * Public traffic is recognised from transport evidence, never from a Host
   * header the caller controls. Any forwarding header means a reverse proxy is
   * in front of the bridge, so the request must pass the PIN gate. A configured
   * fixed public origin is likewise fail-closed: its LAN listener cannot tell a
   * local browser from an frpc-forwarded request, so both need the PIN.
   */
  private requestConnectionMode(request: IncomingMessage): MobileConnectionMode {
    const host = requestHostname(request.headers.host)
    const forwarded = Object.keys(request.headers).some(
      (name) =>
        name === 'forwarded' ||
        name === 'x-real-ip' ||
        name.startsWith('x-forwarded-') ||
        name.startsWith('cf-')
    )
    if (forwarded) return 'tunnel'
    if (this.options.publicUrl?.()) return 'tunnel'
    return isInternetTunnelHost(host) ? 'tunnel' : 'lan'
  }

  /** Secure cookies require an HTTPS transport, not merely a public-entry decision. */
  private requestIsSecure(
    request: IncomingMessage,
    connectionMode: MobileConnectionMode
  ): boolean {
    if ((request.socket as { encrypted?: boolean }).encrypted) return true
    if (firstHeaderValue(request.headers['cf-ray']) || firstHeaderValue(request.headers['cf-connecting-ip'])) {
      return true
    }
    const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto'])
      ?.split(',')[0]
      ?.trim()
      .toLowerCase()
    if (forwardedProto) return forwardedProto === 'https'
    const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host'])
      ?.split(',')[0]
      ?.trim()
      .toLowerCase()
    if (forwardedHost) {
      return !isPrivateAddress(requestHostname(forwardedHost)) && forwardedHost !== 'localhost'
    }
    if (connectionMode !== 'tunnel') return false
    const host = requestHostname(request.headers.host).toLowerCase()
    return !isPrivateAddress(host) && host !== 'localhost' && !host.endsWith('.local')
  }

  private tunnelMigrationUrl(url: URL, connectionMode: MobileConnectionMode): string | undefined {
    if (connectionMode === 'tunnel' || !this.tunnelActive || !this.tunnelInstance?.url) return undefined
    return new URL(`${url.pathname}${url.search}`, this.tunnelInstance.url).toString()
  }

  /**
   * The Host session cookie for one Harness base, obtained once and reused.
   *
   * Since 0.1.2-alpha.1 every Host API call is authenticated before dispatch:
   * an unauthenticated caller gets 401, and the launch token is accepted only
   * as `GET /?token=...` on the root — never on an API path and never in an
   * Authorization header. The bridge is a server-side client, not a browser,
   * so it performs that exchange itself.
   *
   * The cookie is signed against the request authority, so every later call
   * has to reach the Host under the same `Host` value the exchange used. That
   * is why the bridge talks to the loopback base rather than forwarding the
   * phone's own authority.
   */
  private harnessCookie?: { base: string; cookie: string }

  private async harnessSession(base: string): Promise<string | undefined> {
    if (this.harnessCookie?.base === base) return this.harnessCookie.cookie
    const token = this.options.harnessAuthToken?.()
    if (token === undefined) return undefined
    const url = new URL('/', base)
    url.searchParams.set('token', token)
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000)
    })
    // The exchange answers 303 to a clean `/`; anything else means the token
    // was stale or already spent, and the caller surfaces the resulting 401.
    const cookie = cookiePair(response.headers.getSetCookie())
    if (cookie === undefined) return undefined
    this.harnessCookie = { base, cookie }
    return cookie
  }

  /**
   * Call the Host with the session cookie, exchanging the launch token first
   * and once more if the stored cookie has stopped being accepted.
   */
  private async harnessFetch(url: URL, init: RequestInit, base: string): Promise<Response> {
    const send = async (cookie: string | undefined): Promise<Response> => fetch(url, {
      ...init,
      headers: { ...init.headers, ...(cookie === undefined ? {} : { cookie }) }
    })
    let response = await send(await this.harnessSession(base))
    if (response.status === 401) {
      this.harnessCookie = undefined
      const retry = await this.harnessSession(base)
      if (retry !== undefined) response = await send(retry)
    }
    return response
  }

  /**
   * Translate one mobile method onto its Host endpoint and drive it.
   *
   * `session.history` is the one call the page cannot express directly: the
   * Host replaced open-ended history reads with a cursor-bounded page, and
   * refuses a `throughSeq` past the session's own cursor. The cursor is the
   * opening `session/follow` snapshot cursor, so a tail read and every earlier
   * page that follows it stay inside one stable view of the same session.
   */
  private async forwardRpc(method: string, payload: unknown): Promise<HarnessResult> {
    const fields = typeof payload === 'object' && payload !== null
      ? payload as Record<string, unknown>
      : {}

    if (method === 'workspace.list') {
      // The Host kept no unary workspace read: `workspace/follow` is a stream,
      // and its opening `baseline` frame is exactly the projection this call
      // used to return. The mux consumer keeps that baseline, so the answer is
      // whatever the carrier last observed.
      const snapshot = this.workspaceSnapshot
      if (snapshot === undefined) return { ok: false, error: 'Harness workspaces are not loaded yet.' }
      return { ok: true, value: snapshot }
    }

    if (method === 'session.history') {
      const sessionId = fields.sessionId
      if (typeof sessionId !== 'string' || !sessionId) {
        return { ok: false, error: 'Invalid sessionId.' }
      }
      const beforeSeq = fields.beforeSeq
      if (
        beforeSeq !== undefined &&
        (!Number.isSafeInteger(beforeSeq) || (beforeSeq as number) < 0)
      ) {
        return { ok: false, error: 'Invalid beforeSeq.' }
      }
      const maxMessages = fields.maxMessages === undefined
        ? HISTORY_DEFAULT_MAX_MESSAGES
        : Number.isSafeInteger(fields.maxMessages) && (fields.maxMessages as number) > 0
          ? fields.maxMessages as number
          : undefined
      if (maxMessages === undefined) return { ok: false, error: 'Invalid maxMessages.' }

      const listed = await this.invokeHarness('session/list', { _request: {} })
      if (!listed.ok) return listed
      const items = (listed.value as {
        items?: {
          sessionId?: unknown
          projections?: { asOfSeq?: unknown; values?: unknown }
        }[]
      }).items ?? []
      const row = items.find((item) => item.sessionId === sessionId)
      const projections = row?.projections
      const snapshotCursor = this.sessionSnapshotCursors.get(sessionId)
      const listedCursor = projections?.asOfSeq
      const initialCursor = typeof snapshotCursor === 'number' ? snapshotCursor : listedCursor
      if (typeof initialCursor !== 'number') {
        return { ok: false, error: 'Harness has no cursor for this session.' }
      }
      // A backwards page must stay bounded to the cursor the tail page was
      // read from. Reusing that pinned cursor keeps consecutive scroll pages
      // contiguous; a new follow snapshot re-pins the next scroll.
      const throughSeq = beforeSeq === undefined
        ? initialCursor
        : this.historyThroughSeqs.get(sessionId) ?? initialCursor
      this.historyThroughSeqs.set(sessionId, throughSeq)

      const page = await this.invokeHarness('session/page', {
        request: {
          address: { kind: 'session', sessionId },
          throughSeq,
          maxMessages,
          ...(beforeSeq === undefined
            ? {}
            : { beforeSeq, turnWindow: HISTORY_TURN_WINDOW })
        }
      })
      if (!page.ok) return page
      const value = page.value as { records?: unknown; hasMore?: unknown }
      if (!Array.isArray(value?.records)) {
        return { ok: false, error: 'Harness returned invalid session history.' }
      }
      // Harness 0.1.2 calls the durable entries `records` and serves
      // projections on the list row. Keep the stable mobile-page contract so
      // cached pages can still render messages, running state, and todos.
      return {
        ok: true,
        value: {
          events: value.records,
          projections,
          hasMore: value.hasMore === true,
          oldestSeq: oldestEventSeq(value.records),
          throughSeq
        }
      }
    }

    const route = HARNESS_ENDPOINTS[method]
    if (route === undefined) return { ok: false, error: 'RPC method is not available on mobile.' }
    return this.invokeHarness(route.endpoint, route.args(fields))
  }

  private async invokeHarness(
    endpoint: string,
    args: Record<string, unknown>
  ): Promise<HarnessResult> {
    const unavailable = (): HarnessResult => ({
      ok: false,
      code: 'harness-unavailable',
      error: 'Harness is not available.'
    })
    let base: string | undefined
    try {
      base = this.options.harnessUrl()
    } catch {
      return unavailable()
    }
    if (!base) return unavailable()

    const rpcId = randomUUID()
    let response: Response
    try {
      response = await this.harnessFetch(new URL(`/api/${endpoint}`, base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload: { args } }),
        signal: AbortSignal.timeout(30_000)
      }, base)
    } catch {
      return unavailable()
    }
    if (!response.ok) {
      return {
        ...unavailable(),
        error: `Harness transport returned HTTP ${response.status}.`,
        httpStatus: response.status
      }
    }

    let envelope: {
      rpcId?: unknown
      result?: {
        ok?: unknown
        value?: unknown
        error?: { code?: unknown; message?: unknown; details?: unknown }
      }
    }
    try {
      envelope = (await response.json()) as typeof envelope
    } catch {
      return { ...unavailable(), error: 'Harness returned an invalid response.' }
    }
    if (envelope.rpcId !== rpcId) {
      return { ...unavailable(), error: 'Harness RPC response did not match the request.' }
    }
    if (envelope.result?.ok !== true) {
      const failure = envelope.result?.error
      const details = isRecord(failure?.details) ? failure.details : undefined
      return {
        ok: false,
        error: typeof failure?.message === 'string'
          ? failure.message
          : 'Harness rejected the request.',
        ...(typeof failure?.code === 'string' ? { code: failure.code } : {}),
        ...(details ? { details } : {})
      }
    }
    return { ok: true, value: envelope.result.value }
  }

  /**
   * Reconciles everything that depends on a phone being attached. The mux
   * downlink exists purely to track questions and approval requests raised for
   * a mobile client, so running it with no client meant reconnecting twice a
   * second, forever, on every installation that never used the feature.
   */
  private syncConnected(): void {
    const connected = this.mobileBrowserOnline()
    if (connected) {
      this.startMuxMonitor()
    } else {
      this.muxAbort?.abort()
      this.clearPendingInteractions()
    }
    if (connected === this.lastConnected) return
    this.lastConnected = connected
    // Reconciliation runs off the request path, so a throwing observer must not
    // turn into an unhandled rejection that fails the request behind it.
    try {
      this.options.onConnectedChange?.(connected)
    } catch {
      // A renderer that went away mid-broadcast is not the bridge's problem.
    }
  }

  private startMuxMonitor(): void {
    if (this.muxTask) return
    const abort = new AbortController()
    this.muxAbort = abort
    this.muxTask = this.monitorMux(abort.signal).finally(() => {
      if (this.muxAbort === abort) {
        this.muxAbort = undefined
        this.muxTask = undefined
      }
    })
  }

  private async monitorMux(signal: AbortSignal): Promise<void> {
    let lastBase: string | undefined
    // A Harness that never accepts the downlink used to be retried at a flat
    // 500ms for as long as the app ran. Backing off turns a permanent failure
    // into two attempts a minute instead of a hundred.
    let backoffMs = MUX_RECONNECT_MS
    const backOff = async (): Promise<void> => {
      await waitFor(backoffMs, signal)
      backoffMs = Math.min(backoffMs * 2, MUX_RECONNECT_CAP_MS)
    }

    while (!signal.aborted) {
      const base = this.options.harnessUrl()
      if (!base) {
        this.clearPendingInteractions()
        await backOff()
        continue
      }
      if (base !== lastBase) {
        this.clearPendingInteractions()
        lastBase = base
        backoffMs = MUX_RECONNECT_MS
      }
      let openedAt: number | undefined
      try {
        await this.consumeMux(base, signal, () => {
          openedAt = this.now()
        })
        backoffMs = MUX_RECONNECT_MS
      } catch {
        if (signal.aborted) return
        this.clearPendingInteractions()
        // A connection that held for a while and then dropped is a transient
        // fault, not a Harness that refuses the downlink: retry promptly.
        if (openedAt !== undefined && this.now() - openedAt >= MUX_STABLE_MS) {
          backoffMs = MUX_RECONNECT_MS
        }
        await backOff()
      }
    }
  }

  private async consumeMux(
    base: string,
    signal: AbortSignal,
    onOpen?: () => void
  ): Promise<void> {
    // 0.1.2-alpha.1 replaced the event mux with the Gateway stream carrier:
    // one WebSocket multiplexing logical streams, each opened by name. The
    // forwarded-event stream is `$events`, and the upgrade itself is
    // authenticated, so it carries the same session cookie as the unary calls.
    const url = new URL(REMOTE_STREAM_MUX_PATH, base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const cookie = await this.harnessSession(base)
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: cookie === undefined ? {} : { cookie }
      })
      // `ws` raises 'error' asynchronously when close() aborts a still-CONNECTING
      // socket ("WebSocket was closed before the connection was established") —
      // exactly what finish() below does to unwind on abort. cleanup() has
      // already removed the real handleError listener by the time that fires,
      // so without a permanent sink here that self-inflicted error becomes an
      // unhandled 'error' event and crashes the process.
      socket.addEventListener('error', () => {})
      let settled = false
      const cleanup = (): void => {
        signal.removeEventListener('abort', handleAbort)
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('close', handleClose)
        socket.removeEventListener('error', handleError)
      }
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
          socket.close()
        }
        if (error) reject(error)
        else resolve()
      }
      const handleAbort = (): void => finish()
      const handleOpen = (): void => {
        onOpen?.()
        this.clearPendingInteractions()
        this.eventClientId = undefined
        // Two logical streams share this carrier: the forwarded events that
        // raise questions, and the workspace projection whose opening
        // `baseline` frame is the list the Host no longer serves unary.
        socket.send(JSON.stringify({
          type: 'open',
          streamId: EVENT_STREAM_ID,
          endpoint: REMOTE_EVENT_STREAM_ENDPOINT,
          payload: { args: {} }
        }))
        socket.send(JSON.stringify({
          type: 'open',
          streamId: WORKSPACE_STREAM_ID,
          endpoint: 'workspace/follow',
          payload: { args: {} }
        }))
      }
      const handleMessage = (event: { data: unknown }): void => {
        const data = event.data
        if (typeof data === 'string') this.consumeMuxEnvelope(data)
        else if (Buffer.isBuffer(data)) this.consumeMuxEnvelope(data.toString('utf8'))
      }
      const handleClose = (): void => {
        finish(signal.aborted ? undefined : new Error('Harness mux WebSocket closed.'))
      }
      const handleError = (): void => finish(new Error('Harness mux WebSocket failed.'))
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose, { once: true })
      socket.addEventListener('error', handleError, { once: true })
      signal.addEventListener('abort', handleAbort, { once: true })
      if (signal.aborted) handleAbort()
    })
  }

  /** Forward one native Harness session/follow stream to an authenticated phone as SSE. */
  private async streamSession(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string
  ): Promise<void> {
    const base = this.options.harnessUrl()
    if (!base) return this.text(response, 503, 'Harness is not ready.')
    const cookie = await this.harnessSession(base)
    const url = new URL(REMOTE_STREAM_MUX_PATH, base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const streamId = `mobile-session-${randomUUID()}`
    const abort = new AbortController()
    this.sessionStreamAborts.add(abort)
    const token = this.mobileToken(request)
    const authTimer = setInterval(() => {
      const session = token ? this.sessions.get(token) : undefined
      if (session && this.sessionUsable(session)) return
      abort.abort()
      if (!response.writableEnded) response.end()
    }, 15_000)
    authTimer.unref?.()

    response.statusCode = 200
    response.setHeader('content-type', 'text/event-stream; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.setHeader('connection', 'keep-alive')
    response.flushHeaders()
    response.write('retry: 500\n\n')

    await new Promise<void>((resolve) => {
      const socket = new WebSocket(url, { headers: cookie === undefined ? {} : { cookie } })
      // `ws` raises 'error' asynchronously when close() aborts a still-CONNECTING
      // socket ("WebSocket was closed before the connection was established") —
      // exactly what finish() below does to unwind on abort. cleanup() has
      // already removed the real handleError listener by the time that fires,
      // so without a permanent sink here that self-inflicted error becomes an
      // unhandled 'error' event and crashes the process. consumeMux guards the
      // same close pattern with the identical sink; keep the two in lockstep.
      socket.addEventListener('error', () => {})
      let settled = false
      const cleanup = (): void => {
        clearInterval(authTimer)
        request.removeListener('close', finish)
        abort.signal.removeEventListener('abort', finish)
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('close', handleClose)
        socket.removeEventListener('error', handleError)
        this.sessionStreamAborts.delete(abort)
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        cleanup()
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
        if (!response.writableEnded) response.end()
        resolve()
      }
      const handleOpen = (): void => {
        socket.send(JSON.stringify({
          type: 'open',
          streamId,
          endpoint: 'session/follow',
          payload: {
            args: {
              request: {
                address: { kind: 'session', sessionId },
                maxMessages: HISTORY_DEFAULT_MAX_MESSAGES
              }
            }
          }
        }))
      }
      const handleMessage = (event: { data: unknown }): void => {
        const text = typeof event.data === 'string'
          ? event.data
          : Buffer.isBuffer(event.data) ? event.data.toString('utf8') : undefined
        if (!text) return
        let frame: unknown
        try { frame = JSON.parse(text) } catch { return }
        if (!isRecord(frame) || frame.streamId !== streamId) return
        if (frame.type === 'item') {
          const value = frame.value
          const snapshot = isRecord(value) && value.type === 'snapshot'
          if (snapshot && typeof value.cursor === 'number') {
            // The tail page and every earlier page quote this cursor, so the
            // phone never asks for records past the snapshot it is showing.
            this.sessionSnapshotCursors.set(sessionId, value.cursor)
          }
          response.write(`event: ${snapshot ? 'snapshot' : 'event'}\ndata: ${JSON.stringify(value)}\n\n`)
        } else if (frame.type === 'error' || frame.type === 'end') {
          finish()
        }
      }
      const handleClose = (): void => finish()
      const handleError = (): void => finish()
      request.once('close', finish)
      abort.signal.addEventListener('abort', finish, { once: true })
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose, { once: true })
      socket.addEventListener('error', handleError, { once: true })
      if (abort.signal.aborted) finish()
    })
  }

  /**
   * Consume one carrier frame.
   *
   * Every logical stream shares this socket, so a frame is routed by its
   * `streamId` first. The event stream replaces the old `server-request`
   * envelopes: a question or approval now arrives as a `waterfall` frame
   * carrying its own `eventId`, which is also the id the phone answers with,
   * and the opening `ready` frame names the generation every answer has to
   * quote.
   */
  private consumeMuxEnvelope(data: string): void {
    let frame: unknown
    try {
      frame = JSON.parse(data)
    } catch {
      return
    }
    if (!isRecord(frame) || frame.type !== 'item') return
    const value = frame.value
    if (frame.streamId === WORKSPACE_STREAM_ID) {
      // The phone filters its session list by this snapshot. A session created
      // after connect arrives as an increment, so keeping only the opening
      // baseline hides it until the follow stream reconnects.
      if (isRecord(value)) this.workspaceSnapshot = applyWorkspaceFollowFrame(this.workspaceSnapshot, value)
      return
    }
    if (frame.streamId !== EVENT_STREAM_ID || !isRecord(value)) return
    if (value.type === 'ready' && typeof value.clientId === 'string') {
      this.eventClientId = value.clientId
      return
    }
    if (value.type === 'waterfall' && value.event === USER_QUESTION_EVENT) {
      const eventId = typeof value.eventId === 'string' ? value.eventId : undefined
      const request = isRecord(value.request) ? value.request : undefined
      // The Agent identity travels on the frame, not in the request: the
      // gateway strips the live Agent and the cancellation signal before the
      // request crosses the wire. For a top-level session that identity is the
      // session id, which is what the phone pairs its answer with.
      const agentId = typeof value.agentId === 'string' ? value.agentId : undefined
      if (!eventId || !request || !agentId) return
      const pending = parsePendingQuestion(eventId, { ...request, sessionId: agentId })
      if (pending) this.pendingQuestions.set(eventId, pending)
      return
    }
    if (value.type === 'waterfall' && value.event === APPROVAL_REQUEST_EVENT) {
      const eventId = typeof value.eventId === 'string' ? value.eventId : undefined
      const request = isRecord(value.request) ? value.request : undefined
      const agentId = typeof value.agentId === 'string' ? value.agentId : undefined
      if (!eventId || !request || !agentId) return
      // Approval events carry the same Agent identity as questions: for a
      // top-level session it is the session id the phone is looking at. A
      // second request replaces the first because the Host allows one open
      // approval per session.
      const pending = parsePendingApproval(eventId, agentId, request)
      if (pending) this.pendingApprovals.set(pending.sessionId, pending)
      return
    }
    if (value.type === 'cancel' && typeof value.eventId === 'string') {
      this.forgetPendingEvent(value.eventId)
    }
  }

  /**
   * Questions and approvals both live only as long as the forward-event stream
   * that raised them. Dropping both together keeps a reconnect from offering an
   * answer the Host can no longer accept.
   */
  private clearPendingInteractions(): void {
    this.pendingQuestions.clear()
    this.pendingApprovals.clear()
  }

  /** A `cancel` frame settles by event id, whichever card it belonged to. */
  private forgetPendingEvent(eventId: string): void {
    this.pendingQuestions.delete(eventId)
    for (const [sessionId, approval] of this.pendingApprovals) {
      if (approval.eventId === eventId) this.pendingApprovals.delete(sessionId)
    }
  }

  private assertPendingQuestion(rpcId: string, sessionId: string): PendingMobileQuestion {
    const pending = this.pendingQuestions.get(rpcId)
    if (!pending || pending.sessionId !== sessionId) {
      throw new Error('This question request is no longer pending.')
    }
    return pending
  }

  /**
   * Settle one forwarded event.
   *
   * `/api/respond` went with the ApiProxy. A forwarded event is now settled
   * through the Gateway's own unary endpoint, which pairs the event with the
   * client generation that received it — so an answer sent after a reconnect
   * is refused rather than applied to a stale event.
   */
  private async settleForwardedEvent(
    eventId: string,
    outcome: Record<string, unknown>
  ): Promise<HarnessResult> {
    const clientId = this.eventClientId
    if (clientId === undefined) return { ok: false, error: 'Harness event stream is not connected.' }
    return this.invokeHarness(REMOTE_EVENT_RESULT_ENDPOINT, {
      clientId,
      eventId,
      outcome
    })
  }

  private async respondToQuestion(
    eventId: string,
    outcome: Record<string, unknown>
  ): Promise<HarnessResult> {
    const settled = await this.settleForwardedEvent(eventId, outcome)
    if (settled.ok) this.pendingQuestions.delete(eventId)
    return settled
  }

  private async respondToApproval(
    sessionId: string,
    eventId: string,
    outcome: 'allowed-once' | 'rejected'
  ): Promise<HarnessResult> {
    const settled = await this.settleForwardedEvent(eventId, { kind: 'result', value: outcome })
    if (settled.ok && this.pendingApprovals.get(sessionId)?.eventId === eventId) {
      this.pendingApprovals.delete(sessionId)
    }
    return settled
  }

  /** 只回放挑战目录里的单层文件名，路径穿越和目录列表都不在考虑之内。 */
  private async serveAcmeChallenge(pathname: string, response: ServerResponse): Promise<void> {
    const directory = this.options.acmeChallengeDir?.()
    const name = pathname.slice(ACME_CHALLENGE_PREFIX.length)
    if (!directory || !/^[A-Za-z0-9_-]{1,128}$/.test(name)) return this.text(response, 404, 'Not found.')
    try {
      const body = await readFile(join(directory, name))
      response.statusCode = 200
      response.setHeader('content-type', 'text/plain; charset=utf-8')
      response.setHeader('cache-control', 'no-store')
      response.end(body)
    } catch {
      this.text(response, 404, 'Not found.')
    }
  }

  private html(response: ServerResponse, body: string): void {
    if (response.destroyed) return
    response.statusCode = 200
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end(body)
  }

  private redirect(response: ServerResponse, location: string): void {
    response.statusCode = 302
    response.setHeader('location', location)
    response.end()
  }

  private text(response: ServerResponse, status: number, body: string): void {
    if (response.destroyed) return
    response.statusCode = status
    response.setHeader('content-type', 'text/plain; charset=utf-8')
    response.end(body)
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    if (response.destroyed) return
    if (response.headersSent) {
      response.end()
      return
    }
    response.statusCode = status
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(body))
  }
}

/**
 * The `name=value` pair of the first Set-Cookie header, ready for a Cookie
 * request header. The Host sets exactly one session cookie, host-only and
 * `SameSite=Strict`; its attributes are for browsers and are dropped here.
 * @param headers - raw Set-Cookie values from the exchange response.
 * @returns the cookie pair, or undefined when no cookie was set.
 */
export function cookiePair(headers: readonly string[]): string | undefined {
  for (const header of headers) {
    const pair = header.split(';', 1)[0]?.trim()
    if (pair !== undefined && pair.includes('=')) return pair
  }
  return undefined
}

export function preferredLanAddress(): string | undefined {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && isPrivateAddress(entry.address)) return entry.address
    }
  }
  return undefined
}

/**
 * Resolves the source address the OS would use for outbound traffic. `connect`
 * on a UDP socket only binds the socket to that route; it sends no packet. Any
 * failure or timeout yields undefined so the synchronous scan stands in.
 */
export function probeDefaultRouteAddress(
  timeoutMs = DEFAULT_ROUTE_PROBE_TIMEOUT_MS
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    let settled = false
    const finish = (address?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // A socket that failed before binding has nothing left to close.
      }
      resolve(address)
    }
    const timer = setTimeout(() => finish(), timeoutMs)
    timer.unref()
    socket.once('error', () => finish())
    try {
      socket.connect(DEFAULT_ROUTE_PROBE_PORT, DEFAULT_ROUTE_PROBE_HOST, () => {
        try {
          const local = socket.address()
          finish(typeof local === 'string' ? undefined : local.address)
        } catch {
          finish()
        }
      })
    } catch {
      finish()
    }
  })
}

/** Accepts a probe result only when it is a private, non-loopback IPv4. */
export async function resolveDefaultRouteAddress(
  probe: () => Promise<string | undefined>
): Promise<string | undefined> {
  try {
    const address = await probe()
    return isUsableLanAddress(address) ? address : undefined
  } catch {
    return undefined
  }
}

/** Virtual adapters a phone can never reach (VM host-only links, VPN overlays, containers). */
const VIRTUAL_INTERFACE_PATTERN = /vmware|virtualbox|vbox|hyper-?v|vethernet|wsl|tailscale|zerotier|docker|loopback/i

/** Every private non-internal IPv4, preferred first, without virtual adapters. */
export function lanAddressCandidates(preferred?: string): string[] {
  return selectLanCandidates(networkInterfaces(), preferred)
}

/** Pure selector behind lanAddressCandidates; tests feed it fake interface tables. */
export function selectLanCandidates(
  interfaces: Record<string, { address: string; internal: boolean; family: string }[] | undefined>,
  preferred?: string
): string[] {
  const addresses: string[] = []
  const add = (address: string | undefined) => {
    if (!isUsableLanAddress(address) || addresses.includes(address)) return
    addresses.push(address)
  }
  add(preferred)
  for (const [name, entries] of Object.entries(interfaces)) {
    const virtual = VIRTUAL_INTERFACE_PATTERN.test(name)
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      // The preferred address is the route the OS actually uses, so it stays
      // even when the adapter name looks virtual.
      if (virtual && entry.address !== preferred) continue
      add(entry.address)
    }
  }
  return addresses
}

function isUsableLanAddress(address: string | undefined): address is string {
  return (
    typeof address === 'string' &&
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) &&
    !isLoopbackAddress(address) &&
    isPrivateAddress(address)
  )
}

export function normalizeRemoteAddress(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

export function isLoopbackAddress(address: string): boolean {
  return address === '::1' || address === '127.0.0.1'
}

export function isPrivateAddress(address: string): boolean {
  if (isLoopbackAddress(address)) return true
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true
  const match = /^172\.(\d+)\./.exec(address)
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true
  return /^f[cd][0-9a-f]{2}:/i.test(address) || /^fe8[0-9a-f]:/i.test(address)
}

interface RequestBody {
  text: string
  bytes: number
  tooLarge: boolean
}

function validateRpcPayload(method: string, value: unknown): Record<string, unknown> {
  switch (method) {
    case 'session.prompt':
      return validatePromptPayload(value)
    case 'session.rename':
      return validateRenamePayload(value)
    case 'session.search':
      return validateSearchPayload(value)
    case 'session.updateQueue':
      return validateUpdateQueuePayload(value)
    case 'workspace.archiveSession':
      return validateArchiveSessionPayload(value)
    case 'workspace.unarchiveSession':
      return validateSessionIdPayload(value)
    case 'fileUploads.upload':
      return validateFileUploadPayload(value)
    default:
      return isRecord(value) ? value : {}
  }
}

function rpcBodyLimit(method: unknown): number {
  if (method === 'session.prompt') return MAX_PROMPT_BODY_BYTES
  if (method === 'fileUploads.upload') return MAX_UPLOAD_BODY_BYTES
  return MAX_BODY_BYTES
}

function validatePromptPayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !Array.isArray(value.content) || value.content.length === 0) {
    throw new MobileRequestError(400, 'invalid-content', '消息内容格式不正确。')
  }
  const content = value.content
  if (content.length > MAX_PROMPT_BLOCKS) {
    throw new MobileRequestError(400, 'invalid-content', '一条消息最多包含 10 个内容块。')
  }

  let attachmentCount = 0
  let imageBytes = 0
  let textBytes = 0
  const normalized: unknown[] = []
  for (const block of content) {
    if (!isRecord(block)) {
      throw new MobileRequestError(400, 'invalid-content', '消息内容格式不正确。')
    }
    if (block.type === 'text') {
      if (typeof block.text !== 'string') {
        throw new MobileRequestError(400, 'invalid-content', '消息内容格式不正确。')
      }
      textBytes += Buffer.byteLength(block.text, 'utf8')
      if (textBytes > MAX_PROMPT_TEXT_BYTES) {
        throw new MobileRequestError(400, 'text-too-large', '文字内容不能超过 32KB。')
      }
      normalized.push(block)
      continue
    }
    if (block.type === 'file') {
      attachmentCount += 1
      if (attachmentCount > MAX_PROMPT_ATTACHMENTS) {
        throw new MobileRequestError(400, 'too-many-files', '图片和文件合计最多 6 个。')
      }
      const receiptId = block.receiptId
      if (typeof receiptId !== 'string' || !receiptId.trim()) {
        throw new MobileRequestError(400, 'invalid-file-data', '文件收据无效，请重新上传。')
      }
      normalized.push({ type: 'file', receiptId })
      continue
    }
    if (block.type !== 'image') {
      normalized.push(block)
      continue
    }

    attachmentCount += 1
    if (attachmentCount > MAX_PROMPT_ATTACHMENTS) {
      throw new MobileRequestError(400, 'too-many-images', '图片和文件合计最多 6 个。')
    }
    const mediaType = block.mediaType
    if (typeof mediaType !== 'string' || !IMAGE_MEDIA_TYPES.has(mediaType)) {
      throw new MobileRequestError(400, 'unsupported-image', '只支持 PNG / JPEG / WebP / GIF')
    }
    const data = block.data
    if (typeof data !== 'string' || data.length === 0) {
      throw new MobileRequestError(400, 'invalid-image-data', '图片数据损坏，请重新选择')
    }
    if (data.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new MobileRequestError(413, 'payload-too-large', PAYLOAD_TOO_LARGE.error)
    }
    const decoded = decodeCanonicalBase64(data)
    if (decoded === undefined) {
      throw new MobileRequestError(400, 'invalid-image-data', '图片数据损坏，请重新选择')
    }
    if (decoded.length > MAX_IMAGE_BYTES) {
      throw new MobileRequestError(413, 'payload-too-large', PAYLOAD_TOO_LARGE.error)
    }
    imageBytes += decoded.length
    if (imageBytes > MAX_IMAGE_TOTAL_BYTES) {
      throw new MobileRequestError(413, 'payload-too-large', PAYLOAD_TOO_LARGE.error)
    }

    const image = { ...block }
    if (block.name !== undefined) {
      if (typeof block.name !== 'string') {
        throw new MobileRequestError(400, 'invalid-image-data', '图片名称格式不正确。')
      }
      const name = sanitizeDisplayName(block.name)
      if (name === undefined) delete image.name
      else image.name = name
    }
    normalized.push(image)
  }
  return { ...value, content: normalized }
}

function requiredSessionId(value: unknown): string {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || !value.sessionId.trim()) {
    throw new MobileRequestError(400, 'invalid-session', '会话标识无效。')
  }
  return value.sessionId
}

function validateRenamePayload(value: unknown): Record<string, unknown> {
  const sessionId = requiredSessionId(value)
  const title = isRecord(value) && typeof value.title === 'string' ? value.title.trim() : ''
  if (!title) {
    throw new MobileRequestError(400, 'invalid-title', '会话标题不能为空。')
  }
  if ([...title].length > MAX_RENAME_TITLE_LENGTH) {
    throw new MobileRequestError(400, 'invalid-title', '会话标题不能超过 200 个字符。')
  }
  return { sessionId, title }
}

function validateSearchPayload(value: unknown): Record<string, unknown> {
  const query = isRecord(value) && typeof value.query === 'string' ? value.query.trim() : ''
  if (!query) {
    throw new MobileRequestError(400, 'invalid-query', '搜索关键词不能为空。')
  }
  return { query }
}

function validateArchiveSessionPayload(value: unknown): Record<string, unknown> {
  const sessionId = requiredSessionId(value)
  const stopActivity = isRecord(value) ? value.stopActivity : undefined
  if (stopActivity !== undefined && typeof stopActivity !== 'boolean') {
    throw new MobileRequestError(400, 'invalid-request', 'stopActivity 必须是布尔值。')
  }
  return stopActivity === true ? { sessionId, stopActivity: true } : { sessionId }
}

function validateSessionIdPayload(value: unknown): Record<string, unknown> {
  return { sessionId: requiredSessionId(value) }
}

function validateUpdateQueuePayload(value: unknown): Record<string, unknown> {
  const sessionId = requiredSessionId(value)
  const itemId = isRecord(value) && typeof value.itemId === 'string' ? value.itemId : ''
  if (!itemId.trim()) {
    throw new MobileRequestError(400, 'invalid-action', '队列项标识无效。')
  }
  const action = isRecord(value) ? value.action : undefined
  if (!isRecord(action)) {
    throw new MobileRequestError(400, 'invalid-action', '队列操作格式不正确。')
  }
  if (action.kind === 'remove') {
    return { sessionId, itemId, action: { kind: 'remove' } }
  }
  if (action.kind === 'steer') {
    return { sessionId, itemId, action: { kind: 'steer' } }
  }
  if (action.kind !== 'edit') {
    throw new MobileRequestError(400, 'invalid-action', '队列操作格式不正确。')
  }
  if (
    !Array.isArray(action.content) ||
    action.content.length === 0 ||
    action.content.length > MAX_PROMPT_BLOCKS
  ) {
    throw new MobileRequestError(400, 'invalid-action', '队列编辑必须是 1 到 10 个文本块。')
  }
  let textBytes = 0
  let hasText = false
  const content: { type: 'text'; text: string }[] = []
  for (const block of action.content) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
      throw new MobileRequestError(400, 'invalid-action', '队列编辑只接受文本内容。')
    }
    textBytes += Buffer.byteLength(block.text, 'utf8')
    if (textBytes > MAX_PROMPT_TEXT_BYTES) {
      throw new MobileRequestError(400, 'text-too-large', '队列编辑文字不能超过 32KB。')
    }
    if (block.text.trim()) hasText = true
    content.push({ type: 'text', text: block.text })
  }
  if (!hasText) {
    throw new MobileRequestError(400, 'invalid-action', '队列编辑内容不能为空。')
  }
  return { sessionId, itemId, action: { kind: 'edit', content } }
}

function validateFileUploadPayload(value: unknown): Record<string, unknown> {
  const agent = isRecord(value) && typeof value.agent === 'string' ? value.agent : ''
  if (!agent.trim()) {
    throw new MobileRequestError(400, 'invalid-session', '会话标识无效。')
  }
  const request = isRecord(value) ? value.request : undefined
  if (!isRecord(request)) {
    throw new MobileRequestError(400, 'invalid-file-data', '文件数据无效，请重新选择。')
  }
  const data = request.data
  if (typeof data !== 'string' || data.length === 0) {
    throw new MobileRequestError(400, 'invalid-file-data', '文件数据无效，请重新选择。')
  }
  if (data.length > MAX_UPLOAD_BASE64_LENGTH) {
    throw new MobileRequestError(413, 'payload-too-large', '文件太大，最大 20MB。')
  }
  const bytes = decodeCanonicalBase64(data)
  if (bytes === undefined) {
    throw new MobileRequestError(400, 'invalid-file-data', '文件数据不是规范的 base64。')
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new MobileRequestError(413, 'payload-too-large', '文件太大，最大 20MB。')
  }
  let name: string | undefined
  if (request.name !== undefined) {
    if (typeof request.name !== 'string') {
      throw new MobileRequestError(400, 'invalid-file-name', '文件名格式不正确。')
    }
    name = sanitizeDisplayName(request.name)
    if (name === undefined) {
      throw new MobileRequestError(400, 'invalid-file-name', '文件名格式不正确。')
    }
  }
  return { agent, request: { data, ...(name === undefined ? {} : { name }) } }
}

function decodeCanonicalBase64(value: string): Buffer | undefined {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length === 0 || decoded.toString('base64') !== value) return undefined
  return decoded
}

function sanitizeDisplayName(value: string): string | undefined {
  const cleaned = value
    .replace(/[/\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  const name = [...cleaned].slice(0, MAX_DISPLAY_NAME_LENGTH).join('')
  return name || undefined
}

function readBody(request: IncomingMessage, limit = MAX_BODY_BYTES): Promise<RequestBody> {
  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    return Promise.resolve({ text: '', bytes: declared, tooLarge: true })
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false

    const cleanup = (): void => {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
      request.off('close', onClose)
    }
    const finish = (body: RequestBody): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(body)
    }
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    function onData(chunk: Buffer | string): void {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > limit) {
        request.pause()
        finish({ text: '', bytes, tooLarge: true })
        return
      }
      chunks.push(buffer)
    }
    function onEnd(): void {
      finish({ text: Buffer.concat(chunks).toString('utf8'), bytes, tooLarge: false })
    }
    function onError(error: Error): void {
      fail(error)
    }
    function onAborted(): void {
      fail(new Error('Request aborted.'))
    }
    function onClose(): void {
      if (!settled) fail(new Error('Request closed before the body finished.'))
    }

    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
    request.once('close', onClose)
  })
}

function requestHostname(value: string | string[] | undefined): string {
  const header = firstHeaderValue(value)
  if (!header) return ''
  try {
    return new URL('http://' + header).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return ''
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value?.split(',', 1)[0]
  const normalized = first?.trim()
  return normalized || undefined
}

export function isInternetTunnelHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '')
  return (
    (normalized.endsWith('.trycloudflare.com') && normalized !== 'api.trycloudflare.com') ||
    normalized.endsWith('.pinggy.link') ||
    normalized.endsWith('.pinggy-free.link') ||
    normalized.endsWith('.pinggy.online')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface WorkspaceSnapshot extends Record<string, unknown> {
  items: unknown[]
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.items)
}

function workspaceIdOf(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.workspaceId !== 'string' || value.workspaceId.length === 0) return undefined
  return value.workspaceId
}

/**
 * Fold one `workspace/follow` frame into the snapshot `workspace.list` serves.
 *
 * The Host has no unary workspace read. The opening frame is a full baseline;
 * later frames are increments. Increments that arrive before a baseline are
 * ignored, because there is no projection to apply them to.
 */
export function applyWorkspaceFollowFrame(snapshot: unknown, frame: Record<string, unknown>): unknown {
  if (frame.type === 'baseline') return frame.value
  const current = isWorkspaceSnapshot(snapshot) ? snapshot : undefined
  if (current === undefined) return snapshot
  if (frame.type === 'upsert') {
    const workspaceId = workspaceIdOf(frame.workspace)
    if (workspaceId === undefined || !isRecord(frame.workspace)) return snapshot
    const items = current.items.slice()
    const index = items.findIndex((item) => workspaceIdOf(item) === workspaceId)
    if (index >= 0) items[index] = frame.workspace
    else items.push(frame.workspace)
    return { ...current, items }
  }
  if (frame.type === 'remove') {
    const workspaceId = typeof frame.workspaceId === 'string' ? frame.workspaceId : undefined
    if (workspaceId === undefined || workspaceId.length === 0) return snapshot
    return {
      ...current,
      items: current.items.filter((item) => workspaceIdOf(item) !== workspaceId)
    }
  }
  if (frame.type === 'order' && Array.isArray(frame.workspaceIds)) {
    const rank = new Map<string, number>()
    for (const [index, id] of frame.workspaceIds.entries()) {
      if (typeof id === 'string' && id.length > 0) rank.set(id, index)
    }
    const items = current.items.slice().sort((left, right) => {
      const leftRank = rank.get(workspaceIdOf(left) ?? '')
      const rightRank = rank.get(workspaceIdOf(right) ?? '')
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER)
    })
    return { ...current, items }
  }
  if (frame.type === 'archived' && Array.isArray(frame.archivedSessionIds)) {
    return { ...current, archivedSessionIds: frame.archivedSessionIds.slice() }
  }
  return snapshot
}

function requiredStringField(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== 'string' || !value[field]) {
    throw new Error(`Invalid ${field}.`)
  }
  return value[field]
}

/** Earliest durable sequence visible on one page; `null` for an empty page. */
function oldestEventSeq(records: unknown[]): number | null {
  let oldest: number | undefined
  for (const record of records) {
    const event = isRecord(record) && isRecord(record.event) ? record.event : undefined
    if (!event || typeof event.seq !== 'number') continue
    oldest = oldest === undefined ? event.seq : Math.min(oldest, event.seq)
  }
  return oldest ?? null
}

function parsePendingQuestion(
  rpcId: string,
  payload: Record<string, unknown>
): PendingMobileQuestion | undefined {
  if (typeof payload.sessionId !== 'string' || !Array.isArray(payload.questions)) return undefined
  const questions: MobileQuestion[] = []
  for (const item of payload.questions.slice(0, 20)) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.question !== 'string') continue
    const question: MobileQuestion = { id: item.id, question: item.question }
    if (typeof item.detail === 'string') question.detail = item.detail
    if (typeof item.header === 'string') question.header = item.header
    if (typeof item.multiSelect === 'boolean') question.multiSelect = item.multiSelect
    if (typeof item.intent === 'string') question.intent = item.intent
    if (Array.isArray(item.options)) {
      question.options = item.options.slice(0, 50).flatMap((option) => {
        if (!isRecord(option) || typeof option.label !== 'string') return []
        return [{
          label: option.label,
          ...(typeof option.description === 'string' ? { description: option.description } : {})
        }]
      })
    }
    questions.push(question)
  }
  if (!questions.length) return undefined
  return { rpcId, sessionId: payload.sessionId, questions }
}

function parsePendingApproval(
  eventId: string,
  sessionId: string,
  request: Record<string, unknown>
): PendingMobileApproval | undefined {
  if (typeof request.toolName !== 'string' || !request.toolName) return undefined
  return {
    eventId,
    sessionId,
    toolName: request.toolName,
    ...(typeof request.callId === 'string' && request.callId ? { callId: request.callId } : {}),
    ...(typeof request.reason === 'string' && request.reason ? { reason: request.reason } : {}),
    ...(typeof request.displayReason === 'string' && request.displayReason
      ? { displayReason: request.displayReason }
      : {})
  }
}

function parseQuestionResponse(value: unknown): {
  rpcId: string
  sessionId: string
  answers: MobileQuestionAnswer[]
} {
  const rpcId = requiredStringField(value, 'rpcId')
  const sessionId = requiredStringField(value, 'sessionId')
  if (!isRecord(value) || !Array.isArray(value.answers) || value.answers.length > 20) {
    throw new Error('Invalid question answers.')
  }
  const answers = value.answers.map((item): MobileQuestionAnswer => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Array.isArray(item.selected)) {
      throw new Error('Invalid question answer.')
    }
    const selected = item.selected.map((label) => {
      if (typeof label !== 'string') throw new Error('Invalid selected option.')
      return label
    })
    if (selected.length > 50) throw new Error('Too many selected options.')
    return {
      id: item.id,
      selected,
      ...(typeof item.custom === 'string' && item.custom.trim() ? { custom: item.custom } : {})
    }
  })
  return { rpcId, sessionId, answers }
}

function validateQuestionAnswers(
  pending: PendingMobileQuestion,
  answers: MobileQuestionAnswer[]
): void {
  if (answers.length !== pending.questions.length) throw new Error('Every question needs an answer or skip.')
  const answerById = new Map(answers.map((answer) => [answer.id, answer]))
  if (answerById.size !== answers.length) throw new Error('Duplicate question answer.')
  for (const question of pending.questions) {
    const answer = answerById.get(question.id)
    if (!answer) throw new Error('Every question needs an answer or skip.')
    const allowed = new Set((question.options ?? []).map((option) => option.label))
    if (answer.selected.some((label) => !allowed.has(label))) {
      throw new Error('Answer contains an unknown option.')
    }
    if (!question.multiSelect && answer.selected.length > 1) {
      throw new Error('Only one option can be selected.')
    }
  }
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timeout = setTimeout(done, milliseconds)
    function done(): void {
      clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}
