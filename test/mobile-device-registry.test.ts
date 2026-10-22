import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMobileDeviceRegistry } from '../lib/bridge/mobile-device-registry.js'

const directories: string[] = []

function registryFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-roam-devices-'))
  directories.push(directory)
  return join(directory, 'mobile-devices.json')
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('mobile device registry', () => {
  it('keeps the device metadata reported at pairing', () => {
    const file = registryFile()
    const registry = createMobileDeviceRegistry(file)
    registry.rememberPairing({
      deviceId: 'device-1',
      name: 'Xiaomi 15',
      platform: 'android',
      osVersion: '15',
      appVersion: '0.2.139'
    })

    expect(registry.list()).toEqual([
      expect.objectContaining({
        deviceId: 'device-1',
        name: 'Xiaomi 15',
        platform: 'android',
        osVersion: '15',
        appVersion: '0.2.139'
      })
    ])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1)
  })

  it('records the last source address per device without dropping the name', () => {
    const file = registryFile()
    const registry = createMobileDeviceRegistry(file)
    registry.rememberPairing({ deviceId: 'device-1', name: 'Xiaomi 15' })
    registry.noteActivity('device-1', '223.5.5.5')

    const [record] = registry.list()
    expect(record.lastIp).toBe('223.5.5.5')
    expect(record.name).toBe('Xiaomi 15')
  })

  it('survives a restart and forgets a removed device', () => {
    const file = registryFile()
    const first = createMobileDeviceRegistry(file)
    first.rememberPairing({ deviceId: 'device-1', name: 'Xiaomi 15' })
    first.noteActivity('device-1', '223.5.5.5')

    const second = createMobileDeviceRegistry(file)
    expect(second.list().map((device) => device.deviceId)).toEqual(['device-1'])
    second.forget('device-1')
    expect(second.list()).toEqual([])
    expect(createMobileDeviceRegistry(file).list()).toEqual([])
  })

  it('ignores pairing payloads without a device id', () => {
    const registry = createMobileDeviceRegistry(registryFile())
    registry.rememberPairing({ name: 'anonymous' })
    expect(registry.list()).toEqual([])
  })
})
