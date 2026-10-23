import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

describe('browser-only release surface', () => {
  it('ships no AI-HUB runtime dependency', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies).not.toHaveProperty('dsh-mobile-plugin')
    expect(JSON.stringify(pkg.keywords)).not.toContain('ai-hub')
    expect(existsSync(join(root, 'lib/bridge/mobile-api-host.js'))).toBe(false)
    expect(existsSync(join(root, 'lib/bridge/mobile-device-registry.js'))).toBe(false)
    expect(existsSync(join(root, 'lib/bridge/ip-region.js'))).toBe(false)
  })

  it('keeps old desktop and mobile API routes out of the bridge source', () => {
    const source = readFileSync(join(root, 'src/bridge/lan-mobile-bridge.ts'), 'utf8')
    const entry = readFileSync(join(root, 'src/index.js'), 'utf8')
    expect(source).not.toContain("url.pathname === '/desktop'")
    expect(source).not.toContain('/api/mobile')
    expect(source).not.toContain('mobileApi')
    expect(entry).not.toContain('/phone-bridge/devices/remove')
    expect(entry).not.toContain('/phone-bridge/desktop-url')
  })

  it('keeps the settings panel and phone page free of the removed client', () => {
    for (const file of ['src/client.js', 'src/bridge/lan-mobile-pages.ts']) {
      const source = readFileSync(join(root, file), 'utf8')
      expect(source, file).not.toContain('AI-HUB')
      expect(source, file).not.toContain('aihub')
      expect(source, file).not.toContain('/app-icon')
    }
  })
})
