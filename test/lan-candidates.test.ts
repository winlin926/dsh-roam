import { describe, expect, it } from 'vitest'
import { selectLanCandidates } from '../lib/bridge/lan-mobile-bridge.js'

const entry = (address: string) => ({ address, internal: false, family: 'IPv4' })

describe('LAN candidate selection', () => {
  it('keeps the preferred route first and drops virtual adapters', () => {
    const result = selectLanCandidates(
      {
        'VMware Network Adapter VMnet1': [entry('192.168.30.1')],
        'VMware Network Adapter VMnet8': [entry('192.168.137.1')],
        'vEthernet (WSL)': [entry('172.20.0.1')],
        WLAN: [entry('192.168.1.105')],
      },
      '192.168.1.105',
    )
    expect(result).toEqual(['192.168.1.105'])
  })

  it('keeps a preferred address even when its adapter looks virtual', () => {
    const result = selectLanCandidates({ 'VMware Network Adapter VMnet1': [entry('192.168.30.1')] }, '192.168.30.1')
    expect(result).toEqual(['192.168.30.1'])
  })

  it('drops loopback, link-local and public addresses', () => {
    const result = selectLanCandidates({
      Ethernet: [entry('127.0.0.1'), entry('169.254.1.1'), entry('8.8.8.8'), entry('10.0.0.5')],
    })
    expect(result).toEqual(['10.0.0.5'])
  })

  it('deduplicates the same address reported by two adapters', () => {
    const result = selectLanCandidates({ A: [entry('192.168.1.10')], B: [entry('192.168.1.10')] })
    expect(result).toEqual(['192.168.1.10'])
  })
})
