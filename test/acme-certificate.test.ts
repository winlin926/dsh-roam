import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCertificateManager, readCertificateExpiry } from '../lib/bridge/acme-certificate.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/example.test.crt', import.meta.url))
const FIXTURE_PEM = readFileSync(FIXTURE, 'utf8')
const FIXTURE_EXPIRES_AT = Date.parse('2036-10-19T15:35:29Z')

const directories: string[] = []

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-roam-acme-'))
  directories.push(directory)
  const deployDir = join(directory, 'deploy')
  mkdirSync(deployDir, { recursive: true })
  return {
    deployDir,
    stateDir: join(directory, 'acme'),
    challengeDir: join(directory, 'acme', 'challenge')
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('certificate manager', () => {
  it('reads the expiry of a deployed certificate', async () => {
    const paths = workspace()
    const path = join(paths.deployDir, 'dsh.example.com.crt')
    writeFileSync(path, FIXTURE_PEM)
    expect(await readCertificateExpiry(path)).toBe(FIXTURE_EXPIRES_AT)
    expect(await readCertificateExpiry(join(paths.deployDir, 'missing.crt'))).toBeUndefined()
  })

  it('reports no domain until a fixed public URL is configured', async () => {
    const paths = workspace()
    const manager = createCertificateManager({ ...paths, domain: () => undefined })
    const status = await manager.status()
    expect(status.domain).toBeUndefined()
    expect(status.pending).toBe(false)
  })

  it('issues once, writes both files, and then trusts the fresh certificate', async () => {
    const paths = workspace()
    let issued = 0
    const manager = createCertificateManager({
      ...paths,
      domain: () => 'dsh.example.com',
      issue: async () => {
        issued += 1
        return { certificate: FIXTURE_PEM, key: 'PRIVATE KEY' }
      }
    })
    const first = await manager.ensure()
    expect(issued).toBe(1)
    expect(first.expiresAt).toBe(FIXTURE_EXPIRES_AT)
    expect(first.certificatePath).toBe(join(paths.deployDir, 'dsh.example.com.crt'))
    expect(readFileSync(join(paths.deployDir, 'dsh.example.com.key'), 'utf8')).toBe('PRIVATE KEY')
    await manager.ensure()
    expect(issued).toBe(1)
  })

  it('renews when the deployed certificate is inside the renewal window', async () => {
    const paths = workspace()
    let issued = 0
    const manager = createCertificateManager({
      ...paths,
      domain: () => 'dsh.example.com',
      now: () => FIXTURE_EXPIRES_AT - 10 * 24 * 60 * 60 * 1000,
      issue: async () => {
        issued += 1
        return { certificate: FIXTURE_PEM, key: 'PRIVATE KEY' }
      }
    })
    await manager.ensure()
    await manager.ensure()
    expect(issued).toBe(2)
  })

  it('keeps the last error on the status instead of throwing it away', async () => {
    const paths = workspace()
    const manager = createCertificateManager({
      ...paths,
      domain: () => 'dsh.example.com',
      issue: async () => {
        throw new Error('rate limited')
      }
    })
    await expect(manager.ensure()).rejects.toThrow('rate limited')
    const status = await manager.status()
    expect(status.error).toBe('rate limited')
    expect(status.pending).toBe(false)
  })
})
