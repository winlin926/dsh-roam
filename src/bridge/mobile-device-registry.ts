import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * 连过这台电脑的手机台账：谁配对的、从哪个 IP 连的、最后一次活动在什么时候。
 *
 * 设备凭据库（relay-device-credentials.json）只存哈希与时间，回答不了「这台手机是谁」，
 * 所以配对时把 App 报上来的设备信息、之后每个请求的来源 IP 单独记在这里。
 */

export interface MobileDeviceRecord {
  deviceId: string
  name?: string
  platform?: string
  osVersion?: string
  appVersion?: string
  firstSeenAt: number
  lastSeenAt: number
  lastIp?: string
}

export interface MobileDeviceRegistry {
  /** 配对时记录设备自报信息；缺 deviceId 的请求不登记。 */
  rememberPairing(device: unknown): void
  /** 每次移动 API 请求更新最后在线时间与来源 IP。 */
  noteActivity(deviceId: string, ip: string): void
  list(): MobileDeviceRecord[]
  forget(deviceId: string): void
}

/** 活动时间落盘节流：手机轮询很密，没必要每个请求都写一次盘。 */
const ACTIVITY_SAVE_INTERVAL_MS = 10_000

export function createMobileDeviceRegistry(file: string): MobileDeviceRegistry {
  let records: MobileDeviceRecord[] | null = null
  let lastSavedAt = 0

  function load(): MobileDeviceRecord[] {
    if (records) return records
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
      records = Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch {
      records = []
    }
    return records
  }

  function save(): void {
    const path = file
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(load(), null, 2), { mode: 0o600 })
    renameSync(temporary, path)
    lastSavedAt = Date.now()
  }

  function rememberPairing(device: unknown): void {
    const source = device && typeof device === 'object' ? (device as Record<string, unknown>) : {}
    const deviceId = text(source.deviceId) || text(source.id)
    if (!deviceId) return
    const now = Date.now()
    const existing = load().find((record) => record.deviceId === deviceId)
    // 重配对可能只带 deviceId；旧记录里的名称与系统版本必须留着，不能被空值覆盖。
    const name = text(source.name) || existing?.name
    const platform = text(source.platform) || existing?.platform
    const osVersion = text(source.osVersion) || existing?.osVersion
    const appVersion = text(source.appVersion) || existing?.appVersion
    const next: MobileDeviceRecord = {
      deviceId,
      ...(name ? { name } : {}),
      ...(platform ? { platform } : {}),
      ...(osVersion ? { osVersion } : {}),
      ...(appVersion ? { appVersion } : {}),
      firstSeenAt: existing ? existing.firstSeenAt : now,
      lastSeenAt: now,
      ...(existing?.lastIp ? { lastIp: existing.lastIp } : {})
    }
    records = [...load().filter((record) => record.deviceId !== deviceId), next]
    save()
  }

  function noteActivity(deviceId: string, ip: string): void {
    if (!deviceId) return
    const now = Date.now()
    const existing = load().find((record) => record.deviceId === deviceId)
    // 已被移除的设备不能因为一个迟到的请求复活：活动只更新既有台账。
    if (!existing) return
    existing.lastSeenAt = now
    if (ip) existing.lastIp = ip
    if (now - lastSavedAt >= ACTIVITY_SAVE_INTERVAL_MS) save()
  }

  function list(): MobileDeviceRecord[] {
    return [...load()].sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  }

  function forget(deviceId: string): void {
    records = load().filter((record) => record.deviceId !== deviceId)
    save()
  }

  return { rememberPairing, noteActivity, list, forget }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is MobileDeviceRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.deviceId === 'string' && record.deviceId.length > 0
    && typeof record.firstSeenAt === 'number' && typeof record.lastSeenAt === 'number'
}
