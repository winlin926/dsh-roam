import { describe, expect, it } from 'vitest'
import { renderMobileReconnectPage, renderPairingPinPage } from '../lib/bridge/lan-mobile-pages.js'

function inlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('inline script missing')
  return match[1]!
}

describe('mobile reconnect document', () => {
  it('offers a same-origin reconnect action without external resources', () => {
    const html = renderMobileReconnectPage('zh', 'lan')

    expect(html).toContain('lang="zh-CN"')
    expect(html).toContain('<span>DSH Mobile</span>')
    expect(html).toContain('href="/reconnect"')
    expect(html).toContain('src="/brand-logo/light"')
    expect(html).toContain('src="/brand-logo/dark"')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).not.toContain('AI-HUB')
    expect(html).not.toContain('/app-icon')
  })

  it('does not offer a dead resume action when no phone session can be restored', () => {
    const html = renderMobileReconnectPage('en', 'lan', { resumeUnavailable: true })

    expect(html).toContain('This phone has no saved connection')
    expect(html).not.toContain('href="/reconnect"')
  })

  it('directs an expired public connection back to pairing instead of claiming it can resume', () => {
    const html = renderMobileReconnectPage('en', 'tunnel', { expired: true })

    expect(html).toContain('This remote address is no longer valid')
    expect(html).toContain('href="/reconnect"')
  })
})

describe('standalone pairing password document', () => {
  it('provides an accessible numeric PIN form and live status', () => {
    const html = renderPairingPinPage('zh')

    expect(html).toContain('<h1>')
    expect(html).toContain('id="pin"')
    expect(html).toContain('autocomplete="one-time-code"')
    expect(html).toContain('inputmode="numeric"')
    expect(html).toContain('maxlength="6"')
    expect(html).toContain('role="status"')
    expect(html).toContain('6 位')
    expect(html).toContain('id="submit"')
  })

  it('keeps the submit logic parseable in both locales and posts only to same-origin endpoints', () => {
    for (const locale of ['zh', 'en'] as const) {
      const html = renderPairingPinPage(locale)
      expect(() => new Function(inlineScript(html)), locale).not.toThrow()
      expect(html).toContain("fetch('/pair/verify'")
      expect(html).toContain("fetch('/pair/retry'")
      expect(html).not.toContain('https://')
    }
  })

  it('escapes the optional LAN recovery URL as an HTML attribute', () => {
    const html = renderPairingPinPage('en', 'http://192.168.1.2:43128/pair?token=a"><script>bad()</script>')

    expect(html).not.toContain('<script>bad()')
    expect(html).toContain('&quot;&gt;&lt;script&gt;bad()&lt;/script&gt;')
  })
})
