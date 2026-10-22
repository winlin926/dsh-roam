import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIpRegionResolver } from '../lib/bridge/ip-region.js'

const directories: string[] = []

function databaseDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-roam-ip2region-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

interface Segment {
  start: number[]
  end: number[]
  region: string
}

/** 按 ip2region xdb 的段表布局拼一个最小可用库，用来在没有真实库时验证解析。 */
function buildDatabase(version: 4 | 6, segments: Segment[]): Buffer {
  const width = version === 6 ? 38 : 14
  const header = 256
  const dataStart = header + segments.length * width
  const chunks: Buffer[] = []
  let dataOffset = dataStart
  const segmentBuffers = segments.map((segment) => {
    const record = Buffer.alloc(width)
    if (version === 4) {
      record.writeUInt32LE(segment.start[0]!, 0)
      record.writeUInt32LE(segment.end[0]!, 4)
    } else {
      Buffer.from(segment.start).copy(record, 0)
      Buffer.from(segment.end).copy(record, 16)
    }
    const data = Buffer.from(segment.region, 'utf8')
    record.writeUInt16LE(data.length, width - 6)
    record.writeUInt32LE(dataOffset, width - 4)
    dataOffset += data.length
    chunks.push(data)
    return record
  })
  const file = Buffer.alloc(dataOffset)
  file.writeUInt16LE(3, 0)
  file.writeUInt16LE(1, 2)
  file.writeUInt32LE(0, 4)
  file.writeUInt32LE(header, 8)
  file.writeUInt32LE(header + segments.length * width, 12)
  file.writeUInt16LE(version, 16)
  segmentBuffers.forEach((record, index) => record.copy(file, header + index * width))
  let offset = dataStart
  for (const chunk of chunks) {
    chunk.copy(file, offset)
    offset += chunk.length
  }
  return file
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0)
}

describe('offline IP region lookup', () => {
  it('resolves IPv4 addresses from the local database', () => {
    const directory = databaseDirectory()
    writeFileSync(
      join(directory, 'ip2region_v4.xdb'),
      buildDatabase(4, [
        { start: [ipv4ToNumber('1.0.0.0')], end: [ipv4ToNumber('1.0.255.255')], region: '中国|北京市|北京市|0|CN' },
        { start: [ipv4ToNumber('8.0.0.0')], end: [ipv4ToNumber('8.255.255.255')], region: 'United States|California|0|Google LLC|US' }
      ])
    )
    const resolver = createIpRegionResolver(directory)
    expect(resolver.describe('1.0.1.1')).toBe('中国 北京市 北京市')
    expect(resolver.describe('8.8.8.8')).toBe('United States California')
    expect(resolver.describe('9.9.9.9')).toBe('')
  })

  it('resolves IPv6 addresses with the 16-byte segment layout', () => {
    const directory = databaseDirectory()
    const start = Buffer.alloc(16)
    const end = Buffer.alloc(16, 0xff)
    writeFileSync(
      join(directory, 'ip2region_v6.xdb'),
      buildDatabase(6, [{ start: [...start], end: [...end], region: '中国|广东省|广州市|移动|CN' }])
    )
    const resolver = createIpRegionResolver(directory)
    expect(resolver.describe('2409:8963:1000::1')).toBe('中国 广东省 广州市')
  })

  it('returns an empty label when the database is not installed yet', () => {
    const resolver = createIpRegionResolver(databaseDirectory())
    expect(resolver.describe('1.0.1.1')).toBe('')
    expect(resolver.describe(undefined)).toBe('')
    expect(resolver.describe('not-an-ip')).toBe('')
  })

  it('retries loading after the database appears', () => {
    const directory = databaseDirectory()
    const resolver = createIpRegionResolver(directory)
    expect(resolver.describe('1.0.1.1')).toBe('')
    writeFileSync(
      join(directory, 'ip2region_v4.xdb'),
      buildDatabase(4, [
        { start: [ipv4ToNumber('1.0.0.0')], end: [ipv4ToNumber('1.0.255.255')], region: '中国|北京市|北京市|0|CN' },
      ]),
    )
    expect(resolver.describe('1.0.1.1')).toBe('中国 北京市 北京市')
  })

  it('treats a truncated database as unknown instead of throwing', () => {
    const directory = databaseDirectory()
    writeFileSync(join(directory, 'ip2region_v4.xdb'), Buffer.alloc(10))
    const resolver = createIpRegionResolver(directory)
    expect(resolver.describe('1.0.1.1')).toBe('')
  })
})
