import { afterEach, describe, expect, it } from 'vitest'
import { X509Certificate } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCertificateManager, readDeployedCertificate } from '../lib/bridge/acme-certificate.js'

const SELF_SIGNED = readFileSync(
  fileURLToPath(new URL('./fixtures/example.test.crt', import.meta.url)),
  'utf8'
)
const ISSUED = readFileSync(fileURLToPath(new URL('./fixtures/issued.test.crt', import.meta.url)), 'utf8')
const expiryOf = (pem: string): number => Date.parse(new X509Certificate(pem).validTo)

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

describe('deployed certificate inspection', () => {
  it('recognises the placeholder certificate frpc signs for itself', async () => {
    const paths = workspace()
    const path = join(paths.deployDir, 'dsh.example.com.crt')
    writeFileSync(path, SELF_SIGNED)
    expect(await readDeployedCertificate(path)).toEqual({ expiresAt: expiryOf(SELF_SIGNED), selfSigned: true })
  })

  it('treats a certificate signed by someone else as issued', async () => {
    const paths = workspace()
    const path = join(paths.deployDir, 'dsh.example.com.crt')
    writeFileSync(path, ISSUED)
    expect(await readDeployedCertificate(path)).toEqual({ expiresAt: expiryOf(ISSUED), selfSigned: false })
  })

  it('returns undefined for a missing file', async () => {
    const paths = workspace()
    expect(await readDeployedCertificate(join(paths.deployDir, 'missing.crt'))).toBeUndefined()
  })
})

describe('certificate manager', () => {
  it('reports no domain until a fixed public URL is configured', async () => {
    const paths = workspace()
    const manager = createCertificateManager({ ...paths, domain: () => undefined })
    const status = await manager.status()
    expect(status.domain).toBeUndefined()
    expect(status.selfSigned).toBe(false)
    expect(status.pending).toBe(false)
  })

  it('replaces the self-signed placeholder even though it is still valid', async () => {
    const paths = workspace()
    writeFileSync(join(paths.deployDir, 'dsh.example.com.crt'), SELF_SIGNED)
    let issued = 0
    const manager = createCertificateManager({
      ...paths,
      domain: () => 'dsh.example.com',
      issue: async () => {
        issued += 1
        return { certificate: ISSUED, key: 'PRIVATE KEY' }
      }
    })
    const status = await manager.ensure()
    expect(issued).toBe(1)
    expect(status.selfSigned).toBe(false)
    expect(readFileSync(join(paths.deployDir, 'dsh.example.com.key'), 'utf8')).toBe('PRIVATE KEY')
    await manager.ensure()
    expect(issued).toBe(1)
  })

  it('renews when the deployed certificate is inside the renewal window', async () => {
    const paths = workspace()
    writeFileSync(join(paths.deployDir, 'dsh.example.com.crt'), ISSUED)
    let issued = 0
    const manager = createCertificateManager({
      ...paths,
      domain: () => 'dsh.example.com',
      now: () => expiryOf(ISSUED) - 10 * 24 * 60 * 60 * 1000,
      issue: async () => {
        issued += 1
        return { certificate: ISSUED, key: 'PRIVATE KEY' }
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
