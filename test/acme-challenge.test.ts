import { afterEach, describe, expect, it } from 'vitest'
import { request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LanMobileBridge } from '../lib/bridge/lan-mobile-bridge.js'

const bridges: LanMobileBridge[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()))
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      )
    })
    request.on('error', reject)
    request.end()
  })
}

describe('HTTP-01 challenge serving', () => {
  it('returns the challenge file without a pairing cookie', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-roam-challenge-'))
    directories.push(directory)
    writeFileSync(join(directory, 'token-1'), 'key-authorization-value')
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      lanAddress: '10.20.30.40',
      acmeChallengeDir: () => directory
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    const response = await get(snapshot.port!, '/.well-known/acme-challenge/token-1')
    expect(response.status).toBe(200)
    expect(response.body).toBe('key-authorization-value')
  })

  it('rejects traversal and unknown names', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-roam-challenge-'))
    directories.push(directory)
    const bridge = new LanMobileBridge({
      harnessUrl: () => 'http://127.0.0.1:9999',
      lanAddress: '10.20.30.40',
      acmeChallengeDir: () => directory
    })
    bridges.push(bridge)
    const snapshot = await bridge.start()
    expect((await get(snapshot.port!, '/.well-known/acme-challenge/..%2Fsecret')).status).toBe(404)
    expect((await get(snapshot.port!, '/.well-known/acme-challenge/missing')).status).toBe(404)
  })
})
