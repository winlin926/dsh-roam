import { X509Certificate } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { promisify } from 'node:util'
import { join } from 'node:path'
import * as acme from 'acme-client'

/**
 * 公网入口的证书：通过 80 端口的 HTTP 隧道完成 Let's Encrypt 的 HTTP-01 验证，
 * 把签发结果按 frpc 的约定写成 `<域名>.crt` / `<域名>.key`，由 frpc 在 443 上使用。
 */

export const ACME_CHALLENGE_PREFIX = '/.well-known/acme-challenge/'

/** 证书剩不到 30 天就续期：Let's Encrypt 有效期 90 天，留出足够重试余量。 */
const RENEW_BEFORE_MS = 30 * 24 * 60 * 60 * 1000
/** 运行时每 12 小时检查一次，够用且不至于频繁碰 ACME 服务端。 */
const execFileAsync = promisify(execFile)
const RENEW_INTERVAL_MS = 12 * 60 * 60 * 1000

export interface CertificateStatus {
  domain?: string
  certificatePath?: string
  keyPath?: string
  expiresAt?: number
  renewAt?: number
  /** frpc 生成的占位自签证书：有效期再长也不算「已签发」。 */
  selfSigned: boolean
  pending: boolean
  error?: string
}

export interface CertificateManagerOptions {
  /** 要签发的域名；固定公网域名没配时返回 undefined。 */
  domain(): string | undefined
  /** ACME 账户私钥与挑战文件的状态目录。 */
  stateDir: string
  /** HTTP-01 挑战文件目录，由桥在 80 端口上原样返回。 */
  challengeDir: string
  /** 证书落地目录，frpc 从这里加载。 */
  deployDir: string
  directoryUrl?: string
  now?(): number
  log?(message: string): void
  /** 测试注入：默认走 Let's Encrypt 的 HTTP-01。 */
  issue?(request: { domain: string; challengeDir: string }): Promise<{ certificate: string; key: string }>
}

export interface CertificateManager {
  status(): Promise<CertificateStatus>
  ensure(force?: boolean): Promise<CertificateStatus>
  startAutoRenew(): void
  stop(): void
}

export interface DeployedCertificate {
  expiresAt: number
  selfSigned: boolean
}

/** 读工作目录里现有的证书；文件缺失或解析失败都返回 undefined。 */
export async function readDeployedCertificate(path: string): Promise<DeployedCertificate | undefined> {
  try {
    const certificate = new X509Certificate(await readFile(path, 'utf8'))
    const expiresAt = Date.parse(certificate.validTo) || undefined
    if (!expiresAt) return undefined
    return { expiresAt, selfSigned: certificate.issuer === certificate.subject }
  } catch {
    return undefined
  }
}

export function createCertificateManager(options: CertificateManagerOptions): CertificateManager {
  const now = options.now ?? Date.now
  let pending = false
  let lastError: { message: string; domain: string } | undefined
  let running: Promise<CertificateStatus> | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  const paths = (domain: string) => ({
    certificatePath: join(options.deployDir, `${domain}.crt`),
    keyPath: join(options.deployDir, `${domain}.key`)
  })

  async function status(): Promise<CertificateStatus> {
    const domain = options.domain()
    if (!domain) return { selfSigned: false, pending }
    const target = paths(domain)
    const deployed = await readDeployedCertificate(target.certificatePath)
    const error = lastError?.domain === domain ? lastError.message : undefined
    return {
      domain,
      ...target,
      ...(deployed ? { expiresAt: deployed.expiresAt, renewAt: deployed.expiresAt - RENEW_BEFORE_MS } : {}),
      selfSigned: deployed?.selfSigned === true,
      pending,
      ...(error ? { error } : {})
    }
  }

  async function ensureOnce(force = false): Promise<CertificateStatus> {
    const domain = options.domain()
    if (!domain) throw new Error('还没有配置固定公网域名。')
    const current = await status()
    if (!force && !current.selfSigned && current.expiresAt && current.expiresAt - now() > RENEW_BEFORE_MS) return current
    pending = true
    try {
      const issued = options.issue
        ? await options.issue({ domain, challengeDir: options.challengeDir })
        : await requestCertificate({
            domain,
            challengeDir: options.challengeDir,
            stateDir: options.stateDir,
            directoryUrl: options.directoryUrl
          })
      const target = paths(domain)
      await writeAtomic(target.certificatePath, issued.certificate)
      await writeAtomic(target.keyPath, issued.key, 0o600)
      await restrictPrivateKeyAcl(target.keyPath)
      lastError = undefined
    } catch (error) {
      lastError = { message: error instanceof Error ? error.message : String(error), domain }
      options.log?.(`证书签发失败：${lastError.message}`)
      throw error
    } finally {
      pending = false
    }
    return status()
  }

  function ensure(force = false): Promise<CertificateStatus> {
    if (!running) {
      running = ensureOnce(force).finally(() => {
        running = undefined
      })
    }
    return running
  }

  return {
    status,
    ensure,
    startAutoRenew() {
      if (timer) return
      timer = setInterval(() => {
        void ensure().catch(() => undefined)
      }, RENEW_INTERVAL_MS)
      timer.unref?.()
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** 走 Let's Encrypt 的 HTTP-01：挑战文件写在 webroot 里，桥在 80 端口上返回它。 */
async function requestCertificate(request: {
  domain: string
  challengeDir: string
  stateDir: string
  directoryUrl?: string
}): Promise<{ certificate: string; key: string }> {
  const accountKey = await readOrCreateAccountKey(request.stateDir)
  const client = new acme.Client({
    directoryUrl: request.directoryUrl ?? acme.directory.letsencrypt.production,
    accountKey
  })
  await client.createAccount({ termsOfServiceAgreed: true })
  const [key, csr] = await acme.crypto.createCsr({
    commonName: request.domain,
    altNames: [request.domain]
  })
  const certificate = await client.auto({
    csr,
    termsOfServiceAgreed: true,
    challengePriority: ['http-01'],
    challengeCreateFn: async (_authorization, challenge, keyAuthorization) => {
      await mkdir(request.challengeDir, { recursive: true })
      await writeFile(join(request.challengeDir, challenge.token), keyAuthorization)
    },
    challengeRemoveFn: async (_authorization, challenge) => {
      await unlink(join(request.challengeDir, challenge.token)).catch(() => undefined)
    }
  })
  return { certificate, key: key.toString() }
}

async function readOrCreateAccountKey(stateDir: string): Promise<Buffer> {
  const path = join(stateDir, 'acme-account.key')
  try {
    return await readFile(path)
  } catch {
    await mkdir(stateDir, { recursive: true })
    const key = await acme.crypto.createPrivateKey()
    await writeAtomic(path, key, 0o600)
    await restrictPrivateKeyAcl(path)
    return key
  }
}

/**
 * Windows ignores POSIX mode bits. The frpc certificate directory may be
 * world-readable, so the key is re-ACLed to the current user, SYSTEM and
 * Administrators after every write. Other local accounts lose access.
 */
export async function restrictPrivateKeyAcl(path: string): Promise<void> {
  if (process.platform !== 'win32') return
  const user = userInfo().username
  try {
    await execFileAsync('icacls', [
      path,
      '/inheritance:r',
      '/grant:r',
      `${user}:(F)`,
      '*S-1-5-18:(F)',
      '*S-1-5-32-544:(F)'
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`无法收紧私钥文件权限：${message}`)
  }
}

async function writeAtomic(path: string, body: string | Buffer, mode = 0o644): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, body, { mode })
  await rename(temporary, path)
}
