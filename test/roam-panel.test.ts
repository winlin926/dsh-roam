import { afterEach, describe, expect, it, vi } from 'vitest'

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
    lanQrSvg: null,
    pairingUrl: null,
    lanUrls: [],
    connected: false,
    browserConnected: false,
    tunnelActive: false,
    tunnelLoading: false,
    tunnelProvider: null,
    tunnelUrl: null,
    tunnelError: null,
    pairingPin: null,
    pinConsent: false,
    pinExpiresAt: null,
    expiresAt: null,
    certificate: null,
    version: null,
    now: null,
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
    lanQrSvg: QR_SVG,
    pairingUrl: LAN_PAIRING_URL,
    lanUrls: [LAN_PAIRING_URL],
    version: '1.0.0',
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

function modeButton(panel: FakeElement, mode: string): FakeElement | undefined {
  return elements(panel).find((element) => element.type === 'button' && element.props['data-mode'] === mode)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser-only phone panel', () => {
  it('announces the startup state until the bridge is listening', () => {
    const panel = render()
    expect(textOf(panel)).toContain('启动中')
    expect(textOf(panel)).toContain('正在等待手机桥接服务就绪')
    expect(elements(panel).some((element) => element.type === 'iframe')).toBe(false)
  })

  it('renders one connection card, public settings, help and diagnostics', () => {
    const panel = render(statePayload())
    expect(cardsOf(panel).map((element) => element.props['data-card'])).toEqual([
      'connect',
      'public',
      'help',
      'diagnostics',
    ])
    const text = textOf(panel)
    expect(text).not.toContain('AI-HUB')
    expect(text).not.toContain('App 在线')
    expect(text).not.toContain('设备台账')
  })

  it('draws the LAN QR inside the page and offers both connection modes', () => {
    const panel = render(
      statePayload({
        qrSvg: '<svg id="public-qr"></svg>',
        lanQrSvg: '<svg id="lan-qr"></svg>',
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
      }),
    )
    const qr = elements(panel).find((element) => String(element.props.className || '').startsWith('dshp_qr'))
    expect(qr).toBeTruthy()
    expect((qr!.props.dangerouslySetInnerHTML as { __html: string }).__html).toContain('lan-qr')
    expect(modeButton(panel, 'lan')?.props['aria-pressed']).toBe('true')
    expect(modeButton(panel, 'anywhere')?.props['aria-pressed']).toBe('false')
    expect(textOf(panel)).toContain('配置固定域名后，所有配对都需要连接密码')
    expect(textOf(panel)).toContain('复制链接')
  })

  it('shows the connection password and public address in anywhere mode', () => {
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        pairingUrl: 'https://dsh.example.com/pair?token=public-token',
        pairingPin: '246810',
        pinConsent: true,
      }),
    )
    ;(modeButton(panel, 'anywhere')!.props.onClick as () => void)()
    const text = textOf(rerender())
    expect(text).toContain('246810')
    expect(text).toContain('dsh.example.com')
    expect(text).toContain('配置固定域名后，同一 Wi-Fi 与任意网络配对都需要这个密码')
  })

  it('keeps the connectivity test disabled until a fixed domain is saved', () => {
    const empty = render(statePayload())
    expect(buttonByAction(empty, 'test')?.props.disabled).toBe(true)

    const fixed = render(
      statePayload({ publicUrl: 'https://dsh.example.com', publicUrlConfigured: true }),
    )
    expect(buttonByAction(fixed, 'test')?.props.disabled).toBe(false)
  })

  it('shows the certificate row with an issue action for a fixed domain', () => {
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        certificate: { selfSigned: true, expiresAt: null, pending: false },
      }),
    )
    const text = textOf(panel)
    expect(text).toContain('frpc 自签证书')
    expect(buttonByAction(panel, 'issue-certificate')).toBeTruthy()
  })

  it('hides certificate errors when no fixed domain is configured', () => {
    const panel = render(statePayload({ certificate: { error: '上次签发失败', selfSigned: false } }))
    expect(textOf(panel)).not.toContain('上次签发失败')
  })

  it('offers tunnel controls and surfaces a tunnel error', () => {
    const panel = render(
      statePayload({
        tunnelActive: true,
        tunnelProvider: 'cloudflare',
        tunnelUrl: 'https://stub-mobile.trycloudflare.com',
        tunnelError: 'cloudflared exited early',
      }),
    )
    const text = textOf(panel)
    expect(text).toContain('关闭临时隧道')
    expect(text).toContain('扫码打不开？换线路')
    expect(text).toContain('隧道错误：cloudflared exited early')
    expect(text).toContain('https://stub-mobile.trycloudflare.com')
  })

  it('copies the pairing link and confirms it', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const panel = render(statePayload())
    const copy = elements(panel).find(
      (element) => element.type === 'button' && element.props['data-copy'] === 'link',
    )
    expect(copy).toBeTruthy()
    await (copy!.props.onClick as () => Promise<void>)()
    expect(writeText).toHaveBeenCalledWith(LAN_PAIRING_URL)
    expect(textOf(rerender())).toContain('已复制')
  })

  it('saves a changed public domain through the settings route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => statePayload({ publicUrl: 'https://new.example.com', publicUrlConfigured: true }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const panel = render(statePayload())
    const input = elements(panel).find((element) => element.props['data-field'] === 'public-url')
    expect(input).toBeTruthy()
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: 'https://new.example.com' } })
    const updated = rerender()
    const save = buttonByAction(updated, 'save')!
    expect(save.props.disabled).toBe(false)
    await (save.props.onClick as () => Promise<void>)()
    expect(fetchMock).toHaveBeenCalledWith(
      '/phone-bridge/settings',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('opens the inline PIN editor and saves through the pin route', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        pairingPin: '135790',
        pinConsent: true,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        pairingPin: '246810',
        pinConsent: true,
      }),
    )
    ;(buttonByAction(panel, 'edit-pin')!.props.onClick as () => void)()
    const opened = rerender()
    const input = elements(opened).find((element) => element.props['data-field'] === 'pairing-pin')
    expect(input).toBeTruthy()
    ;(input!.props.onChange as (event: unknown) => void)({ target: { value: '135790' } })
    const save = buttonByAction(rerender(), 'save-pin')!
    await (save.props.onClick as () => Promise<void>)()
    expect(fetchMock).toHaveBeenCalledWith(
      '/phone-bridge/pin',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses the server clock for certificate expiry', () => {
    const now = Date.now()
    const panel = render(
      statePayload({
        publicUrl: 'https://dsh.example.com',
        publicUrlConfigured: true,
        now,
        certificate: { expiresAt: now - 1000, selfSigned: false, pending: false },
      }),
    )
    expect(textOf(panel)).toContain('已过期')
  })

  it('never renders an iframe or loads an external resource', () => {
    const panel = render(statePayload())
    const all = elements(panel)
    expect(all.some((element) => element.type === 'iframe')).toBe(false)
    expect(all.some((element) => element.type === 'script')).toBe(false)
  })
})
