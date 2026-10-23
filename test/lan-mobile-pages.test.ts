import { describe, expect, it } from 'vitest'
import {
  applyPendingCreatedSessions,
  renderMobilePage,
  renderMobileReconnectPage,
  renderPairingPinPage,
} from '../lib/bridge/lan-mobile-pages.js'

function inlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('inline script missing')
  return match[1]!
}

describe('mobile browser page', () => {
  it('emits parseable browser JavaScript', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(() => new Function(inlineScript(html))).not.toThrow()
  })

  it('uses the DSH brand color and follows system dark mode', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(html).toContain('--brand:#4d6bfe')
    expect(html).toContain('@media(prefers-color-scheme:dark)')
    expect(html).toContain('src="/brand-logo/light"')
    expect(html).toContain('src="/brand-logo/dark"')
  })

  it('uses the browser-only brand and allows pinch zoom', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(html).toContain('<span>DSH Mobile</span>')
    expect(html).not.toContain('DSH Desktop')
    expect(html).not.toContain('maximum-scale=1')
    expect(html).not.toContain('/app-icon')
    expect(html).not.toContain('AI-HUB')
  })

  it('keeps a real chat header with the session title and safe-area padding', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(html).toContain('class="chat-head"')
    expect(html).toContain('id="chatTitle"')
    expect(html).toContain('env(safe-area-inset-bottom)')
    expect(html).toContain('.chat-open .messages{padding-top:60px')
    expect(html).toContain('const heading=document.getElementById(\'chatTitle\')')
  })

  it('uses mobile-sized touch targets and readable muted text', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(html).toContain('--muted:#62666d')
    expect(html).toContain('.icon-button{display:grid;place-items:center;width:44px;height:44px')
    expect(html).toContain('.new-session{display:flex;align-items:center;gap:5px;min-height:44px')
    expect(html).toContain('.question-close{width:44px;height:44px')
  })

  it('lands on the session list instead of opening the most recent chat', () => {
    const html = renderMobilePage({ locale: 'zh' })
    expect(html).toContain("history.replaceState({view:'sessions'},'')")
    expect(html).not.toContain('openRecentSession()')
  })

  it('localizes the remaining English interface labels', () => {
    const zh = renderMobilePage({ locale: 'zh' })
    expect(zh).toContain('"thinking":"思考过程"')
    expect(zh).toContain('"working":"正在处理…"')
    expect(zh).toContain('"preset":"预设"')
    expect(zh).not.toContain('Deep diving...')
    expect(zh).not.toContain('>Think<')
  })
})

describe('reconnect and pairing pages', () => {
  it('renders a same-origin reconnect action', () => {
    const html = renderMobileReconnectPage('zh', 'lan')
    expect(html).toContain('DSH Mobile')
    expect(html).toContain('重新连接')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })

  it('labels the public password field and announces status', () => {
    const html = renderPairingPinPage('zh')
    expect(html).toContain('<h1>')
    expect(html).toContain('id="pin"')
    expect(html).toContain('autocomplete="one-time-code"')
    expect(html).toContain('role="status"')
    expect(html).toContain('6 位')
  })
})

describe('pending created sessions', () => {
  const pending = [{ workspaceId: 'w1', sessionId: 's1' }]

  it('reapplies a session the server snapshot has not caught up to', () => {
    const workspaces = [{ workspaceId: 'w1', sessionIds: [] as string[] }]
    const still = applyPendingCreatedSessions(workspaces, pending, [{ sessionIds: [] }], [])
    expect(workspaces[0]!.sessionIds).toEqual(['s1'])
    expect(still).toEqual(pending)
  })

  it('drops the pending entry once any workspace lists the session', () => {
    const workspaces = [{ workspaceId: 'w1', sessionIds: [] as string[] }]
    const still = applyPendingCreatedSessions(workspaces, pending, [{ sessionIds: ['s1'] }], [])
    expect(still).toEqual([])
  })

  it('drops the pending entry once the session is archived', () => {
    const workspaces = [{ workspaceId: 'w1', sessionIds: [] as string[] }]
    const still = applyPendingCreatedSessions(workspaces, pending, [{ sessionIds: [] }], ['s1'])
    expect(still).toEqual([])
  })

  it('keeps the pending entry when its workspace is not in the snapshot', () => {
    const still = applyPendingCreatedSessions([], pending, [], [])
    expect(still).toEqual(pending)
  })
})
