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
  }
}

const LAN_PAIRING_URL = 'http://192.168.1.105:43128/pair?token=pairing-token'
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'

function statePayload(overrides: Record<string, unknown> = {}) {
  return {
    ...idleState(),
    ready: true,
    qrSvg: QR_SVG,
    pairingUrl: LAN_PAIRING_URL,
    lanUrls: [LAN_PAIRING_URL],
    desktopUrl: 'http://127.0.0.1:43128/desktop?k=bootstrap-token',
    ...overrides,
  }
}

function cardsOf(panel: FakeElement) {
  return elements(panel).filter((element) => typeof element.props['data-card'] === 'string')
}

function buttonByAction(panel: FakeElement, action: string): FakeElement | undefined {
  return elements(panel).find((element) => element.type === 'button' && element.props['data-action'] === action)
}

function tipOf(panel: FakeElement, contains: string): string | undefined {
  return elements(panel)
    .filter((element) => String(element.props.className ?? '').includes('dshp_help'))
    .map((element) => String(element.props['data-tip'] ?? ''))
    .find((tip) => tip.includes(contains))
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

  it('lists paired devices with their online state, source IP and region', () => {
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
    expect(text).toContain('已连接设备')
    expect(text).toContain('Xiaomi 15（android）')
    expect(text).toContain('223.5.5.5 · 中国 浙江省 杭州市')
    expect(text).toContain('经隧道转发，看不到手机 IP')
    expect(text).toContain('1 在线 / 2 台')
    const dots = elements(panel).filter((element) => String(element.props.className ?? '').includes('dshp_deviceDot'))
    expect(dots.map((element) => element.props.className)).toEqual([
      'dshp_deviceDot dshp_deviceDotOnline',
      'dshp_deviceDot',
    ])
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
  })

  it('renders the six cards and the header pill for the ready state', () => {
    const panel = render(statePayload())
    expect(tipOf(panel, '局域网直连：同一 Wi-Fi')).toBeTruthy()
    expect(tipOf(panel, '公网入口：任意网络')).toBeTruthy()
    expect(cardsOf(panel).map((element) => element.props['data-card'])).toEqual([
      'header',
      'public',
      'qr',
      'devices',
      'security',
      'diagnostics',
    ])
    const pill = elements(panel).find((element) => String(element.props.className ?? '').includes('dshp_pill'))
    expect(pill).toBeTruthy()
    expect(textOf(pill)).toContain('等待连接')
    expect(String(pill!.props.className)).not.toContain('dshp_success')

    const connected = render(statePayload({ connected: true }))
    expect(textOf(connected)).toContain('手机已连接')
    const connectedPill = elements(connected).find((element) => String(element.props.className ?? '').includes('dshp_pill'))
    expect(String(connectedPill!.props.className)).toContain('dshp_success')
    const connectedText = elements(connected).find((element) => element.props.className === 'dshp_connectedText')
    expect(textOf(connectedText)).toContain('手机已连接，可继续使用')
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

  it('keeps one QR and lists the LAN direct addresses beside it', () => {
    const panel = render(
      statePayload({
        pairingPin: '051109',
        pinConsent: true,
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
      }),
    )
    const qrCard = cardsOf(panel).find((element) => element.props['data-card'] === 'qr')
    const text = textOf(qrCard)
    expect(text).toContain('https://dsh.example.com')
    expect(text).toContain('051109')
    expect(text).toContain('同一 Wi-Fi 更快：局域网直连地址')
    expect(text).toContain(LAN_PAIRING_URL)
    expect(elements(qrCard).some((element) => element.props['data-view'] !== undefined)).toBe(false)
    const qr = elements(qrCard).find((element) => element.props.className === 'dshp_qr')
    expect((qr!.props.dangerouslySetInnerHTML as { __html: string }).__html).toBe(QR_SVG)
  })

  it('lists alternate LAN URLs only when more than one exists', () => {
    const primary = 'http://192.168.1.105:43128/pair?token=pairing-token'
    const alternate = 'http://192.168.30.1:43128/pair?token=pairing-token'
    const note = '其余为同网段的其他地址，打不开时可换一个。'

    const single = render(statePayload({ lanUrls: [primary] }))
    expect(tipOf(single, note)).toBeUndefined()

    const multiple = render(statePayload({ lanUrls: [primary, alternate] }))
    expect(tipOf(multiple, note)).toBeTruthy()
    expect(textOf(multiple)).toContain(alternate)
  })

  it('offers the tunnel, fallback, disconnect and tunnel error surfaces', () => {
    const idle = render(statePayload())
    expect(textOf(idle)).toContain('开启临时隧道')
    const idleButtons = elements(idle).filter((element) => element.type === 'button')
    expect(idleButtons.every((element) => typeof element.props.onClick === 'function')).toBe(true)
    expect(
      idleButtons.some((element) => String(element.props['data-action'] ?? '').startsWith('disconnect')),
    ).toBe(false)

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
    expect(tunnelText).toContain('关闭公网连接')
    expect(tunnelText).toContain('扫码无法打开？切换备用线路')
    expect(tunnelText).toContain('隧道建立失败：cloudflared exited early')
    expect(tunnelText).toContain('https://stub-mobile.trycloudflare.com')
    expect(tipOf(tunneled, '长期有效')).toBeTruthy()

    const connectedPanel = render(statePayload({ connected: true }))
    expect(textOf(connectedPanel)).toContain('断开手机')
    expect(textOf(connectedPanel)).toContain('手机已连接')
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

  it('edits the pairing password through the pin route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, error: null, ...statePayload({ pairingPin: '051109', pinConsent: true }) }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    let panel = render(statePayload({ pairingPin: '411475', pinConsent: true }))
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

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/phone-bridge/pin')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ pin: '051109' })
    const savedPanel = rerender()
    expect(textOf(savedPanel)).toContain('当前固定为 051109')
    const notice = elements(savedPanel).find((element) => element.props.className === 'dshp_notice')
    expect(notice).toBeTruthy()
    expect(textOf(notice)).toContain('连接密码已保存，立即生效。')
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
    const passedState = elements(passed).find((element) => String(element.props.className ?? '').includes('dshp_checkState'))
    expect(String(passedState!.props.className)).toContain('dshp_success')
    expect(textOf(passedState)).toBe('可访问')

    const failed = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        mode: 'fixed',
        lastPublicUrlCheck: { at: Date.now(), reachable: false, status: null, error: 'connect ECONNREFUSED' },
      }),
    )
    const failedState = elements(failed).find((element) => String(element.props.className ?? '').includes('dshp_checkState'))
    expect(String(failedState!.props.className)).toContain('dshp_danger')
    expect(textOf(failedState)).toBe('无法访问')
  })

  it('renders tunnel errors and the port mismatch warning', () => {
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
    expect(text).toContain('固定域名隧道按 43128 端口转发，当前桥接端口为 50000')
    expect(text).toContain('50000')
    expect(tipOf(panel, '本机监听端口')).toBeTruthy()
    expect(text).toContain('打开桌面配对页（仅本机）')
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
