import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isIP } from 'node:net'

/**
 * 离线归属地库：ip2region 的 xdb 二进制。
 *
 * 只读本地文件，不联网查询——手机 IP 属于隐私数据，查询本身不该出这台电脑。
 * 两个文件分开存放：IPv4 约 11MB，IPv6 约 37MB，按实际遇到的地址类型惰性加载。
 */

const SOURCES = {
  v4: [
    'https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data/ip2region_v4.xdb',
    'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v4.xdb'
  ],
  v6: [
    'https://cdn.jsdelivr.net/gh/lionsoul2014/ip2region@master/data/ip2region_v6.xdb',
    'https://raw.githubusercontent.com/lionsoul2014/ip2region/master/data/ip2region_v6.xdb'
  ]
} as const

/** xdb 段记录宽度：IPv4 为 start(4)+end(4)+len(2)+ptr(4)，IPv6 的两个地址各占 16 字节。 */
const RECORD_WIDTH = { 4: 14, 6: 38 } as const
const HEADER_IP_VERSION_OFFSET = 16
const HEADER_START_PTR_OFFSET = 8
const HEADER_END_PTR_OFFSET = 12
const REGION_CACHE_LIMIT = 512

export interface IpRegionResolver {
  /** 形如「中国 江苏省 南京市」；库未装好或查不到时返回空串。 */
  describe(ip: string | undefined): string
  /** 下载缺失的库文件；已存在时直接返回 true。 */
  ensureInstalled(): Promise<boolean>
}

export function ipRegionDirectory(dataDir: string): string {
  return join(dataDir, 'ip2region')
}

export function createIpRegionResolver(directory: string): IpRegionResolver {
  const tables = new Map<4 | 6, Buffer | null>()
  const cache = new Map<string, string>()

  function table(version: 4 | 6): Buffer | null {
    const cached = tables.get(version)
    if (cached !== undefined) return cached
    const file = join(directory, version === 4 ? 'ip2region_v4.xdb' : 'ip2region_v6.xdb')
    let loaded: Buffer | null = null
    try {
      loaded = readFileSync(file)
    } catch {
      loaded = null
    }
    // 缺库不缓存：下载完成后下一次查询要能读到，而不是永远返回空。
    if (loaded) tables.set(version, loaded)
    return loaded
  }

  function describe(ip: string | undefined): string {
    if (!ip) return ''
    const version = isIP(ip)
    if (version !== 4 && version !== 6) return ''
    const cached = cache.get(ip)
    if (cached !== undefined) return cached
    const buffer = table(version)
    let region = ''
    try {
      region = buffer ? search(buffer, ip, version) : ''
    } catch {
      region = ''
    }
    const label = prettify(region)
    // 空结果不缓存：库可能刚下载完，下一次查询应重新尝试。
    if (label) {
      if (cache.size >= REGION_CACHE_LIMIT) cache.clear()
      cache.set(ip, label)
    }
    return label
  }

  async function ensureInstalled(): Promise<boolean> {
    mkdirSync(directory, { recursive: true })
    let installed = true
    for (const version of ['v4', 'v6'] as const) {
      const file = join(directory, version === 'v4' ? 'ip2region_v4.xdb' : 'ip2region_v6.xdb')
      if (existsSync(file) && statSync(file).size > 0) continue
      installed = (await download(SOURCES[version], file)) && installed
    }
    return installed
  }

  return { describe, ensureInstalled }
}

async function download(sources: readonly string[], file: string): Promise<boolean> {
  for (const source of sources) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok) continue
      const body = Buffer.from(await response.arrayBuffer())
      if (body.length === 0) continue
      const temporary = `${file}.tmp`
      writeFileSync(temporary, body)
      renameSync(temporary, file)
      return true
    } catch {
      continue
    }
  }
  return false
}

/** 在 xdb 段表里二分查找，返回原始 region 串（国家|省|市|ISP|国家代码）。 */
function search(buffer: Buffer, ip: string, version: 4 | 6): string {
  if (buffer.length < 256) return ''
  const width = RECORD_WIDTH[version]
  const declared = buffer.readUInt16LE(HEADER_IP_VERSION_OFFSET)
  if (declared !== version) return ''
  let low = buffer.readUInt32LE(HEADER_START_PTR_OFFSET)
  let high = buffer.readUInt32LE(HEADER_END_PTR_OFFSET) - width
  const key = version === 4 ? ipv4ToNumber(ip) : ipv6ToBuffer(ip)
  if (key === null) return ''
  while (low <= high) {
    const middle = low + Math.floor((high - low) / (2 * width)) * width
    if (version === 4) {
      const start = buffer.readUInt32LE(middle)
      const end = buffer.readUInt32LE(middle + 4)
      const value = key as number
      if (value < start) { high = middle - width; continue }
      if (value > end) { low = middle + width; continue }
      return readRegion(buffer, middle, width)
    }
    const start = buffer.subarray(middle, middle + 16)
    const end = buffer.subarray(middle + 16, middle + 32)
    const value = key as Buffer
    if (Buffer.compare(value, start) < 0) { high = middle - width; continue }
    if (Buffer.compare(value, end) > 0) { low = middle + width; continue }
    return readRegion(buffer, middle, width)
  }
  return ''
}

function readRegion(buffer: Buffer, middle: number, width: number): string {
  if (middle < 0 || middle + width > buffer.length) return ''
  const length = buffer.readUInt16LE(middle + width - 6)
  const pointer = buffer.readUInt32LE(middle + width - 4)
  if (pointer + length > buffer.length) return ''
  return buffer.subarray(pointer, pointer + length).toString('utf8')
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    const byte = Number(part)
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null
    value = ((value << 8) | byte) >>> 0
  }
  return value
}

function ipv6ToBuffer(ip: string): Buffer | null {
  const [head, tail] = ip.split('::') as [string, string | undefined]
  const headParts = head ? head.split(':') : []
  const tailParts = tail === undefined ? [] : tail.split(':')
  const fill = 8 - headParts.length - tailParts.length
  if (fill < 0 || (tail === undefined && fill !== 0)) return null
  const parts = [...headParts, ...Array<string>(fill).fill('0'), ...tailParts]
  const buffer = Buffer.alloc(16)
  for (const [index, part] of parts.entries()) {
    const value = Number.parseInt(part || '0', 16)
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null
    buffer.writeUInt16BE(value, index * 2)
  }
  return buffer
}

/** 「中国|江苏省|南京市|0|CN」→「中国 江苏省 南京市」；占位 0 与 ISP 不展示。 */
function prettify(region: string): string {
  if (!region) return ''
  const [country, province, city] = region.split('|').map((part) => part.trim())
  const visible = [country, province, city].filter((part) => part && part !== '0')
  return visible.join(' ')
}
