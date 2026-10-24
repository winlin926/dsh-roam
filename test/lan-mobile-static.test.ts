import { afterEach, describe, expect, it } from 'vitest'
import { rawRequest, startPairedBridge, type PairedBridge } from './helpers/mobile-bridge.mjs'
import { LanMobileBridge } from '../lib/bridge/lan-mobile-bridge.js'

let paired: PairedBridge | undefined
const bridges: LanMobileBridge[] = []

afterEach(async () => {
  await paired?.stop()
  paired = undefined
  await Promise.all(bridges.splice(0).map(bridge => bridge.stop()))
})

async function authorized() {
  paired ??= await startPairedBridge()
  return paired
}

function get(pairedBridge: PairedBridge, path: string, options: {
  method?: string
  cookie?: string
  headers?: Record<string, string>
} = {}) {
  const headers = { ...options.headers }
  if (options.cookie !== '') headers.cookie = options.cookie ?? pairedBridge.cookie
  return rawRequest(pairedBridge.origin, { path, method: options.method, headers })
}

function cspDirectives(value: string | string[] | undefined) {
  return Object.fromEntries(String(value ?? '').split(';').map(part => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]))
}

describe('authenticated mobile static resources', () => {
  it('serves real HTML, CSS and JavaScript with the correct MIME type', async () => {
    const bridge = await authorized()
    for (const [path, type] of [
      ['/mobile/index.html', 'text/html; charset=utf-8'],
      ['/mobile/styles.css', 'text/css; charset=utf-8'],
      ['/mobile/state.js', 'text/javascript; charset=utf-8'],
    ] as const) {
      const response = await get(bridge, path)
      expect(response.status, path).toBe(200)
      expect(response.headers['content-type'], path).toBe(type)
      expect(response.body.length, path).toBeGreaterThan(0)
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['cache-control']).toBe('no-cache')
    }
  })

  it('answers HEAD with GET metadata but no response body', async () => {
    const bridge = await authorized()
    const getResponse = await get(bridge, '/mobile/transcript.js')
    const head = await get(bridge, '/mobile/transcript.js', { method: 'HEAD' })

    expect(head.status).toBe(200)
    expect(head.body).toHaveLength(0)
    expect(head.headers['content-type']).toBe(getResponse.headers['content-type'])
    expect(head.headers.etag).toBe(getResponse.headers.etag)
    expect(head.headers['content-length']).toBe(String(getResponse.body.length))
  })

  it('uses the actual response bytes for strong ETags and supports conditional revalidation', async () => {
    const bridge = await authorized()
    const first = await get(bridge, '/mobile/markdown.js')
    const etag = String(first.headers.etag)
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/)

    for (const condition of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
      const cached = await get(bridge, '/mobile/markdown.js', { headers: { 'if-none-match': condition } })
      expect(cached.status, condition).toBe(304)
      expect(cached.body, condition).toHaveLength(0)
      expect(cached.headers.etag, condition).toBe(etag)
    }

    const changed = await get(bridge, '/mobile/markdown.js', { headers: { 'if-none-match': '"stale"' } })
    expect(changed.status).toBe(200)
    expect(changed.body).toEqual(first.body)
  })

  it('supports HEAD revalidation without turning a 304 into a document', async () => {
    const bridge = await authorized()
    const first = await get(bridge, '/mobile/state.js', { method: 'HEAD' })
    const cached = await get(bridge, '/mobile/state.js', {
      method: 'HEAD', headers: { 'if-none-match': String(first.headers.etag) },
    })
    expect(cached.status).toBe(304)
    expect(cached.body).toHaveLength(0)
  })

  it('does not serve source, unknown extensions or directories outside the asset allowlist', async () => {
    const bridge = await authorized()
    for (const path of [
      '/mobile/package.json',
      '/mobile/../bridge/lan-mobile-bridge.js',
      '/mobile/%2e%2e/bridge/lan-mobile-bridge.js',
      '/mobile/..%2fbridge%2flan-mobile-bridge.js',
      '/mobile/%2e%2e%5cbridge%5clan-mobile-bridge.js',
      '/mobile//../mobile/state.js',
      '/mobile/state.js%00',
      '/mobile/',
      '/mobile',
    ]) {
      const response = await get(bridge, path)
      expect(response.status, path).toBe(404)
      expect(response.body.toString('utf8'), path).not.toContain('export class LanMobileBridge')
    }
  })

  it('rejects mutation methods with an explicit GET/HEAD allow header', async () => {
    const bridge = await authorized()
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await get(bridge, '/mobile/state.js', { method, headers: { 'content-length': '0' } })
      expect(response.status, method).toBe(405)
      expect(response.headers.allow, method).toBe('GET, HEAD')
      expect(response.body.toString('utf8'), method).toBe('Method not allowed.')
    }
  })

  it('requires a server-issued session before exposing static bytes or metadata', async () => {
    const bridge = await authorized()
    for (const method of ['GET', 'HEAD']) {
      const response = await get(bridge, '/mobile/state.js', { method, cookie: '' })
      expect(response.status, method).toBe(401)
      expect(response.body, method).toHaveLength(method === 'HEAD' ? 0 : 'Pair your phone again.'.length)
      expect(response.headers.etag, method).toBeUndefined()
    }

    const planted = await get(bridge, '/mobile/state.js', { cookie: `dsh_mobile=${'a'.repeat(43)}` })
    expect(planted.status).toBe(401)
  })
})

describe('mobile document content security policy', () => {
  it('loads the main application scripts only from its own origin', async () => {
    const bridge = await authorized()
    const response = await get(bridge, '/')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8')
    const csp = cspDirectives(response.headers['content-security-policy'])
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['script-src']).toEqual(["'self'"])
    expect(csp['connect-src']).toEqual(["'self'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(csp['script-src']).not.toContain('https:')
  })

  it('retains the inline-script exception required by the standalone PIN page', async () => {
    const state: { pin: string; pinConsent: boolean } = { pin: '246810', pinConsent: true }
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9',
      publicUrl: () => 'https://mobile.example.test',
      pairingPinStore: {
        load: () => ({ ...state }),
        save: value => { Object.assign(state, value); return true },
      },
      port: 0,
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const response = await rawRequest(`http://127.0.0.1:${snapshot.port}`, {
      path: `/pair?token=${encodeURIComponent(new URL(snapshot.pairingUrl!).searchParams.get('token')!)}`,
    })

    expect(response.status).toBe(200)
    expect(response.body.toString('utf8')).toContain('id="pin"')
    const csp = cspDirectives(response.headers['content-security-policy'])
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['script-src']).toContain("'unsafe-inline'")
    expect(csp['frame-ancestors']).toEqual(["'none'"])
  })
})
