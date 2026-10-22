import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('dsh-mobile-plugin mobile API contract', () => {
  it('pins the upstream version and exports the route table', () => {
    const root = dirname(require.resolve('dsh-mobile-plugin/package.json'))
    const packageJson = require(join(root, 'package.json')) as { version?: string }
    expect(packageJson.version).toBe('0.1.92')

    const mobileApi = require(join(root, 'lib/routes/mobile-api.js')) as {
      registerMobileRoutes?: unknown
    }
    expect(typeof mobileApi.registerMobileRoutes).toBe('function')
  })

  it('registers the AI-HUB endpoints dsh-roam depends on', () => {
    const root = dirname(require.resolve('dsh-mobile-plugin/package.json'))
    const mobileApi = require(join(root, 'lib/routes/mobile-api.js')) as {
      registerMobileRoutes(deps: Record<string, unknown>): void
    }
    const routes: string[] = []
    const upgrades: string[] = []
    mobileApi.registerMobileRoutes({
      registerRoute: (route: { path: string }) => routes.push(route.path),
      registerUpgradeRoute: (route: { path: string }) => upgrades.push(route.path),
      guarded: (handler: unknown) => handler,
      state: {},
      hostMetadata: () => ({}),
      getSidecarSnapshot: () => ({}),
      safeLanCandidates: () => [],
      lanPortInUse: () => 0,
      preview: { handleUpgrade: () => undefined },
      core: {},
      pairingApproval: {}
    })

    expect(routes).toEqual(expect.arrayContaining([
      '/api/mobile/v1/health',
      '/api/mobile/v1/pair',
      '/api/mobile/v1/status',
      '/api/mobile/v1/sessions',
      '/api/mobile/v1/session',
      '/api/mobile/v1/session/messages',
      '/api/mobile/v1/session/send',
      '/api/mobile/v1/events/stream'
    ]))
    expect(routes.every((path) => path.startsWith('/api/mobile/v1/'))).toBe(true)
    expect(upgrades).toContain('/api/mobile/v1/preview')
  })
})
