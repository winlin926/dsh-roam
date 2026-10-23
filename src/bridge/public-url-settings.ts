import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isPrivateAddress } from './lan-mobile-bridge.js'

export interface BridgeSettingsState {
  publicUrl?: string
}

export interface BridgeSettings {
  publicUrl: string | null
}

/**
 * The fixed public origin the phone uses instead of a LAN or quick-tunnel
 * address. Invalid values throw so the settings route can answer 400; an empty
 * string is the explicit "clear the setting" instruction and returns null.
 */
export function normalizePublicUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('公网域名格式无效。')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('公网域名必须使用 https。')
  }
  if (parsed.username || parsed.password) {
    throw new Error('公网域名不能包含用户信息。')
  }
  if (parsed.search || parsed.hash) {
    throw new Error('公网域名不能包含查询参数或锚点。')
  }
  if (parsed.pathname !== '/') {
    throw new Error('公网域名不能包含路径。')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname.includes('.')) {
    throw new Error('公网域名必须包含域名后缀。')
  }
  if (isBlockedHostname(hostname)) {
    throw new Error('公网域名不能是本机、内网或链路本地地址。')
  }
  return `${parsed.protocol}//${parsed.host}`
}

/**
 * Rejects every address the bridge itself would treat as LAN-only, plus the
 * loopback and link-local ranges a public origin must never point at.
 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (isPrivateAddress(host)) return true
  if (/^127\./.test(host) || /^0\./.test(host) || /^169\.254\./.test(host)) return true
  if (host === '::' || host === '::1' || /^fe[89ab][0-9a-f]:/.test(host)) return true

  // WHATWG normalizes an embedded IPv4 into two hexadecimal groups, so the
  // dotted form is gone by the time the URL is parsed.
  const mapped = /^::ffff:(?:([0-9]{1,3}(?:[.][0-9]{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(host)
  if (!mapped) return false
  const dotted = mapped[1]
  if (dotted) return isPrivateAddress(dotted) || /^127\.|^0\.|^169\.254\./.test(dotted)
  const high = Number.parseInt(mapped[2]!, 16)
  const first = high >> 8
  const second = high & 0xff
  if (first === 10 || first === 127 || (first === 192 && second === 168)) return true
  if (first === 172 && second >= 16 && second <= 31) return true
  if (first === 169 && second === 254) return true
  return first === 0
}

/** Tolerant read: a bad value reads as unconfigured instead of throwing. */
export function readBridgeSettings(path: string): BridgeSettings {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { publicUrl: null }
  }
  if (typeof raw !== 'object' || raw === null) return { publicUrl: null }
  const record = raw as { publicUrl?: unknown }
  return {
    publicUrl: typeof record.publicUrl === 'string' ? tryNormalize(normalizePublicUrl, record.publicUrl) : null,
  }
}

function tryNormalize(normalize: (value: string) => string | null, value: string): string | null {
  try {
    return normalize(value)
  } catch {
    return null
  }
}

/** Writes through a sibling temp file so a crash never leaves half a document. */
export async function writeBridgeSettings(path: string, settings: BridgeSettings): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${randomUUID()}.settings.tmp`)
  const document: BridgeSettingsState = {}
  if (settings.publicUrl) document.publicUrl = settings.publicUrl
  try {
    await writeFile(temporary, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8')
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * Builds before the pin store owned the password kept it in settings.json.
 * A six-digit value there is what the user typed, so it wins over a generated
 * pin already in the store; the key is then dropped so exactly one file decides
 * which password is in force.
 */
export async function migrateStoredInitialPin(
  settingsFile: string,
  adoptPin: (pin: string) => boolean,
): Promise<void> {
  const legacyPin = readStoredInitialPin(settingsFile)
  if (!legacyPin || !adoptPin(legacyPin)) return
  await writeBridgeSettings(settingsFile, readBridgeSettings(settingsFile))
}

function readStoredInitialPin(path: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { initialPin?: unknown }
    return typeof raw.initialPin === 'string' && /^[0-9]{6}$/.test(raw.initialPin) ? raw.initialPin : null
  } catch {
    return null
  }
}
