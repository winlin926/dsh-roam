import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The settings section is a same-origin panel: it must never fall back to an
 * iframe (the bridge page has a different origin and its bootstrap cookie would
 * be dropped). These tests render it with a stubbed React and drive the same
 * handlers a click would.
 */
interface FakeElement {
  type: unknown
  props: Record<string, unknown>
  children: unknown[]
}

interface LoadedModule {
  factory(require: (id: string) => unknown): { apply(ctx: unknown): void }
}

let loaded: LoadedModule | undefined
;(globalThis as Record<string, unknown>).window = {
  __ModuleLoader__: { load: (module: LoadedModule) => (loaded = module) },
}
await import('../lib/client.js')

let hookValues: unknown[] = []
let hookIndex = 0
let pendingState: Record<string, unknown> | undefined

const reactStub = {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
    type,
    props: props ?? {},
    children: children.filter((child) => child !== null && child !== undefined),
  }),
  useEffect: () => undefined,
  useState: (initial: unknown) => {
    const index = hookIndex
    hookIndex += 1
    if (!(index in hookValues)) {
      hookValues[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    }
    if (index === 0 && pendingState !== undefined) {
      hookValues[0] = { ...idleState(), ...pendingState }
    }
    const setValue = (next: unknown) => {
      const current = hookValues[index]
      hookValues[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(current) : next
    }
    return [hookValues[index], setValue]
  },
}

let Section: (() => FakeElement) | undefined
loaded!
  .factory((id) => {
    if (id !== 'react') throw new Error('unexpected client dependency: ' + id)
    return reactStub
  })
  .apply({
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (_meta: unknown, component: () => FakeElement) => {
        Section = component
        return () => undefined
      },
    },
  })

function render(state?: Record<string, unknown>): FakeElement {
  hookValues = []
  hookIndex = 0
  pendingState = state
  const panel = Section!()
  pendingState = undefined
  return panel
}

function rerender(): FakeElement {
  hookIndex = 0
  return Section!()
}

function selectTab(panel: FakeElement, id: string): FakeElement {
  const tab = elements(panel).find((element) => element.props['data-tab'] === id)
  expect(tab, 'tab ' + id).toBeTruthy()
  ;(tab!.props.onClick as () => void)()
  return rerender()
}

function elements(node: unknown, found: FakeElement[] = []): FakeElement[] {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found)
    return found
  }
  const element = node as FakeElement
  found.push(element)
  for (const child of element.children ?? []) elements(child, found)
  return found
}

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (node === null || typeof node !== 'object') return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  return ((node as FakeElement).children ?? []).map(textOf).join('')
}

function idleState() {
  return {
    ready: false,
    qrSvg: null,
    pairingUrl: null,
    lanUrls: [],
    desktopUrl: null,
    connected: false,
    browserConnected: null,
    onlineDeviceCount: null,
    aihubQrSvg: null,
    aihubLanUrls: [],
    tunnelActive: false,
    tunnelLoading: false,
    tunnelProvider: null,
    tunnelUrl: null,
    tunnelError: null,
    pairingPin: null,
    pinConsent: false,
    pinExpiresAt: null,
    expiresAt: null,
    publicUrl: null,
    publicUrlConfigured: false,
    mode: 'lan',
    bridgePort: null,
    expectedPort: 43128,
    portMatchesTunnel: true,
    lastPublicUrlCheck: null,
    devices: [],
    certificate: null,
    version: null,
    now: null,
  }
}

const LAN_PAIRING_URL = 'http://192.168.1.105:43128/pair?token=pairing-token'
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
const AIHUB_PAIRING_URL = 'http://192.168.1.105:43128'

function statePayload(overrides: Record<string, unknown> = {}) {
  return {
    ...idleState(),
    ready: true,
    qrSvg: QR_SVG,
    pairingUrl: LAN_PAIRING_URL,
    lanUrls: [LAN_PAIRING_URL],
    desktopUrl: 'http://127.0.0.1:43128/desktop?k=bootstrap-token',
    version: '0.2.1',
    now: Date.now(),
    ...overrides,
  }
}

function cardsOf(panel: FakeElement) {
  return elements(panel).filter((element) => typeof element.props['data-card'] === 'string')
}

