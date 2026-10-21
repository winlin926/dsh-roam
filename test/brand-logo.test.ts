import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { LanMobileBridge } from '../lib/bridge/lan-mobile-bridge.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BRAND_LOGOS = {
  light: fileURLToPath(new URL('../assets/logo-light.png', import.meta.url)),
  dark: fileURLToPath(new URL('../assets/logo-dark.png', import.meta.url)),
}
const variants = ['light', 'dark'] as const
const bridges: LanMobileBridge[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
})

describe('bridge brand logo route', () => {
  it('serves both logo variants as PNG bytes when brandLogoPaths is set', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      brandLogoPaths: BRAND_LOGOS,
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    for (const variant of variants) {
      const response = await fetch(`http://127.0.0.1:${snapshot.port}/brand-logo/${variant}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      const body = Buffer.from(await response.arrayBuffer())
      expect(body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)
    }
  })

  it('answers 404 for both logo variants when brandLogoPaths is unset', async () => {
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    for (const variant of variants) {
      const response = await fetch(`http://127.0.0.1:${snapshot.port}/brand-logo/${variant}`)
      expect(response.status).toBe(404)
    }
  })
})

describe('bundled brand assets', () => {
  it.each(variants)('ships logo-%s.png as a 70x40 RGBA PNG', async (variant) => {
    const body = await readFile(BRAND_LOGOS[variant])
    expect(body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)
    expect(body.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(body.readUInt32BE(16)).toBe(70)
    expect(body.readUInt32BE(20)).toBe(40)
    expect(body[24]).toBe(8)
    expect(body[25]).toBe(6)
  })
})
