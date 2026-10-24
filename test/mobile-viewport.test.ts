import { describe, expect, it } from 'vitest'
import { createViewport, nearBottom, preservePrepend, viewportMetrics } from '../lib/mobile/viewport.js'

describe('visual viewport metrics', () => {
  it('uses the layout viewport when the browser has no Visual Viewport API', () => {
    expect(viewportMetrics({ innerHeight: 800, document: { documentElement: { clientHeight: 780 } } })).toEqual({ height: 780, top: 0, keyboard: false })
  })

  it('uses the smaller visual viewport and its offset when the keyboard opens', () => {
    const metrics = viewportMetrics({
      innerHeight: 800,
      document: { documentElement: { clientHeight: 800 } },
      visualViewport: { height: 430, offsetTop: 18 },
    })
    expect(metrics).toEqual({ height: 430, top: 18, keyboard: true })
  })

  it('ignores small browser-chrome height changes instead of treating them as a keyboard', () => {
    const metrics = viewportMetrics({
      innerHeight: 800,
      document: { documentElement: { clientHeight: 790 } },
      visualViewport: { height: 760, offsetTop: 0 },
    })
    expect(metrics).toEqual({ height: 790, top: 0, keyboard: false })
  })

  it('keeps the larger layout height when no keyboard is open', () => {
    const metrics = viewportMetrics({
      innerHeight: 800,
      document: { documentElement: { clientHeight: 900 } },
      visualViewport: { height: 800, offsetTop: 0 },
    })
    expect(metrics).toEqual({ height: 900, top: 0, keyboard: false })
  })
})

describe('viewport DOM synchronization', () => {
  it('publishes keyboard and measured bottom-dock dimensions and disconnects listeners', async () => {
    const properties = new Map<string, string>()
    const classes = new Set<string>()
    const listeners = new Map<string, () => void>()
    const changes: unknown[] = []
    let scheduled: (() => void) | undefined
    const windowLike = {
      innerHeight: 800,
      visualViewport: {
        height: 800, offsetTop: 0,
        addEventListener: (name: string, listener: () => void) => listeners.set(`visual:${name}`, listener),
        removeEventListener: (name: string) => { listeners.delete(`visual:${name}`) },
      },
      document: {
        documentElement: {
          clientHeight: 800,
          style: { setProperty: (name: string, value: string) => properties.set(name, value) },
        },
        body: { classList: { toggle: (name: string, enabled: boolean) => { if (enabled) classes.add(name); else classes.delete(name) } } },
      },
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => { listeners.delete(name) },
      requestAnimationFrame: (callback: () => void) => { scheduled = callback; return 1 },
      cancelAnimationFrame: () => { scheduled = undefined },
    }
    const dock = { getBoundingClientRect: () => ({ height: 96 }) }
    const viewport = createViewport({ window: windowLike, dock, onChange: (value: unknown) => changes.push(value) })

    expect(properties.get('--app-height')).toBe('800px')
    expect(properties.get('--bottom-dock-h')).toBe('96px')
    expect(properties.get('--keyboard-open')).toBe('0')

    windowLike.visualViewport.height = 440
    windowLike.visualViewport.offsetTop = 12
    viewport.refresh()
    expect(scheduled).toBeTypeOf('function')
    scheduled!()
    expect(properties.get('--app-height')).toBe('440px')
    expect(properties.get('--app-top')).toBe('12px')
    expect(properties.get('--keyboard-open')).toBe('1')
    expect(classes.has('keyboard-open')).toBe(true)
    expect(changes).toHaveLength(2)

    viewport.disconnect()
    expect(listeners.size).toBe(0)
  })
})

describe('transcript scrolling primitives', () => {
  it('detects proximity to the latest message using the actual scroll geometry', () => {
    const box = { scrollHeight: 1_000, scrollTop: 810, clientHeight: 100 }
    expect(nearBottom(box)).toBe(true)
    expect(nearBottom({ ...box, scrollTop: 700 })).toBe(false)
  })

  it('preserves the visible record when older history is prepended', () => {
    const box = { scrollHeight: 1_000, scrollTop: 200, clientHeight: 300 }
    preservePrepend(box, () => { box.scrollHeight = 1_450 })
    expect(box.scrollTop).toBe(650)
  })
})