function buttonByAction(panel: FakeElement, action: string): FakeElement | undefined {
  return elements(panel).find((element) => element.type === 'button' && element.props['data-action'] === action)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('phone bridge settings panel', () => {
  it('announces the startup state until the bridge is listening', () => {
    const panel = render()
    expect(textOf(panel)).toContain('还在启动')
    expect(textOf(panel)).toContain('启动中')
    expect(elements(panel).some((element) => element.type === 'iframe')).toBe(false)
  })

  it('renders a compact status header and four panels instead of six cards', () => {
    const panel = render(statePayload())
    expect(cardsOf(panel).map((element) => element.props['data-card'])).toEqual([
      'header',
      'connect',
      'public',
      'devices',
      'diagnostics',
    ])
    const pill = elements(panel).find((element) => String(element.props.className).includes('dshp_pill'))
    expect(textOf(pill)).toContain('等待连接')
    expect(String(pill!.props.className)).not.toContain('dshp_pillConnected')
    const connect = cardsOf(panel).find((element) => element.props['data-card'] === 'connect')!
    expect(elements(connect).filter((element) => element.props['data-tab']).map((element) => element.props['data-tab'])).toEqual([
      'browser',
      'aihub',
    ])
  })

  it('lists AI-HUB devices with online state, source IP and region', () => {
    const panel = render(
      statePayload({
        devices: [
          {
            deviceId: 'device-1',
            name: 'Xiaomi 15',
            platform: 'android',
            lastIp: '223.5.5.5',
            region: '中国 浙江省 杭州市',
            firstSeenAt: 1,
            lastSeenAt: Date.now(),
            online: true,
          },
          {
            deviceId: 'device-2',
            name: 'iPhone 16',
            platform: 'ios',
            firstSeenAt: 2,
            lastSeenAt: Date.now(),
            online: false,
          },
        ],
      }),
    )
    const text = textOf(panel)
    expect(text).toContain('AI-HUB 设备')
    expect(text).toContain('Xiaomi 15（android）')
    expect(text).toContain('223.5.5.5 · 中国 浙江省 杭州市')
    expect(text).toContain('未记录公网 IP（局域网直连或经隧道转发）')
    expect(text).toContain('App 在线 1 / 共 2 台')
    const dots = elements(panel).filter((element) => String(element.props.className).includes('dshp_deviceDot'))
    expect(dots.map((element) => element.props.className)).toEqual([
      'dshp_deviceDot dshp_deviceDotOnline',
      'dshp_deviceDot',
    ])
  })

  it('keeps version and refresh clock in diagnostics', () => {
    const now = Date.now()
    const panel = render(statePayload({ version: '0.2.1', now }))
    expect(textOf(panel)).toContain('面板 v0.2.1')
    expect(textOf(panel)).toContain('面板数据')
    const stale = render(statePayload({ version: null, now: null }))
    expect(textOf(stale)).toContain('页面可能是旧缓存')
  })

  it('shows when the temporary PIN and the QR code expire', () => {
    const now = Date.now()
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
        pairingPin: '246810',
        pinConsent: false,
        pinExpiresAt: now + 4 * 60_000,
        expiresAt: now + 5 * 60_000,
        now,
      }),
    )
    const text = textOf(panel)
    expect(text).toContain('临时密码，约 4 分钟后失效')
    expect(text).toContain('二维码约 5 分钟后失效')
  })

  it('keeps the connectivity test disabled until a fixed public domain is saved', () => {
    const lan = render(statePayload())
    const lanTest = buttonByAction(lan, 'test')
    expect(lanTest).toBeTruthy()
    expect(lanTest!.props.disabled).toBe(true)
    expect(String(lanTest!.props.title)).toContain('先保存固定公网域名')

    const fixed = render(
      statePayload({ publicUrl: 'https://dsh.example.com', publicUrlConfigured: true, mode: 'fixed' }),
    )
    expect(buttonByAction(fixed, 'test')!.props.disabled).toBe(false)

    let dirty = render(
      statePayload({ publicUrl: 'https://dsh.example.com', publicUrlConfigured: true, mode: 'fixed' }),
    )
    const input = elements(dirty).find(
      (element) => element.type === 'input' && element.props['data-field'] === 'public-url',
    )
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: 'https://new.example.com' } })
    dirty = rerender()
    const dirtyTest = buttonByAction(dirty, 'test')
    expect(dirtyTest!.props.disabled).toBe(true)
    expect(String(dirtyTest!.props.title)).toContain('先保存域名')
  })

  it('shows the certificate row with an issue button once the public URL is fixed', () => {
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        certificate: { domain: 'dsh.example.com', selfSigned: true, pending: false },
      }),
    )
    expect(textOf(panel)).toContain('只有 frpc 自签证书')
    const issue = elements(panel).find((element) => element.props['data-action'] === 'issue-certificate')
    expect(issue).toBeTruthy()
    expect(textOf(issue)).toContain('申请证书')

    const pending = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        certificate: { domain: 'dsh.example.com', selfSigned: false, pending: true },
      }),
    )
    const pendingIssue = elements(pending).find(
      (element) => element.props['data-action'] === 'issue-certificate',
    )
    expect(pendingIssue!.props.disabled).toBe(true)
    expect(textOf(pendingIssue)).toContain('正在申请…')
  })

  it('hides a stale certificate error when no fixed public domain is configured', () => {
    const panel = render(
      statePayload({
        publicUrl: null,
        publicUrlConfigured: false,
        certificate: { error: '上次签发失败', selfSigned: false, pending: false },
      }),
    )
    expect(textOf(panel)).not.toContain('上次签发失败')
  })

  it('hides certificate errors that belong to another domain', () => {
    const panel = render(
      statePayload({
        publicUrl: 'https://b.example.com',
        publicUrlConfigured: true,
        certificate: {
          domain: 'a.example.com',
          error: 'rate limited for a.example.com',
          selfSigned: false,
          pending: false,
        },
      }),
    )
    expect(textOf(panel)).not.toContain('rate limited for a.example.com')
  })

  it('shows the AI-HUB LAN address and pairing QR behind the client tab', () => {
    const panel = render(
      statePayload({
        pinConsent: true,
        pairingPin: '051109',
        aihubQrSvg: QR_SVG,
        aihubLanUrls: [AIHUB_PAIRING_URL],
      }),
    )
    const aihub = selectTab(panel, 'aihub')
    const text = textOf(aihub)
    expect(text).toContain('AI-HUB 配对')
    expect(text).toContain(AIHUB_PAIRING_URL)
    const qr = elements(aihub).find((element) => element.props.className === 'dshp_qr')
    expect(qr).toBeTruthy()
    expect((qr!.props.dangerouslySetInnerHTML as { __html: string }).__html).toBe(QR_SVG)
  })

  it('asks for a fixed PIN before generating the AI-HUB QR', () => {
    const panel = render(statePayload({ pinConsent: false, aihubLanUrls: [AIHUB_PAIRING_URL] }))
    const aihub = selectTab(panel, 'aihub')
    expect(textOf(aihub)).toContain('需要固定密码')
    expect(textOf(aihub)).toContain('AI-HUB 配对只接受固定密码')
    expect(elements(aihub).some((element) => element.props.className === 'dshp_qr')).toBe(false)
  })

  it('separates browser connection from App event-stream presence', () => {
    const appOnly = render(
      statePayload({
        connected: false,
        browserConnected: false,
        onlineDeviceCount: 1,
        devices: [{ deviceId: 'app-1', name: 'AI-HUB', online: true }],
      }),
    )
    expect(textOf(appOnly)).toContain('App 在线 1')
    expect(textOf(appOnly)).not.toContain('等待连接')
    expect(buttonByAction(appOnly, 'disconnect-qr')).toBeUndefined()

    const browser = render(statePayload({ connected: true, browserConnected: true }))
    expect(textOf(browser)).toContain('浏览器已连接')
    expect(buttonByAction(browser, 'disconnect-qr')).toBeTruthy()

    const both = render(
      statePayload({
        connected: true,
        browserConnected: true,
        onlineDeviceCount: 1,
        devices: [{ deviceId: 'app-1', name: 'AI-HUB', online: true }],
      }),
    )
    expect(textOf(both)).toContain('浏览器已连接 · App 在线 1')
    expect(textOf(both)).toContain('App 仍在后台连接，永久断开请移除设备。')
  })

  it('uses the server clock for certificate expiry', () => {
    const now = 1000
    const panel = render(
      statePayload({
        now,
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
        certificate: { expiresAt: now + 60_000, selfSigned: false, pending: false },
      }),
    )
    expect(textOf(panel)).not.toContain('证书已过期')
    expect(textOf(panel)).toContain('证书有效至')
  })

  it('draws the QR in page and never renders an iframe', () => {
    const state = statePayload({
      pairingPin: '246810',
      publicUrl: 'https://dsh.example.com',
      publicUrlConfigured: true,
      mode: 'fixed',
    })
    const panel = render(state)
    const nodes = elements(panel)
    const text = textOf(panel)

    expect(nodes.some((element) => element.type === 'iframe')).toBe(false)
    const qr = nodes.find((element) => element.props.className === 'dshp_qr')
    expect(qr).toBeTruthy()
    expect((qr!.props.dangerouslySetInnerHTML as { __html: string }).__html).toBe(state.qrSvg)
    expect(text).toContain('https://dsh.example.com')
    expect(text).toContain('固定公网地址')
    expect(text).toContain('246810')
    const link = nodes.find((element) => element.type === 'a')
    expect(link!.props.href).toBe(state.desktopUrl)
    expect(link!.props.target).toBe('_blank')
  })

  it('switches to the LAN fast path beside the public QR', () => {
    const panel = render(
      statePayload({
        pairingPin: '051109',
        pinConsent: true,
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
      }),
    )
    const connect = cardsOf(panel).find((element) => element.props['data-card'] === 'connect')!
    const text = textOf(connect)
    expect(text).toContain('同一 Wi-Fi 更快')
    expect(text).toContain(LAN_PAIRING_URL)
    expect(elements(connect).some((element) => element.props['data-view'] !== undefined)).toBe(false)
    const qr = elements(connect).find((element) => element.props.className === 'dshp_qr')
    expect((qr!.props.dangerouslySetInnerHTML as { __html: string }).__html).toBe(QR_SVG)
  })

  it('lists alternate LAN URLs only when more than one exists', () => {
    const primary = 'http://192.168.1.105:43128/pair?token=pairing-token'
    const alternate = 'http://192.168.30.1:43128/pair?token=pairing-token'

    const single = render(statePayload({ lanUrls: [primary] }))
    expect(textOf(single)).not.toContain('其他局域网地址')

    const multiple = render(statePayload({ lanUrls: [primary, alternate] }))
    expect(textOf(multiple)).toContain('其他局域网地址 1')
    expect(textOf(multiple)).toContain(alternate)
  })

  it('offers the tunnel, fallback, disconnect and tunnel error surfaces', () => {
    const idle = render(statePayload())
    expect(textOf(idle)).toContain('开启临时隧道')
    const idleButtons = elements(idle).filter((element) => element.type === 'button')
    expect(idleButtons.every((element) => typeof element.props.onClick === 'function')).toBe(true)
    expect(buttonByAction(idle, 'disconnect-qr')).toBeUndefined()

    const tunneled = render(
      statePayload({
        tunnelActive: true,
        tunnelProvider: 'cloudflare',
        tunnelUrl: 'https://stub-mobile.trycloudflare.com',
        tunnelError: 'cloudflared exited early',
        pairingPin: '135790',
        pinConsent: true,
      }),
    )
    const tunnelText = textOf(tunneled)
    expect(tunnelText).toContain('关闭临时隧道')
    expect(tunnelText).toContain('扫码打不开？切备用线路')
    expect(tunnelText).toContain('隧道建立失败：cloudflared exited early')
    expect(tunnelText).toContain('https://stub-mobile.trycloudflare.com')

    const connected = render(statePayload({ connected: true, browserConnected: true }))
    expect(buttonByAction(connected, 'disconnect-qr')).toBeTruthy()
    expect(buttonByAction(connected, 'tunnel-enable')!.props.disabled).toBe(true)
  })

  it('copies the access address through the clipboard API and confirms it', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const state = statePayload()
    const panel = render(state)
    const copy = elements(panel).find((element) => element.type === 'button' && element.props['data-copy'] === 'address')
    expect(copy).toBeTruthy()

    await (copy!.props.onClick as () => Promise<void>)()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(state.pairingUrl)
    expect(textOf(rerender())).toContain('已复制')
  })

  it('saves the public URL through the settings route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        error: null,
        ...statePayload({ publicUrl: 'https://dsh.example.com', publicUrlConfigured: true, mode: 'fixed' }),
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    let panel = render(statePayload())
    const input = elements(panel).find((element) => element.type === 'input' && element.props['data-field'] === 'public-url')
    expect(input).toBeTruthy()
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: 'https://dsh.example.com' } })
    panel = rerender()

    const save = buttonByAction(panel, 'save')
    expect(save).toBeTruthy()
    await (save!.props.onClick as () => Promise<unknown>)()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/phone-bridge/settings')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ publicUrl: 'https://dsh.example.com' })
  })

  it('opens the inline PIN editor and saves through the pin route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, error: null, ...statePayload({ pairingPin: '051109', pinConsent: true }) }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    let panel = render(statePayload({ pairingPin: '411475', pinConsent: true, publicUrl: 'https://dsh.example.com', publicUrlConfigured: true }))
    const edit = buttonByAction(panel, 'edit-pin')
    expect(edit).toBeTruthy()
    ;(edit!.props.onClick as () => void)()
    panel = rerender()

    const input = elements(panel).find(
      (element) => element.type === 'input' && element.props['data-field'] === 'pairing-pin',
    )
    expect(input).toBeTruthy()
    expect(input!.props.value).toBe('411475')
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: '051109' } })
    panel = rerender()

    const save = buttonByAction(panel, 'save-pin')
    expect(save).toBeTruthy()
    await (save!.props.onClick as () => Promise<unknown>)()
    panel = rerender()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/phone-bridge/pin')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ pin: '051109' })
    expect(textOf(panel)).toContain('连接密码已保存，立即生效。')
    expect(input!.props['aria-label']).toBe('固定连接密码')
  })

  it('keeps the typed connection password after a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))

    let panel = render(statePayload({ pairingPin: '411475', pinConsent: true, publicUrl: 'https://dsh.example.com', publicUrlConfigured: true }))
    ;(buttonByAction(panel, 'edit-pin')!.props.onClick as () => void)()
    panel = rerender()
    const input = elements(panel).find(
      (element) => element.type === 'input' && element.props['data-field'] === 'pairing-pin',
    )
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: '051109' } })
    panel = rerender()

    await (buttonByAction(panel, 'save-pin')!.props.onClick as () => Promise<unknown>)()
    panel = rerender()
    const after = elements(panel).find(
      (element) => element.type === 'input' && element.props['data-field'] === 'pairing-pin',
    )
    expect(after!.props.value).toBe('051109')
    const error = elements(panel).find(
      (element) => element.props.className === 'dshp_error' && element.props.role === 'alert',
    )
    expect(textOf(error)).toContain('无法连接到 DSH 主进程')
  })

  it('marks a passing domain probe green and a failing one red', () => {
    const passed = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
        lastPublicUrlCheck: { at: Date.now(), reachable: true, status: 200, error: null },
      }),
    )
    const passedState = elements(passed).find((element) => String(element.props.className).includes('dshp_successText'))
    expect(textOf(passedState)).toBe('可访问 · HTTP 200')

    const failed = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
        lastPublicUrlCheck: { at: Date.now(), reachable: false, status: null, error: 'connect ECONNREFUSED' },
      }),
    )
    const failedState = elements(failed).find((element) => String(element.props.className).includes('dshp_dangerText'))
    expect(textOf(failedState)).toBe('无法访问')
  })

  it('renders tunnel errors and the port mismatch warning in the public panel', () => {
    const panel = render(
      statePayload({
        tunnelActive: true,
        tunnelProvider: 'cloudflare',
        tunnelUrl: 'https://stub-mobile.trycloudflare.com',
        tunnelError: 'cloudflared exited early',
        bridgePort: 50000,
        portMatchesTunnel: false,
      }),
    )
    const text = textOf(panel)
    expect(text).toContain('隧道建立失败：cloudflared exited early')
    expect(text).toContain('固定域名隧道按 43128 端口转发，当前桥接端口为 50000。')
    expect(text).toContain('50000')
    expect(text).toContain('桌面配对页')
    expect(text).toContain('在本机打开')
  })

  it('never renders an iframe or loads an external resource', () => {
    const states = [
      undefined,
      statePayload(),
      statePayload({ connected: true }),
      statePayload({ tunnelError: 'cloudflared exited early', bridgePort: 50000, portMatchesTunnel: false }),
    ]
    for (const state of states) {
      const nodes = elements(render(state))
      expect(nodes.some((element) => element.type === 'iframe')).toBe(false)
      for (const element of nodes) {
        expect(element.props.src).toBeUndefined()
        if (element.type === 'a') expect(element.props.href).toBe(statePayload().desktopUrl)
      }
    }
  })
})
